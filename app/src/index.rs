use std::path::Path;

pub const HASH_SIZE: usize = 8;

const AV_NOPTS_VALUE: i64 = i64::MIN;

#[derive(Debug, Clone)]
pub struct FrameInfo {
    pub pts: i64,
    pub repeat_pict: i32,
    pub format: i32,
    pub width: i32,
    pub height: i32,
    pub key_frame: bool,
    pub tff: bool,
    pub hash: [u8; HASH_SIZE],
}

impl FrameInfo {
    pub fn pts_is_valid(&self) -> bool {
        self.pts != AV_NOPTS_VALUE
    }
}

#[derive(Debug, Clone)]
pub struct VideoIndex {
    pub version_major: u16,
    pub version_minor: u16,
    pub file_size: i64,
    pub track: i32,
    pub view_id: i32,
    pub hwdevice: String,
    pub extra_hw_frames: i32,
    pub lavf_options: Vec<(String, String)>,
    pub last_frame_duration: i64,
    pub frames: Vec<FrameInfo>,
}

impl VideoIndex {
    pub fn keyframes(&self) -> Vec<u64> {
        self.frames
            .iter()
            .enumerate()
            .filter(|(_, f)| f.key_frame)
            .map(|(i, _)| i as u64)
            .collect()
    }
}

struct Reader<'a> {
    data: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(data: &'a [u8]) -> Self {
        Reader { data, pos: 0 }
    }

    fn take(&mut self, n: usize) -> Result<&'a [u8], String> {
        let end = self.pos.checked_add(n).ok_or("index truncated")?;
        let slice = self.data.get(self.pos..end).ok_or("index truncated")?;
        self.pos = end;
        Ok(slice)
    }

    fn u8(&mut self) -> Result<u8, String> {
        Ok(self.take(1)?[0])
    }

    fn i32(&mut self) -> Result<i32, String> {
        let b = self.take(4)?;
        Ok(i32::from_le_bytes([b[0], b[1], b[2], b[3]]))
    }

    fn i64(&mut self) -> Result<i64, String> {
        let b = self.take(8)?;
        Ok(i64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]))
    }

    fn string(&mut self) -> Result<String, String> {
        let n = self.i32()?;
        if !(0..=1000).contains(&n) {
            return Err("index string length out of range".into());
        }
        let b = self.take(n as usize)?;
        Ok(String::from_utf8_lossy(b).into_owned())
    }

    fn hash(&mut self) -> Result<[u8; HASH_SIZE], String> {
        let b = self.take(HASH_SIZE)?;
        let mut h = [0u8; HASH_SIZE];
        h.copy_from_slice(b);
        Ok(h)
    }
}

pub fn parse(bytes: &[u8]) -> Result<VideoIndex, String> {
    let mut r = Reader::new(bytes);

    let magic = r.take(4)?;
    if magic != b"BS2V" {
        return Err(format!(
            "not a BestSource video index (magic {:?})",
            String::from_utf8_lossy(magic)
        ));
    }
    let version = r.i32()?;
    let version_major = ((version >> 16) & 0xffff) as u16;
    let version_minor = (version & 0xffff) as u16;
    let _avutil = r.i32()?;
    let _avformat = r.i32()?;
    let _avcodec = r.i32()?;

    let file_size = r.i64()?;
    let track = r.i32()?;
    let view_id = r.i32()?;
    let hwdevice = r.string()?;
    let extra_hw_frames = r.i32()?;

    let opt_count = r.i32()?;
    if !(0..=1000).contains(&opt_count) {
        return Err("index LAVF option count out of range".into());
    }
    let mut lavf_options = Vec::with_capacity(opt_count as usize);
    for _ in 0..opt_count {
        let key = r.string()?;
        let val = r.string()?;
        lavf_options.push((key, val));
    }

    let num_frames = r.i64()?;
    if num_frames < 0 {
        return Err("index frame count is negative".into());
    }
    let last_frame_duration = r.i64()?;

    let dict_size = r.i32()?;
    if !(0..=0xFF).contains(&dict_size) {
        return Err("index dictionary size out of range".into());
    }

    let n = num_frames as usize;
    // Never reserve past the remaining byte count: each frame is at least 1 byte on the
    // wire, so a bogus huge `num_frames` can't force a giant allocation.
    let mut frames = Vec::with_capacity(n.min(bytes.len()));

    if dict_size > 0 {
        let mut last_pts = r.i64()?;
        let mut dict = Vec::with_capacity(dict_size as usize);
        for _ in 0..dict_size {
            let pts = r.i64()?;
            let repeat_pict = r.i32()?;
            let format = r.i32()?;
            let width = r.i32()?;
            let height = r.i32()?;
            let flags = r.u8()?;
            dict.push((pts, repeat_pict, format, width, height, flags));
        }
        for _ in 0..n {
            let key = r.u8()? as usize;
            let &(delta_pts, repeat_pict, format, width, height, flags) =
                dict.get(key).ok_or("index dictionary key out of range")?;
            let hash = r.hash()?;
            let pts = if delta_pts != AV_NOPTS_VALUE {
                last_pts = last_pts.wrapping_add(delta_pts);
                last_pts
            } else {
                AV_NOPTS_VALUE
            };
            frames.push(FrameInfo {
                pts,
                repeat_pict,
                format,
                width,
                height,
                key_frame: flags & 1 != 0,
                tff: flags & 2 != 0,
                hash,
            });
        }
    } else {
        for _ in 0..n {
            let hash = r.hash()?;
            let pts = r.i64()?;
            let repeat_pict = r.i32()?;
            let format = r.i32()?;
            let width = r.i32()?;
            let height = r.i32()?;
            let flags = r.u8()?;
            frames.push(FrameInfo {
                pts,
                repeat_pict,
                format,
                width,
                height,
                key_frame: flags & 1 != 0,
                tff: flags & 2 != 0,
                hash,
            });
        }
    }

    Ok(VideoIndex {
        version_major,
        version_minor,
        file_size,
        track,
        view_id,
        hwdevice,
        extra_hw_frames,
        lavf_options,
        last_frame_duration,
        frames,
    })
}

