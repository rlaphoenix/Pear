use crate::config::{self, Config, Crop, Segment};
use crate::pipeline::{self, ScaleOpts};
use crate::vapoursynth::{self, SourceInfo};
use ab_glyph::FontVec;
use base64::Engine;
use image::RgbaImage;
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::VecDeque;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};
use tauri::{AppHandle, Manager, State};

#[derive(Clone)]
pub struct AppState {
    font: Arc<Option<FontVec>>,
    type_cache: Arc<Mutex<HashMap<String, String>>>,
    keyframe_cache: Arc<Mutex<HashMap<String, Vec<u64>>>>,
    probe_cache: Arc<Mutex<HashMap<u64, SourceInfo>>>,
    transport_cache: Arc<Mutex<TransportCache>>,
    pending_project: Arc<Mutex<Option<String>>>,
    project_lock: Arc<Mutex<Option<ProjectLock>>>,
}

struct ProjectLock {
    path: PathBuf,
    /// Never read; its sole purpose is to stay open for its lifetime so the OS lock holds.
    _handle: std::fs::File,
}

fn open_project_lock(path: &Path) -> Result<std::fs::File, String> {
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        // Omitting FILE_SHARE_WRITE and FILE_SHARE_DELETE makes any external open-for-write,
        // rename or delete fail with a sharing violation while we hold this handle.
        const FILE_SHARE_READ: u32 = 0x0000_0001;
        std::fs::OpenOptions::new()
            .read(true)
            .share_mode(FILE_SHARE_READ)
            .open(path)
            .map_err(|e| format!("{}: {e}", path.display()))
    }
    #[cfg(not(windows))]
    {
        std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))
    }
}

struct TransportCache {
    next: u64,
    map: HashMap<u64, Arc<Vec<u8>>>,
    order: VecDeque<u64>,
    bytes: usize,
    cap: usize,
}

impl TransportCache {
    fn new(cap: usize) -> Self {
        TransportCache { next: 0, map: HashMap::new(), order: VecDeque::new(), bytes: 0, cap }
    }

    fn put(&mut self, buf: Vec<u8>) -> u64 {
        let id = self.next;
        self.next += 1;
        self.bytes += buf.len();
        self.map.insert(id, Arc::new(buf));
        self.order.push_back(id);
        while self.bytes > self.cap && self.order.len() > 1 {
            if let Some(old) = self.order.pop_front() {
                self.remove_entry(old);
            }
        }
        id
    }

    fn get(&self, id: u64) -> Option<Arc<Vec<u8>>> {
        self.map.get(&id).cloned()
    }

    fn remove(&mut self, id: u64) {
        if let Some(pos) = self.order.iter().position(|&x| x == id) {
            self.order.remove(pos);
        }
        self.remove_entry(id);
    }

    fn remove_entry(&mut self, id: u64) {
        if let Some(buf) = self.map.remove(&id) {
            self.bytes -= buf.len();
        }
    }

    fn usage(&self) -> (u64, u64) {
        (self.bytes as u64, self.cap as u64)
    }
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            font: Arc::new(load_font()),
            type_cache: Arc::new(Mutex::new(HashMap::new())),
            keyframe_cache: Arc::new(Mutex::new(HashMap::new())),
            probe_cache: Arc::new(Mutex::new(HashMap::new())),
            transport_cache: Arc::new(Mutex::new(TransportCache::new(256 * 1024 * 1024))),
            pending_project: Arc::new(Mutex::new(None)),
            project_lock: Arc::new(Mutex::new(None)),
        }
    }

    pub fn lock_project(&self, path: &str) -> Result<(), String> {
        let p = PathBuf::from(path);
        let mut slot = self.project_lock.lock().unwrap();
        if slot.as_ref().is_some_and(|l| l.path == p) {
            return Ok(());
        }
        *slot = None;
        let handle = open_project_lock(&p)?;
        *slot = Some(ProjectLock { path: p, _handle: handle });
        Ok(())
    }

    pub fn unlock_project(&self) {
        if let Ok(mut slot) = self.project_lock.lock() {
            *slot = None;
        }
    }

    /// Run `write` with our own hold on `path` released, then reacquire it - because the
    /// deny-delete hold we keep on the open project would otherwise block our own rename-over.
    fn with_project_write<F>(&self, path: &Path, write: F) -> Result<(), String>
    where
        F: FnOnce() -> Result<(), String>,
    {
        let mut slot = self.project_lock.lock().unwrap();
        let held = slot.as_ref().is_some_and(|l| l.path == path);
        if held {
            *slot = None;
        }
        let res = write();
        if held {
            if let Ok(handle) = open_project_lock(path) {
                *slot = Some(ProjectLock { path: path.to_path_buf(), _handle: handle });
            }
        }
        res
    }

    fn put_transport_frame(&self, buf: Vec<u8>) -> u64 {
        self.transport_cache.lock().unwrap().put(buf)
    }

    fn get_transport_frame(&self, id: u64) -> Option<Arc<Vec<u8>>> {
        self.transport_cache.lock().unwrap().get(id)
    }

    fn release_transport_frames(&self, ids: &[u64]) {
        let mut tc = self.transport_cache.lock().unwrap();
        for &id in ids {
            tc.remove(id);
        }
    }

    fn transport_mem(&self) -> (u64, u64) {
        self.transport_cache.lock().unwrap().usage()
    }

    pub fn set_pending_project(&self, path: String) {
        if let Ok(mut p) = self.pending_project.lock() {
            *p = Some(path);
        }
    }
}

#[derive(Debug, Clone)]
struct SourceDefaults {
    sar: f64,
    dar: String,
    matrix: String,
    range: String,
    transfer: String,
    primaries: String,
    hdr: String,
    dv_profile: Option<u8>,
    dv_bl_compat: Option<u8>,
}

fn load_font() -> Option<FontVec> {
    let candidates = [
        "C:/Windows/Fonts/arialbd.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeui.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ];
    for c in candidates {
        if let Ok(bytes) = std::fs::read(c) {
            if let Ok(font) = FontVec::try_from_vec(bytes) {
                return Some(font);
            }
        }
    }
    None
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TonemapParams {
    #[serde(default)]
    pub on: bool,
    #[serde(default)]
    pub src: String,
    #[serde(default)]
    pub func: String,
    #[serde(default)]
    pub gamut: String,
    #[serde(default)]
    pub peak: bool,
    #[serde(default)]
    pub dst_nits: Option<f64>,
    #[serde(default)]
    pub src_nits: Option<f64>,
    #[serde(default)]
    pub use_dovi: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceParams {
    pub path: String,
    #[serde(default)]
    pub crop: Crop,
    #[serde(default)]
    pub script: String,
    #[serde(default)]
    pub segments: Vec<Segment>,
    #[serde(default)]
    pub deinterlace: bool,
    #[serde(default)]
    pub deint_kernel: String,
    #[serde(default)]
    pub deint_double: bool,
    #[serde(default)]
    pub dar: String,
    #[serde(default)]
    pub dar_algo: String,
    #[serde(default)]
    pub matrix: String,
    #[serde(default)]
    pub range: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub tonemap: TonemapParams,
}

impl SourceParams {
    fn script_tag(&self) -> u64 {
        let mut h = DefaultHasher::new();
        self.path.hash(&mut h);
        self.script.hash(&mut h);
        self.deinterlace.hash(&mut h);
        self.deint_kernel.hash(&mut h);
        self.deint_double.hash(&mut h);
        self.dar.hash(&mut h);
        self.dar_algo.hash(&mut h);
        self.matrix.hash(&mut h);
        self.range.hash(&mut h);
        let t = &self.tonemap;
        t.on.hash(&mut h);
        t.src.hash(&mut h);
        t.func.hash(&mut h);
        t.gamut.hash(&mut h);
        t.peak.hash(&mut h);
        t.use_dovi.hash(&mut h);
        t.dst_nits.map(f64::to_bits).hash(&mut h);
        t.src_nits.map(f64::to_bits).hash(&mut h);
        h.finish()
    }

    fn deint_active(&self) -> bool {
        self.deinterlace
    }

    fn deint_double_rate(&self) -> bool {
        self.deint_double && self.deinterlace
    }

    fn deint(&self) -> vapoursynth::Deint {
        vapoursynth::Deint {
            on: self.deinterlace,
            kernel: self.deint_kernel.clone(),
            double: self.deint_double_rate(),
            tff: true,
        }
    }

    fn tonemap(&self, info: &SourceInfo) -> vapoursynth::Tonemap {
        let t = &self.tonemap;
        let src = if t.src.is_empty() || t.src == "auto" {
            if info.hdr.is_empty() { "sdr".into() } else { info.hdr.clone() }
        } else {
            t.src.clone()
        };
        let matrix = vapoursynth::matrix_vs(&self.matrix)
            .or_else(|| vapoursynth::matrix_vs(&info.matrix))
            .map(|s| s.to_string())
            .unwrap_or_else(|| vapoursynth::resolution_matrix(info.width));
        let range = if !self.range.is_empty() {
            self.range.clone()
        } else if !info.range.is_empty() {
            info.range.clone()
        } else {
            "limited".into()
        };
        vapoursynth::Tonemap {
            on: t.on,
            use_dovi: t.use_dovi && src == "dovi",
            src_csp: src,
            function: t.func.clone(),
            gamut: t.gamut.clone(),
            dynamic_peak: t.peak,
            dst_max: t.dst_nits,
            dst_min: None,
            src_max: t.src_nits,
            matrix,
            transfer: info.transfer.clone(),
            primaries: info.primaries.clone(),
            range,
        }
    }

    fn frame_at(&self, t: u64) -> Option<u64> {
        let t = t as i64;
        for s in &self.segments {
            if t >= s.pos && t < s.pos + s.len as i64 {
                return Some(s.src + (t - s.pos) as u64);
            }
        }
        None
    }

    fn proj_len(&self) -> u64 {
        self.segments
            .iter()
            .map(|s| s.pos + s.len as i64)
            .max()
            .unwrap_or(0)
            .max(0) as u64
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenParams {
    #[serde(default)]
    pub sources: Vec<SourceParams>,
    #[serde(default)]
    pub upscale_smallest: bool,
    #[serde(default)]
    pub upscale_algo: String,
    #[serde(default)]
    pub downscale_largest: bool,
    #[serde(default)]
    pub downscale_algo: String,
    #[serde(default)]
    pub crop_to_smallest: bool,
    #[serde(default)]
    pub pad_to_largest: bool,
    #[serde(default = "default_margin")]
    pub margin_start: f64,
    #[serde(default = "default_margin")]
    pub margin_end: f64,
    #[serde(default = "default_match", rename = "match")]
    pub match_all: String,
    #[serde(default = "default_info_pos")]
    pub info_box_position: String,
    #[serde(default = "default_info_scale")]
    pub info_box_scale: f64,
    #[serde(default)]
    pub watermark: bool,
}

fn default_info_pos() -> String {
    "top-left".into()
}
fn default_info_scale() -> f64 {
    100.0
}

fn default_margin() -> f64 {
    0.02
}
fn default_match() -> String {
    "Any".into()
}

impl GenParams {
    fn scale_opts(&self) -> ScaleOpts {
        ScaleOpts {
            upscale: self.upscale_smallest,
            up_algo: self.upscale_algo.clone(),
            downscale: self.downscale_largest,
            down_algo: self.downscale_algo.clone(),
            crop_to_smallest: self.crop_to_smallest,
            pad_to_largest: self.pad_to_largest,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImgMeta {
    pub filename: String,
    pub path: String,
    pub frame_num: u64,
    pub total: u64,
    pub frame_type: String,
    pub orig_w: u32,
    pub orig_h: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceOut {
    pub src: String,
    pub w: u32,
    pub h: u32,
    pub meta: ImgMeta,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderReq {
    #[serde(default)]
    pub sources: Vec<u32>,
    #[serde(default)]
    pub position: Option<u64>,
    #[serde(default)]
    pub source_frame: Option<u64>,
    #[serde(default)]
    pub composite: bool,
    #[serde(default)]
    pub info_box: bool,
    #[serde(default)]
    pub watermark: bool,
    #[serde(default)]
    pub max_w: Option<u32>,
    #[serde(default)]
    pub max_h: Option<u32>,
    #[serde(default)]
    pub raw: bool,
    #[serde(default)]
    pub cancel_group: String,
    #[serde(default)]
    pub cancel_seq: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderOut {
    pub frames: Vec<SourceOut>,
    pub canvas_w: u32,
    pub canvas_h: u32,
}

fn margin_bounds(margin_start: f64, margin_end: f64) -> (f64, f64) {
    let lo = margin_start.clamp(0.0, 0.9);
    let mut hi = (1.0 - margin_end).clamp(0.0, 1.0);
    if hi <= lo {
        hi = (lo + 0.001).min(1.0);
    }
    (lo, hi)
}

fn get_frame_type(
    state: &AppState,
    params: &GenParams,
    infos: &[SourceInfo],
    fits: &[vapoursynth::Fit],
    source: usize,
    idx: u64,
) -> Result<String, String> {
    let src = &params.sources[source];
    let key = format!("{}|{}|{}", src.path, src.script_tag(), idx);
    if let Some(t) = state.type_cache.lock().unwrap().get(&key) {
        return Ok(t.clone());
    }
    let (_img, ftype) = request_frames(params, infos, fits, &[source], &[idx], None)?
        .pop()
        .ok_or("VapourSynth produced no frame")?;
    state.type_cache.lock().unwrap().insert(key, ftype.clone());
    Ok(ftype)
}

fn overlap_frames(sources: &[SourceParams]) -> Vec<u64> {
    let l = sources.iter().map(|s| s.proj_len()).max().unwrap_or(0);
    (0..l)
        .filter(|&t| sources.iter().all(|s| s.frame_at(t).is_some()))
        .collect()
}

fn candidate_type_ok(
    state: &AppState,
    params: &GenParams,
    type_ctx: &Option<(Vec<SourceInfo>, Vec<vapoursynth::Fit>)>,
    t: u64,
) -> Result<bool, String> {
    let Some((infos, fits)) = type_ctx.as_ref() else {
        return Ok(true);
    };
    for (i, src) in params.sources.iter().enumerate() {
        let Some(idx) = src.frame_at(t) else {
            return Ok(false);
        };
        if get_frame_type(state, params, infos, fits, i, idx)? != params.match_all {
            return Ok(false);
        }
    }
    Ok(true)
}

fn pick_positions_impl(
    state: &AppState,
    params: &GenParams,
    count: usize,
    min_distance: f64,
    existing: &[u64],
) -> Result<Vec<u64>, String> {
    if count == 0 {
        return Ok(Vec::new());
    }
    if params.sources.is_empty() {
        return Err("no sources".into());
    }
    let overlap = overlap_frames(&params.sources);
    if overlap.is_empty() {
        return Err("no overlapping frames across the sources".into());
    }
    let (lo_f, hi_f) = margin_bounds(params.margin_start, params.margin_end);
    let cnt = overlap.len();
    let lo = ((lo_f * cnt as f64).floor() as usize).min(cnt.saturating_sub(1));
    let hi = ((hi_f * cnt as f64).ceil() as usize).max(lo + 1).min(cnt);
    let window = &overlap[lo..hi];
    let n = window.len();

    let span = (window[window.len() - 1].saturating_sub(window[0])) as f64;
    let min_gap = (min_distance.max(0.0) / 100.0 * span).max(0.0);

    let want_filter = !(params.match_all == "Any" || params.match_all.is_empty());
    let type_ctx: Option<(Vec<SourceInfo>, Vec<vapoursynth::Fit>)> = if want_filter {
        plan(state, params).ok().map(|(infos, _d, _c, _f, fits)| (infos, fits))
    } else {
        None
    };

    let mut used: std::collections::HashSet<u64> = existing.iter().copied().collect();
    let mut placed: Vec<u64> = existing.to_vec();
    let mut out: Vec<u64> = Vec::new();
    let mut rng = rand::thread_rng();

    let too_close = |placed: &[u64], t: u64| {
        min_gap > 0.0
            && placed
                .iter()
                .any(|&u| ((u as i64 - t as i64).unsigned_abs() as f64) < min_gap)
    };

    // This reaches `count` whenever the spacing fits (min_gap <= span/count) instead of
    // "jamming" at ~75% the way pure random placement does. Don't simplify to plain random.
    if existing.is_empty() && count > 1 {
        let gap = min_gap.ceil() as i64;
        let mut lower: i64 = i64::MIN;
        for k in 0..count {
            let cell_lo = k * n / count;
            let cell_hi = ((k + 1) * n / count).max(cell_lo + 1).min(n);
            let mut start = cell_lo;
            while start < cell_hi && (window[start] as i64) < lower {
                start += 1;
            }
            if start >= cell_hi {
                continue;
            }
            let t = window[start + rng.gen_range(0..(cell_hi - start))];
            if used.contains(&t) || !candidate_type_ok(state, params, &type_ctx, t)? {
                continue;
            }
            used.insert(t);
            placed.push(t);
            out.push(t);
            lower = t as i64 + gap;
        }
    }

    let cap = count.saturating_mul(500).max(20000);
    let mut attempts = 0usize;
    while out.len() < count && attempts < cap {
        attempts += 1;
        let t = window[rng.gen_range(0..n)];
        if used.contains(&t) || too_close(&placed, t) {
            continue;
        }
        if !candidate_type_ok(state, params, &type_ctx, t)? {
            continue;
        }
        used.insert(t);
        placed.push(t);
        out.push(t);
    }
    Ok(out)
}

#[tauri::command]
pub async fn pick_positions(
    state: State<'_, AppState>,
    params: GenParams,
    count: u32,
    min_distance: f64,
    existing: Vec<u64>,
) -> Result<Vec<u64>, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        pick_positions_impl(&st, &params, count as usize, min_distance, &existing)
    })
    .await
    .map_err(|e| e.to_string())?
}

const IMAGE_SECONDS: u64 = 60;
const IMAGE_FPS: f64 = 25.0;

static PROBE_BUILDING: Mutex<std::collections::BTreeSet<u64>> =
    Mutex::new(std::collections::BTreeSet::new());
static PROBE_CV: Condvar = Condvar::new();

fn probe_source(state: &AppState, src: &SourceParams) -> Result<SourceInfo, String> {
    vapoursynth::ensure_supported()?;
    let key = src.script_tag();
    if let Some(info) = state.probe_cache.lock().unwrap().get(&key) {
        return Ok(info.clone());
    }
    {
        let mut building = PROBE_BUILDING.lock().unwrap();
        while building.contains(&key) {
            building = PROBE_CV.wait(building).unwrap();
            if let Some(info) = state.probe_cache.lock().unwrap().get(&key) {
                return Ok(info.clone());
            }
        }
        building.insert(key);
    }
    let result = probe_source_uncached(src);
    // Publish the result before waking waiters, so a woken waiter sees the cache hit; a
    // failed probe leaves the key uncached so the next waiter retries.
    if let Ok(info) = &result {
        state.probe_cache.lock().unwrap().insert(key, info.clone());
    }
    {
        let mut building = PROBE_BUILDING.lock().unwrap();
        building.remove(&key);
        PROBE_CV.notify_all();
    }
    result
}

fn probe_source_uncached(src: &SourceParams) -> Result<SourceInfo, String> {
    let mut info = vapoursynth::vsprobe(&src.path, &src.script, &src.deint(), Some(&src.path))
        .map_err(|e| error_with_source(&src.path, e))?;
    let d = source_defaults(&src.path, info.width);
    info.sar = d.sar;
    info.dar = d.dar;
    info.matrix = d.matrix;
    info.range = d.range;
    info.transfer = d.transfer;
    info.primaries = d.primaries;
    info.hdr = d.hdr;
    info.dv_profile = d.dv_profile;
    info.dv_bl_compat = d.dv_bl_compat;
    info.is_still = info.total <= 1 && !vapoursynth::is_active(&src.script);
    if info.is_still {
        info.fps = IMAGE_FPS;
        info.total = IMAGE_FPS as u64 * IMAGE_SECONDS;
        info.duration = IMAGE_SECONDS as f64;
    }
    Ok(info)
}

fn source_defaults(path: &str, width: u32) -> SourceDefaults {
    match vapoursynth::probe_metadata(path) {
        Ok(m) => SourceDefaults {
            sar: m.sar,
            dar: m.dar,
            matrix: if m.matrix.is_empty() {
                vapoursynth::resolution_matrix_int(m.width).to_string()
            } else {
                m.matrix
            },
            range: if m.range.is_empty() { "limited".into() } else { m.range },
            transfer: m.transfer,
            primaries: m.primaries,
            hdr: if m.hdr.is_empty() { "sdr".into() } else { m.hdr },
            dv_profile: m.dv_profile,
            dv_bl_compat: m.dv_bl_compat,
        },
        Err(_) => SourceDefaults {
            sar: 1.0,
            dar: String::new(),
            matrix: vapoursynth::resolution_matrix_int(width).to_string(),
            range: "limited".into(),
            transfer: String::new(),
            primaries: String::new(),
            hdr: "sdr".into(),
            dv_profile: None,
            dv_bl_compat: None,
        },
    }
}

fn dar_target_width(w: u32, h: u32, dar: &str) -> Option<u32> {
    let ratio = parse_dar(dar);
    if ratio <= 0.0 {
        return None;
    }
    let tw = ((h as f64 * ratio).round() as u32).max(1);
    if tw == w {
        None
    } else {
        Some(tw)
    }
}

fn crop_box(w: u32, h: u32, c: Crop) -> Option<(u32, u32, u32, u32)> {
    let left = c.left.min(w.saturating_sub(1));
    let top = c.top.min(h.saturating_sub(1));
    let right = c.right.min(w.saturating_sub(left + 1));
    let bottom = c.bottom.min(h.saturating_sub(top + 1));
    let cw = w - left - right;
    let ch = h - top - bottom;
    if left == 0 && top == 0 && cw == w && ch == h {
        None
    } else {
        Some((left, top, cw, ch))
    }
}

fn detected_dar(info: &SourceInfo) -> String {
    if info.sar == 0.0 || (info.sar - 1.0).abs() < 1e-3 {
        return String::new();
    }
    if !info.dar.is_empty() {
        return info.dar.replace(':', "/");
    }
    if info.height == 0 {
        return String::new();
    }
    let r = info.width as f64 * info.sar / info.height as f64;
    if r > 0.0 {
        format!("{}", (r * 1e6).round() / 1e6)
    } else {
        String::new()
    }
}

fn cropped_display_dims(src: &SourceParams, info: &SourceInfo) -> (u32, u32) {
    let dw = dar_target_width(info.width, info.height, &src.dar).unwrap_or(info.width);
    match crop_box(dw, info.height, src.crop) {
        Some((_, _, cw, ch)) => (cw, ch),
        None => (dw, info.height),
    }
}

fn geom_for(src: &SourceParams, info: &SourceInfo, fit: vapoursynth::Fit) -> vapoursynth::Geom {
    let dar_width = dar_target_width(info.width, info.height, &src.dar);
    let dar_w = dar_width.unwrap_or(info.width);
    vapoursynth::Geom {
        deint: src.deint(),
        tonemap: src.tonemap(info),
        matrix: vapoursynth::matrix_vs(&src.matrix)
            .or_else(|| vapoursynth::matrix_vs(&info.matrix))
            .map(|s| s.to_string())
            .unwrap_or_else(|| vapoursynth::resolution_matrix(info.width)),
        range: if !src.range.is_empty() {
            src.range.clone()
        } else if !info.range.is_empty() {
            info.range.clone()
        } else {
            "limited".into()
        },
        dar_width,
        dar_kernel: src.dar_algo.clone(),
        crop: crop_box(dar_w, info.height, src.crop),
        fit,
    }
}

fn parse_dar(s: &str) -> f64 {
    let t = s.trim();
    if t.is_empty() {
        return 0.0;
    }
    if let Some((a, b)) = t.split_once(|c| c == '/' || c == ':') {
        match (a.trim().parse::<f64>(), b.trim().parse::<f64>()) {
            (Ok(a), Ok(b)) if b > 0.0 => a / b,
            _ => 0.0,
        }
    } else {
        t.parse::<f64>().map(|v| v.max(0.0)).unwrap_or(0.0)
    }
}

fn dar_label(dar: &str) -> String {
    dar.trim().replace('/', ":")
}

fn fmt_timestamp(secs: f64) -> String {
    let total_ms = (secs * 1000.0).round().max(0.0) as u64;
    let ms = total_ms % 1000;
    let total_s = total_ms / 1000;
    let s = total_s % 60;
    let m = (total_s / 60) % 60;
    let h = total_s / 3600;
    format!("{:02}:{:02}:{:02}.{:03}", h, m, s, ms)
}

fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string())
}

fn error_with_source(path: &str, err: String) -> String {
    format!("{}\n{}", basename(path), err)
}

fn stem(path: &str) -> String {
    Path::new(path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "source".into())
}

fn export_name(src: &SourceParams) -> String {
    let cleaned: String = src
        .name
        .chars()
        .map(|c| match c {
            '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').trim();
    if cleaned.is_empty() {
        stem(&src.path)
    } else {
        cleaned.to_string()
    }
}

fn scale_label(params: &GenParams, src_dims: (u32, u32), target: (u32, u32)) -> Option<String> {
    if src_dims == target {
        return None;
    }
    let verb = if params.upscale_smallest {
        "Upscaled"
    } else if params.downscale_largest {
        "Downscaled"
    } else if params.crop_to_smallest {
        "Cropped"
    } else if params.pad_to_largest {
        "Padded"
    } else {
        return None;
    };
    Some(format!("{verb} to {}×{}", target.0, target.1))
}

fn deint_label(src: &SourceParams) -> Option<String> {
    if !src.deint_active() {
        return None;
    }
    let algo = if src.deint_kernel.is_empty() {
        "bwdif"
    } else {
        src.deint_kernel.as_str()
    };
    let algo_disp = if algo == "bob" {
        "Bob".to_string()
    } else {
        algo.to_uppercase()
    };
    let rate = if src.deint_double_rate() { "Double" } else { "Single" };
    Some(format!("{algo_disp} ({rate} Rate)"))
}

fn range_label(range: &str) -> &'static str {
    match range {
        "full" => "Full (PC)",
        _ => "Limited (TV)",
    }
}

fn matrix_label(matrix: &str) -> String {
    match matrix {
        "1" => "BT.709",
        "5" => "BT.601",
        "7" => "SMPTE 240M",
        "4" => "FCC",
        "9" => "BT.2020",
        other => other,
    }
    .to_string()
}

fn dv_label(profile: Option<u8>, bl_compat: Option<u8>) -> Option<String> {
    let p = profile?;
    Some(match bl_compat {
        Some(bl) if bl > 0 => format!("{p}.{bl}"),
        _ => format!("{p}"),
    })
}

fn tonemap_note(tm: &vapoursynth::Tonemap, info: &SourceInfo) -> Option<String> {
    if !tm.on {
        return None;
    }
    let range = match tm.src_csp.as_str() {
        "hdr10" => "HDR10".to_string(),
        "hdr10plus" => "HDR10+".to_string(),
        "hlg" => "HLG".to_string(),
        "dovi" => match dv_label(info.dv_profile, info.dv_bl_compat) {
            Some(l) => format!("Dolby Vision {l}"),
            None => "Dolby Vision".to_string(),
        },
        _ => return None,
    };
    let mut opts: Vec<String> = Vec::new();
    let func = if tm.function.is_empty() { "spline" } else { tm.function.as_str() };
    if func != "spline" {
        opts.push(format!("{func} curve"));
    }
    let gamut = if tm.gamut.is_empty() { "perceptual" } else { tm.gamut.as_str() };
    if gamut != "perceptual" {
        opts.push(format!("{gamut} gamut"));
    }
    if !tm.dynamic_peak {
        opts.push("no peak detection".into());
    }
    if let Some(n) = tm.dst_max {
        opts.push(format!("{n} nit target"));
    }
    if let Some(n) = tm.src_max {
        opts.push(format!("{n} nit source"));
    }
    if tm.src_csp == "dovi" && !tm.use_dovi {
        opts.push("RPU off".into());
    }
    let mut s = format!("Tonemapped from {range}");
    if !opts.is_empty() {
        s += &format!(" ({})", opts.join(", "));
    }
    Some(s)
}


/// Supersede by FRONTEND sequence order - not the order requests happen to reach the backend,
/// which races (renders run concurrently on a threadpool), so arrival order can invert and
/// cancel the render the UI actually wants.
static RENDER_CANCELS: OnceLock<Mutex<HashMap<String, (u64, Arc<AtomicBool>)>>> = OnceLock::new();
fn render_cancels() -> &'static Mutex<HashMap<String, (u64, Arc<AtomicBool>)>> {
    RENDER_CANCELS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn begin_render_cancel(group: &str, seq: u64) -> Arc<AtomicBool> {
    let mut map = render_cancels().lock().unwrap();
    match map.get_mut(group) {
        Some((hi, _)) if seq < *hi => Arc::new(AtomicBool::new(true)),
        Some((hi, cur)) if seq == *hi => Arc::clone(cur),
        Some((hi, cur)) => {
            cur.store(true, Ordering::Relaxed);
            let flag = Arc::new(AtomicBool::new(false));
            *hi = seq;
            *cur = Arc::clone(&flag);
            flag
        }
        None => {
            let flag = Arc::new(AtomicBool::new(false));
            map.insert(group.to_string(), (seq, Arc::clone(&flag)));
            flag
        }
    }
}

/// The full all-sources spec set is always built (output index = source index, and VapourSynth
/// decodes only the requested outputs); building a subset would misalign the output indices.
fn request_frames(
    params: &GenParams,
    infos: &[SourceInfo],
    fits: &[vapoursynth::Fit],
    sources: &[usize],
    frames: &[u64],
    req_cancel: Option<&AtomicBool>,
) -> Result<Vec<(RgbaImage, String)>, String> {
    let n = sources.len();
    if n == 0 {
        return Ok(Vec::new());
    }
    vapoursynth::ensure_supported()?;
    let sn = params.sources.len();
    let geoms: Vec<vapoursynth::Geom> = (0..sn)
        .map(|i| geom_for(&params.sources[i], &infos[i], fits[i].clone()))
        .collect();
    let specs: Vec<vapoursynth::FrameSpec> = (0..sn)
        .map(|i| vapoursynth::FrameSpec {
            path: &params.sources[i].path,
            script: &params.sources[i].script,
            geom: &geoms[i],
        })
        .collect();
    let reqs: Vec<vapoursynth::FetchReq> = (0..n)
        .map(|i| {
            let s = sources[i];
            let vs_frame = if infos[s].is_still {
                0
            } else {
                frames[i].min(infos[s].total.saturating_sub(1))
            };
            vapoursynth::FetchReq {
                output: sources[i] as i32,
                frame: vs_frame,
                label: basename(&params.sources[s].path),
            }
        })
        .collect();
    vapoursynth::extract_frames(&specs, &reqs, req_cancel)
}

fn plan(
    state: &AppState,
    params: &GenParams,
) -> Result<
    (Vec<SourceInfo>, Vec<(u32, u32)>, (u32, u32), image::Rgba<u8>, Vec<vapoursynth::Fit>),
    String,
> {
    if params.sources.is_empty() {
        return Err("no sources".into());
    }
    if params.sources.iter().any(|s| s.path.is_empty()) {
        return Err("all sources must be set".into());
    }
    let mut infos = Vec::with_capacity(params.sources.len());
    let mut disp_dims = Vec::with_capacity(params.sources.len());
    for src in &params.sources {
        let info = probe_source(state, src)?;
        disp_dims.push(cropped_display_dims(src, &info));
        infos.push(info);
    }
    let (canvas, fill, fits) = pipeline::plan_sizes(&disp_dims, &params.scale_opts());
    Ok((infos, disp_dims, canvas, fill, fits))
}

fn resolve_frame(
    src: &SourceParams,
    position: Option<u64>,
    source_frame: Option<u64>,
) -> Result<u64, String> {
    if let Some(f) = source_frame {
        Ok(f)
    } else if let Some(t) = position {
        src.frame_at(t).ok_or_else(|| "no overlapping frames at this position".to_string())
    } else {
        Err("render request needs a position or a source frame".into())
    }
}

#[allow(clippy::too_many_arguments)]
fn composite_frames(
    state: &AppState,
    params: &GenParams,
    infos: &[SourceInfo],
    disp_dims: &[(u32, u32)],
    canvas: (u32, u32),
    fill: image::Rgba<u8>,
    sources: &[usize],
    frames: &[u64],
    fetched: Vec<(RgbaImage, String)>,
    info_box: bool,
    watermark: bool,
) -> Vec<(RgbaImage, ImgMeta)> {
    let target = canvas;
    let types: Vec<String> = fetched.iter().map(|(_, t)| t.clone()).collect();
    let placed: Vec<pipeline::Placed> = fetched
        .iter()
        .map(|(img, _)| pipeline::place_on_canvas(img, canvas, fill))
        .collect();

    let info_pos = params.info_box_position.as_str();
    let info_mult = (params.info_box_scale / 100.0) as f32;
    let wm_top = info_pos == "bottom-right";
    let mark = concat!("Pear v", env!("CARGO_PKG_VERSION"));
    let anchor_full = params.upscale_smallest
        || params.downscale_largest
        || params.crop_to_smallest
        || params.pad_to_largest;

    let mut out = Vec::with_capacity(sources.len());
    for (k, place) in placed.into_iter().enumerate() {
        let s = sources[k];
        let src = &params.sources[s];
        let info = &infos[s];
        let idx = frames[k];
        let mut img = place.img;

        let (info_ox, info_oy) = if anchor_full { (0, 0) } else { (place.off_x, place.off_y) };
        if let Some(font) = state.font.as_ref() {
            if info_box {
                let mut lines = vec![
                    basename(&src.path),
                    format!(
                        "Frame {} ({}) / {} ({})",
                        idx + 1,
                        types[k],
                        info.total,
                        fmt_timestamp(idx as f64 / info.fps.max(1e-9))
                    ),
                ];
                if !info.is_still {
                    if let Some(l) = deint_label(src) {
                        lines.push(format!("Deinterlaced with {l}"));
                    }
                }
                if dar_target_width(info.width, info.height, &src.dar).is_some()
                    || (!src.dar.trim().is_empty()
                        && parse_dar(&src.dar) != parse_dar(&detected_dar(info)))
                {
                    lines.push(format!("Aspect ratio set to {}", dar_label(&src.dar)));
                }
                if !src.matrix.is_empty() && src.matrix != info.matrix {
                    lines.push(format!("Decoded as {}", matrix_label(&src.matrix)));
                }
                if !src.range.is_empty() && src.range != info.range {
                    lines.push(format!("Levels: {}", range_label(&src.range)));
                }
                if let Some(l) = scale_label(params, disp_dims[s], target) {
                    lines.push(l);
                }
                if let Some(l) = tonemap_note(&src.tonemap(info), info) {
                    lines.push(l);
                }
                pipeline::draw_info_box(&mut img, &lines, font, info_ox, info_oy, info_pos, info_mult);
            }
            if watermark {
                pipeline::draw_watermark(&mut img, mark, font, info_ox, info_oy, wm_top);
            }
        }

        let meta = ImgMeta {
            filename: basename(&src.path),
            path: src.path.clone(),
            frame_num: idx,
            total: info.total,
            frame_type: types[k].clone(),
            orig_w: disp_dims[s].0,
            orig_h: disp_dims[s].1,
        };
        out.push((img, meta));
    }
    out
}

fn to_data_url(img: &RgbaImage) -> Result<String, String> {
    let mut buf = Vec::new();
    img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
pub async fn source_keyframes(
    state: State<'_, AppState>,
    path: String,
    deinterlace: bool,
    deint_kernel: String,
    deint_double: bool,
) -> Result<Vec<u64>, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let doubled = deint_double && deinterlace;
        let rate = if doubled { 2u64 } else { 1 };
        let key = format!("{}|{}|{}|{}", path, deinterlace, deint_kernel, deint_double);
        if let Some(v) = st.keyframe_cache.lock().unwrap().get(&key) {
            return Ok(v.clone());
        }
        let raw: Vec<u64> = match vapoursynth::source_index(&path) {
            Some(index) => index.keyframes(),
            None => return Ok(Vec::new()),
        };
        let mut idx: Vec<u64> = raw.into_iter().map(|k| k * rate).collect();
        idx.sort_unstable();
        idx.dedup();
        st.keyframe_cache.lock().unwrap().insert(key, idx.clone());
        Ok(idx)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbedSource {
    pub info: SourceInfo,
    pub dar: String,
    pub matrix: String,
    pub range: String,
    pub tonemap_src: String,
    pub tonemap: bool,
}

#[tauri::command]
pub async fn init_source(
    state: State<'_, AppState>,
    path: String,
    deinterlace: bool,
    deint_kernel: String,
    deint_double: bool,
    dar: String,
    matrix: String,
    range: String,
    tonemap_src: String,
    tonemap: bool,
) -> Result<ProbedSource, String> {
    let st = state.inner().clone();
    let src = SourceParams {
        path,
        crop: Crop::default(),
        script: String::new(),
        segments: Vec::new(),
        deinterlace,
        deint_kernel,
        deint_double,
        dar: String::new(),
        dar_algo: String::new(),
        matrix: String::new(),
        range: String::new(),
        name: String::new(),
        tonemap: TonemapParams::default(),
    };
    tauri::async_runtime::spawn_blocking(move || {
        let info = probe_source(&st, &src)?;
        let dar = if dar.trim().is_empty() { detected_dar(&info) } else { dar };
        let matrix = if matrix.is_empty() { info.matrix.clone() } else { matrix };
        let range = if range.is_empty() { info.range.clone() } else { range };
        let (tonemap_src, tonemap) = if tonemap_src.is_empty() {
            (info.hdr.clone(), info.hdr != "sdr")
        } else {
            (tonemap_src, tonemap)
        };
        Ok(ProbedSource { info, dar, matrix, range, tonemap_src, tonemap })
    })
    .await
    .map_err(|e| e.to_string())?
}

fn fit_thumb(img: RgbaImage, max_w: Option<u32>, max_h: Option<u32>) -> RgbaImage {
    let (w, h) = img.dimensions();
    let mut scale = 1.0f64;
    if let Some(mw) = max_w {
        if w > mw {
            scale = scale.min(mw as f64 / w as f64);
        }
    }
    if let Some(mh) = max_h {
        if h > mh {
            scale = scale.min(mh as f64 / h as f64);
        }
    }
    if scale >= 1.0 {
        return img;
    }
    let nw = ((w as f64 * scale).round() as u32).max(1);
    let nh = ((h as f64 * scale).round() as u32).max(1);
    image::imageops::resize(&img, nw, nh, image::imageops::FilterType::Triangle)
}

#[tauri::command]
pub async fn render(
    state: State<'_, AppState>,
    params: GenParams,
    req: RenderReq,
) -> Result<RenderOut, String> {
    let st = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let (infos, disp_dims, canvas, fill, fits) = plan(&st, &params)?;
        let n = params.sources.len();
        let sources: Vec<usize> = if req.sources.is_empty() {
            (0..n).collect()
        } else {
            req.sources.iter().map(|&s| s as usize).collect()
        };
        for &s in &sources {
            if s >= n {
                return Err("no such source".into());
            }
        }
        let frames: Vec<u64> = sources
            .iter()
            .map(|&s| resolve_frame(&params.sources[s], req.position, req.source_frame))
            .collect::<Result<_, _>>()?;
        let cancel = (!req.cancel_group.is_empty())
            .then(|| begin_render_cancel(&req.cancel_group, req.cancel_seq));
        let fetched = request_frames(&params, &infos, &fits, &sources, &frames, cancel.as_deref())?;

        let produced: Vec<(RgbaImage, ImgMeta)> = if req.composite {
            composite_frames(
                &st, &params, &infos, &disp_dims, canvas, fill, &sources, &frames, fetched,
                req.info_box, req.watermark,
            )
        } else {
            fetched
                .into_iter()
                .enumerate()
                .map(|(k, (img, ftype))| {
                    let s = sources[k];
                    let (w, h) = img.dimensions();
                    let meta = ImgMeta {
                        filename: basename(&params.sources[s].path),
                        path: params.sources[s].path.clone(),
                        frame_num: frames[k],
                        total: infos[s].total,
                        frame_type: ftype,
                        orig_w: w,
                        orig_h: h,
                    };
                    (img, meta)
                })
                .collect()
        };

        let (mut cw, mut ch) = canvas;
        let mut out = Vec::with_capacity(produced.len());
        for (img, meta) in produced {
            let img = fit_thumb(img, req.max_w, req.max_h);
            if !req.composite {
                let (w, h) = img.dimensions();
                cw = w;
                ch = h;
            }
            let (w, h) = img.dimensions();
            let src = if req.raw {
                let id = st.put_transport_frame(img.into_raw());
                format!("frame:{id}")
            } else {
                to_data_url(&img)?
            };
            out.push(SourceOut { src, w, h, meta });
        }
        Ok(RenderOut { frames: out, canvas_w: cw, canvas_h: ch })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn frame_bytes(state: State<'_, AppState>, id: u64) -> Result<tauri::ipc::Response, String> {
    match state.get_transport_frame(id) {
        Some(bytes) => Ok(tauri::ipc::Response::new((*bytes).clone())),
        None => Err("frame expired".into()),
    }
}

#[tauri::command]
pub fn release_frames(state: State<'_, AppState>, ids: Vec<u64>) {
    state.release_transport_frames(&ids);
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub dir: String,
    pub files: Vec<String>,
}

fn decode_overlay(data_url: &str) -> Result<RgbaImage, String> {
    let b64 = data_url
        .split_once(',')
        .map(|(_, d)| d)
        .unwrap_or(data_url);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.as_bytes())
        .map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;
    Ok(img.to_rgba8())
}

fn save_one(
    st: &AppState,
    params: &GenParams,
    dir: &Path,
    num: u32,
    base: u64,
    overlay: Option<&String>,
) -> Result<Vec<String>, String> {
    let (infos, disp_dims, canvas, fill, fits) = plan(st, params)?;
    let (cw, ch) = canvas;
    let n = params.sources.len();
    let sources: Vec<usize> = (0..n).collect();
    let frames: Vec<u64> = params
        .sources
        .iter()
        .map(|s| resolve_frame(s, Some(base), None))
        .collect::<Result<_, _>>()?;
    let fetched = request_frames(params, &infos, &fits, &sources, &frames, None)?;
    let composited = composite_frames(
        st, params, &infos, &disp_dims, canvas, fill, &sources, &frames, fetched, true, params.watermark,
    );

    let ov = match overlay {
        Some(data_url) => {
            let mut ov = decode_overlay(data_url)?;
            if ov.dimensions() != (cw, ch) {
                ov = image::imageops::resize(&ov, cw, ch, image::imageops::FilterType::Triangle);
            }
            Some(ov)
        }
        None => None,
    };

    let num = format!("{:04}", num + 1);
    let mut paths = Vec::with_capacity(composited.len());
    for (i, (mut img, _meta)) in composited.into_iter().enumerate() {
        if let Some(ov) = &ov {
            image::imageops::overlay(&mut img, ov, 0, 0);
        }
        let src = &params.sources[i];
        let path = dir.join(format!("{}_{}.png", num, export_name(src)));
        img.save(&path).map_err(|e| e.to_string())?;
        paths.push(path.to_string_lossy().to_string());
    }
    Ok(paths)
}

#[tauri::command]
pub async fn save_all(
    state: State<'_, AppState>,
    params: GenParams,
    out_dir: Option<String>,
    overlays: Option<HashMap<u32, String>>,
    positions: Vec<u64>,
) -> Result<SaveResult, String> {
    let st = state.inner().clone();
    let overlays = overlays.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        let dir: PathBuf = match out_dir {
            Some(d) if !d.is_empty() => PathBuf::from(d),
            _ => {
                let first = params.sources.first().map(|s| s.path.as_str()).unwrap_or("");
                let parent = Path::new(first)
                    .parent()
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|| PathBuf::from("."));
                let joined = params
                    .sources
                    .iter()
                    .map(export_name)
                    .collect::<Vec<_>>()
                    .join("_vs_");
                parent.join("screens").join(joined)
            }
        };
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

        let mut files = Vec::new();
        for (i, &base) in positions.iter().enumerate() {
            let mut paths = save_one(&st, &params, &dir, i as u32, base, overlays.get(&(i as u32)))?;
            files.append(&mut paths);
        }

        Ok(SaveResult {
            dir: dir.to_string_lossy().to_string(),
            files,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn clear_cache(state: State<'_, AppState>) {
    state.type_cache.lock().unwrap().clear();
    state.keyframe_cache.lock().unwrap().clear();
    state.probe_cache.lock().unwrap().clear();
    vapoursynth::clear_env_cache();
}

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_prefs(app: AppHandle) -> Result<config::Prefs, String> {
    Ok(config::load_prefs(&config_dir(&app)?))
}

#[tauri::command]
pub fn save_templates(
    app: AppHandle,
    templates: Vec<config::ScriptTemplate>,
) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let mut prefs = config::load_prefs(&dir);
    prefs.templates = templates;
    config::save_prefs(&dir, &prefs)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub thumbnail: String,
}

#[tauri::command]
pub fn recent_projects_meta(app: AppHandle) -> Result<Vec<RecentProject>, String> {
    let paths = config::load_prefs(&config_dir(&app)?).recent_projects;
    Ok(paths
        .into_iter()
        .map(|p| {
            let cfg = config::load_project(&p).ok();
            let name = cfg
                .as_ref()
                .map(|c| c.name.clone())
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| {
                    Path::new(&p)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&p)
                        .to_string()
                });
            let thumbnail = cfg.map(|c| c.thumbnail).unwrap_or_default();
            RecentProject { path: p, name, thumbnail }
        })
        .collect())
}

#[tauri::command]
pub fn save_settings(
    app: AppHandle,
    default_count: u32,
    min_distance: f64,
    margin: config::MarginOpt,
    frame_match: Option<String>,
    ordered_comparisons: bool,
    default_zoom: String,
    pixel_perfect: bool,
    zoom_algo: String,
    fullscreen_mode: String,
    fullscreen_includes: config::FullscreenIncludes,
    info_box_position: String,
    info_box_scale: f64,
    weave_frames: u32,
    watermark: bool,
    preview_bg: serde_json::Value,
    preview_border: serde_json::Value,
    hwdevice: String,
    hwfallback: bool,
    check_for_updates: bool,
) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let mut prefs = config::load_prefs(&dir);
    prefs.default_count = default_count;
    prefs.min_distance = min_distance;
    prefs.margin = margin;
    prefs.r#match = frame_match;
    prefs.ordered_comparisons = ordered_comparisons;
    prefs.default_zoom = default_zoom;
    prefs.pixel_perfect = pixel_perfect;
    prefs.zoom_algo = zoom_algo;
    prefs.fullscreen_mode = fullscreen_mode;
    prefs.fullscreen_includes = fullscreen_includes;
    prefs.info_box_position = info_box_position;
    prefs.info_box_scale = info_box_scale;
    prefs.weave_frames = weave_frames;
    prefs.watermark = watermark;
    prefs.preview_bg = preview_bg;
    prefs.preview_border = preview_border;
    prefs.hwdevice = hwdevice;
    prefs.hwfallback = hwfallback;
    prefs.check_for_updates = check_for_updates;
    config::save_prefs(&dir, &prefs)
}

#[tauri::command]
pub fn set_hwdevice(state: State<'_, AppState>, device: String) {
    vapoursynth::set_hwdevice(device);
    state.type_cache.lock().unwrap().clear();
    state.probe_cache.lock().unwrap().clear();
    vapoursynth::clear_env_cache();
}

#[tauri::command]
pub fn set_hwfallback(state: State<'_, AppState>, on: bool) {
    vapoursynth::set_hwfallback(on);
    state.type_cache.lock().unwrap().clear();
    state.probe_cache.lock().unwrap().clear();
    vapoursynth::clear_env_cache();
}

#[tauri::command]
pub fn set_ui_state(
    app: AppHandle,
    last_tab: String,
    preview_mode: String,
    seek_base: u64,
) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let mut prefs = config::load_prefs(&dir);
    prefs.last_tab = last_tab;
    prefs.preview_mode = preview_mode;
    prefs.seek_base = seek_base;
    config::save_prefs(&dir, &prefs)
}

#[tauri::command]
pub fn take_pending_project(state: State<'_, AppState>) -> Option<String> {
    state.pending_project.lock().ok().and_then(|mut p| p.take())
}

#[tauri::command]
pub fn lock_project(state: State<'_, AppState>, path: String) -> Result<(), String> {
    state.lock_project(&path)
}

#[tauri::command]
pub fn unlock_project(state: State<'_, AppState>) {
    state.unlock_project();
}

#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) {
    if window.is_devtools_open() {
        window.close_devtools();
    } else {
        window.open_devtools();
    }
}

#[tauri::command]
pub fn set_last_project(app: AppHandle, path: String) -> Result<(), String> {
    let dir = config_dir(&app)?;
    let mut prefs = config::load_prefs(&dir);
    prefs.last_project = path;
    config::save_prefs(&dir, &prefs)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildInfo {
    pub app: String,
    pub vapoursynth: String,
    pub bestsource: String,
}

#[tauri::command]
pub async fn build_info() -> Result<BuildInfo, String> {
    tauri::async_runtime::spawn_blocking(|| BuildInfo {
        app: env!("CARGO_PKG_VERSION").to_string(),
        vapoursynth: vapoursynth::core_version(),
        bestsource: vapoursynth::bestsource_version(),
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn vs_status(state: State<'_, AppState>) -> Result<vapoursynth::VsStatus, String> {
    let (mem_used, mem_max) = state.transport_mem();
    let mut st = tauri::async_runtime::spawn_blocking(vapoursynth::runtime_status)
        .await
        .map_err(|e| e.to_string())?;
    st.mem_used = mem_used;
    st.mem_max = mem_max;
    Ok(st)
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("only http(s) URLs are allowed".into());
    }
    opener::open(&url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn open_vapoursynth_folder() -> Result<(), String> {
    let dir = vapoursynth::root_dir().ok_or("VapourSynth was not found.")?;
    opener::open(&dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn mark_recent(app: AppHandle, path: String) -> Result<(), String> {
    config::push_recent(&config_dir(&app)?, &path);
    Ok(())
}

#[tauri::command]
pub fn remove_recent(app: AppHandle, path: String) -> Result<(), String> {
    config::remove_recent(&config_dir(&app)?, &path);
    Ok(())
}

#[tauri::command]
pub fn load_project(path: String) -> Result<Config, String> {
    config::load_project(&path)
}

#[tauri::command]
pub fn discard_indexes(paths: Vec<String>) {
    for p in paths {
        vapoursynth::remove_source_indexes(&p);
    }
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[tauri::command]
pub fn save_project(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    mut project: Config,
) -> Result<(), String> {
    let now = now_secs();
    let existing = config::load_project(&path).ok();
    project.modified = now;
    if project.created == 0 {
        project.created = existing
            .as_ref()
            .map(|e| e.created)
            .filter(|c| *c != 0)
            .unwrap_or(now);
    }
    if project.version.is_empty() {
        project.version = existing
            .as_ref()
            .map(|e| e.version.clone())
            .filter(|v| !v.is_empty())
            .unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());
    }
    if project.thumbnail.is_empty() {
        if let Some(e) = existing.as_ref() {
            project.thumbnail = e.thumbnail.clone();
        }
    }
    state.with_project_write(Path::new(&path), || config::save_project(&path, &project))?;
    config::push_recent(&config_dir(&app)?, &path);
    Ok(())
}

#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).is_file()
}

#[tauri::command]
pub fn is_portable() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.join("uninstall.exe")))
        .map(|uninstaller| !uninstaller.exists())
        .unwrap_or(true)
}

#[tauri::command]
pub async fn file_id(path: String) -> Result<config::FileId, String> {
    tauri::async_runtime::spawn_blocking(move || config::file_id(&path))
        .await
        .map_err(|e| e.to_string())?
}