pub fn parse_file(path: &Path) -> Result<VideoIndex, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    parse(&bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Builder(Vec<u8>);
    impl Builder {
        fn magic(&mut self) -> &mut Self {
            self.0.extend_from_slice(b"BS2V");
            self
        }
        fn u8(&mut self, v: u8) -> &mut Self {
            self.0.push(v);
            self
        }
        fn i32(&mut self, v: i32) -> &mut Self {
            self.0.extend_from_slice(&v.to_le_bytes());
            self
        }
        fn i64(&mut self, v: i64) -> &mut Self {
            self.0.extend_from_slice(&v.to_le_bytes());
            self
        }
        fn string(&mut self, s: &str) -> &mut Self {
            self.i32(s.len() as i32);
            self.0.extend_from_slice(s.as_bytes());
            self
        }
        fn hash(&mut self, seed: u8) -> &mut Self {
            self.0.extend_from_slice(&[seed; HASH_SIZE]);
            self
        }
    }

    fn header(b: &mut Builder, num_frames: i64) {
        b.magic()
            .i32((20 << 16) | 0)
            .i32(0)
            .i32(0)
            .i32(0)
            .i64(123)
            .i32(0)
            .i32(0)
            .string("")
            .i32(0)
            .i32(0)
            .i64(num_frames)
            .i64(40);
    }

    #[test]
    fn parses_dictionary_encoding() {
        let mut b = Builder::default();
        header(&mut b, 4);
        b.i32(2)
            .i64(0);
        b.i64(10).i32(0).i32(0).i32(320).i32(240).u8(1);
        b.i64(10).i32(0).i32(0).i32(320).i32(240).u8(0);
        b.u8(0).hash(1);
        b.u8(1).hash(2);
        b.u8(1).hash(3);
        b.u8(0).hash(4);

        let idx = parse(&b.0).expect("parse");
        assert_eq!(idx.version_major, 20);
        assert_eq!(idx.frames.len(), 4);
        assert_eq!(idx.keyframes(), vec![0, 3]);
        assert_eq!(idx.frames.iter().map(|f| f.pts).collect::<Vec<_>>(), vec![10, 20, 30, 40]);
        assert_eq!(idx.frames[0].width, 320);
        assert_eq!(idx.frames[0].height, 240);
    }

    #[test]
    fn parses_flat_encoding() {
        let mut b = Builder::default();
        header(&mut b, 3);
        b.i32(0);
        for (i, (pts, flags)) in [(0i64, 0u8), (100, 1), (200, 0)].iter().enumerate() {
            b.hash(i as u8).i64(*pts).i32(0).i32(1).i32(640).i32(360).u8(*flags);
        }
        let idx = parse(&b.0).expect("parse");
        assert_eq!(idx.frames.len(), 3);
        assert_eq!(idx.keyframes(), vec![1]);
        assert_eq!(idx.frames[2].pts, 200);
        assert_eq!(idx.frames[1].format, 1);
    }

    #[test]
    fn rejects_foreign_and_truncated() {
        assert!(parse(b"BS2A\0\0\0\0").is_err());
        assert!(parse(b"XXXX").is_err());
        let mut b = Builder::default();
        header(&mut b, 10);
        b.i32(0);
        assert!(parse(&b.0).is_err());
    }
}
