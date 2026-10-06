use crate::projects::Crop;
use crate::vapoursynth::Fit;
use ab_glyph::{Font, FontVec, PxScale, ScaleFont};
use image::imageops::FilterType;
use image::{Rgba, RgbaImage};

/// How the up/down-scale resolution is chosen when sources differ in aspect ratio. The reference
/// source's *raw* (pre-aspect-ratio) box sets the target; each source keeps its own display aspect
/// ratio. `Height`/`Width` match that one dimension of the reference (so a wider source ends up
/// wider/shorter than the reference); `Both` fits the source inside the reference box.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScaleMode {
    Height,
    Width,
    #[default]
    Both,
}

pub struct ScaleOpts {
    pub upscale: bool,
    pub up_algo: String,
    pub downscale: bool,
    pub down_algo: String,
    pub scale_mode: ScaleMode,
}

pub fn apply_crop(img: &RgbaImage, crop: Crop) -> RgbaImage {
    let (w, h) = img.dimensions();
    let left = crop.left.min(w.saturating_sub(1));
    let top = crop.top.min(h.saturating_sub(1));
    let right = crop.right.min(w.saturating_sub(left + 1));
    let bottom = crop.bottom.min(h.saturating_sub(top + 1));
    let cw = w - left - right;
    let ch = h - top - bottom;
    image::imageops::crop_imm(img, left, top, cw, ch).to_image()
}

/// Scale `d` (preserving aspect ratio) to fit *inside* `target` - the largest it can be without
/// exceeding either target dimension. Leftover is padded.
fn fit_dims(d: (u32, u32), target: (u32, u32)) -> (u32, u32) {
    let (iw, ih) = d;
    if iw == target.0 && ih == target.1 {
        return d;
    }
    let s = f64::min(target.0 as f64 / iw as f64, target.1 as f64 / ih as f64);
    (((iw as f64 * s).round() as u32).max(1), ((ih as f64 * s).round() as u32).max(1))
}

/// Scale a source's display dims toward the resolution reference's raw box, keeping the source's
/// display aspect ratio. This is the final display size, so applying it as a single resize also
/// realizes the source's aspect ratio (no separate DAR resize needed).
fn scaled_disp(disp: (u32, u32), refbox: (u32, u32), mode: ScaleMode) -> (u32, u32) {
    let (dw, dh) = disp;
    let (rw, rh) = refbox;
    let r = |x: f64| (x.round() as u32).max(1);
    match mode {
        ScaleMode::Height => (r(rh as f64 * dw as f64 / dh as f64), rh),
        ScaleMode::Width => (rw, r(rw as f64 * dh as f64 / dw as f64)),
        ScaleMode::Both => fit_dims(disp, refbox),
    }
}

fn argmin(v: &[u64]) -> usize {
    (0..v.len()).min_by_key(|&i| v[i]).unwrap_or(0)
}
fn argmax(v: &[u64]) -> usize {
    let mut idx = 0;
    for i in 1..v.len() {
        if v[i] > v[idx] {
            idx = i;
        }
    }
    idx
}

/// Plan how each source is scaled/cropped. `raw` is each source's pre-aspect-ratio (storage) dims,
/// `disp` its display dims (aspect ratio applied); both are post-crop. Scale targets are computed
/// against the reference source's *raw* box so the up/down scale choice happens before aspect-ratio
/// application - the returned targets are display dims, so a single resize realizes both. The first
/// tuple element is the bounding box of all scaled sources (the preview's reference canvas).
pub fn plan_sizes(
    raw: &[(u32, u32)],
    disp: &[(u32, u32)],
    opts: &ScaleOpts,
) -> ((u32, u32), Vec<Fit>) {
    if disp.is_empty() {
        return ((1, 1), Vec::new());
    }
    let areas: Vec<u64> = disp.iter().map(|&(w, h)| w as u64 * h as u64).collect();
    let i_small = argmin(&areas);
    let i_large = argmax(&areas);

    // Resolution reference: the raw box of the largest (upscale) or smallest (downscale) source.
    let (algo, ref_raw) = if opts.upscale {
        (opts.up_algo.as_str(), Some(raw[i_large]))
    } else if opts.downscale {
        (opts.down_algo.as_str(), Some(raw[i_small]))
    } else {
        ("", None)
    };

    // Scale each source toward the reference raw box (mode-aware), report the bounding box of the
    // results. Sources of differing AR won't match resolution - intended; the viewer aligns them.
    let scaled: Vec<(u32, u32)> = match ref_raw {
        Some(rb) => disp.iter().map(|&d| scaled_disp(d, rb, opts.scale_mode)).collect(),
        None => disp.to_vec(),
    };
    let bbox = (
        scaled.iter().map(|d| d.0).max().unwrap_or(1),
        scaled.iter().map(|d| d.1).max().unwrap_or(1),
    );
    let fits = disp
        .iter()
        .zip(&scaled)
        .map(|(&d, &sd)| (d != sd).then(|| (sd.0, sd.1, algo.to_string())))
        .collect();
    (bbox, fits)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 4:3 source (raw 720x480, display 640x480) + 16:9 source (raw 720x576, display 1024x576),
    // downscaling toward the smallest (the 4:3). The 16:9 source's target depends on the mode.
    fn plan(mode: ScaleMode) -> Vec<Fit> {
        let raw = [(720, 480), (720, 576)];
        let disp = [(640, 480), (1024, 576)];
        let opts = ScaleOpts {
            upscale: false,
            up_algo: String::new(),
            downscale: true,
            down_algo: "Lanczos3".into(),
            scale_mode: mode,
        };
        plan_sizes(&raw, &disp, &opts).1
    }

    fn target(f: &Fit) -> Option<(u32, u32)> {
        f.as_ref().map(|&(w, h, _)| (w, h))
    }

    #[test]
    fn scale_mode_targets() {
        // Both: 16:9 fits inside the 720x480 raw box -> 720x405 (width-constrained here).
        assert_eq!(target(&plan(ScaleMode::Both)[1]), Some((720, 405)));
        // Height: match the reference height (480) -> 480*16/9 = 853.3 -> 853x480.
        assert_eq!(target(&plan(ScaleMode::Height)[1]), Some((853, 480)));
        // Width: match the reference width (720) -> 720x405.
        assert_eq!(target(&plan(ScaleMode::Width)[1]), Some((720, 405)));
        // The reference (4:3) is unchanged under Both/Height (its display is its own scale).
        assert_eq!(target(&plan(ScaleMode::Both)[0]), None);
        assert_eq!(target(&plan(ScaleMode::Height)[0]), None);
    }
}

pub fn draw_info_box(
    img: &mut RgbaImage,
    lines: &[String],
    font: &FontVec,
    position: &str,
    scale_mult: f32,
) {
    if lines.is_empty() {
        return;
    }
    let (w, h) = img.dimensions();
    let size = ((h as f32 / 40.0).max(13.0) * scale_mult).max(6.0);
    let scale = PxScale::from(size);
    let pad = (14.0 * scale_mult).round().max(6.0) as i32;
    let spacing = (size / 5.0).max(4.0) as i32;
    let stroke = (size / 16.0).max(1.0) as i32;

    let mut line_h = 0i32;
    let mut widths: Vec<i32> = Vec::with_capacity(lines.len());
    for line in lines {
        let (lw, lh) = imageproc::drawing::text_size(scale, font, line);
        widths.push(lw as i32);
        line_h = line_h.max(lh as i32);
    }
    let n = lines.len() as i32;
    let block_h = n * line_h + (n - 1).max(0) * spacing;

    let (cx0, cy0, cx1, cy1) = (0, 0, w as i32, h as i32);
    let (vpos, hpos) = position.split_once('-').unwrap_or(("top", "left"));

    let mut y = match vpos {
        "middle" => (cy0 + cy1) / 2 - block_h / 2,
        "bottom" => cy1 - pad - block_h,
        _ => cy0 + pad,
    };

    let white = Rgba([255, 255, 255, 255]);
    let black = Rgba([0, 0, 0, 255]);
    for (i, line) in lines.iter().enumerate() {
        let lw = widths[i];
        let x0 = match hpos {
            "center" => (cx0 + cx1) / 2 - lw / 2,
            "right" => cx1 - pad - lw,
            _ => cx0 + pad,
        };
        for dx in -stroke..=stroke {
            for dy in -stroke..=stroke {
                if dx == 0 && dy == 0 {
                    continue;
                }
                imageproc::drawing::draw_text_mut(img, black, x0 + dx, y + dy, scale, font, line);
            }
        }
        imageproc::drawing::draw_text_mut(img, white, x0, y, scale, font, line);
        y += line_h + spacing;
    }
}

static WATERMARK_PNG: &[u8] = include_bytes!("assets/watermark.png");
fn watermark_image() -> &'static RgbaImage {
    static CELL: std::sync::OnceLock<RgbaImage> = std::sync::OnceLock::new();
    CELL.get_or_init(|| {
        image::load_from_memory(WATERMARK_PNG)
            .map(|i| i.to_rgba8())
            .unwrap_or_else(|_| RgbaImage::new(1, 1))
    })
}

const WATERMARK_OPACITY: f32 = 0.75;

fn composite_layer(
    img: &mut RgbaImage,
    layer: &RgbaImage,
    x0: i32,
    y0: i32,
    opacity: f32,
    white_tint: bool,
) {
    let (w, h) = img.dimensions();
    for (lx, ly, px) in layer.enumerate_pixels() {
        let cov = px[3] as f32 / 255.0;
        if cov <= 0.0 {
            continue;
        }
        let a = cov * opacity;
        let dx = x0 + lx as i32;
        let dy = y0 + ly as i32;
        if dx < 0 || dy < 0 || dx >= w as i32 || dy >= h as i32 {
            continue;
        }
        let (tr, tg, tb) = if white_tint {
            (255.0, 255.0, 255.0)
        } else {
            (px[0] as f32, px[1] as f32, px[2] as f32)
        };
        let bg = *img.get_pixel(dx as u32, dy as u32);
        let mix = |c: u8, t: f32| (c as f32 * (1.0 - a) + t * a).round().clamp(0.0, 255.0) as u8;
        let out = Rgba([
            mix(bg[0], tr),
            mix(bg[1], tg),
            mix(bg[2], tb),
            bg[3].max((a * 255.0).round() as u8),
        ]);
        img.put_pixel(dx as u32, dy as u32, out);
    }
}

pub fn draw_watermark(
    img: &mut RgbaImage,
    text: &str,
    font: &FontVec,
    at_top: bool,
) {
    let (w, h) = img.dimensions();
    let size = (h as f32 / 55.0).max(11.0);
    let scale = PxScale::from(size);
    let pad = 12i32;
    let (tw, th) = imageproc::drawing::text_size(scale, font, text);
    let (tw, th) = (tw as i32, th as i32);
    if tw <= 0 || th <= 0 {
        return;
    }
    let pear = watermark_image();
    let has_pear = pear.width() > 1;
    let emoji_h = th.max(1);
    let (pw, ph) = pear.dimensions();
    let emoji_w = if has_pear && ph > 0 {
        ((emoji_h as f32) * (pw as f32 / ph as f32)).round().max(1.0) as i32
    } else {
        emoji_h
    };
    let gap = (size * 0.35).round().max(3.0) as i32;
    let total_w = tw + gap + emoji_w;

    let x0 = w as i32 - pad - total_w;
    let y0 = if at_top { pad } else { h as i32 - pad - th };

    let sfont = font.as_scaled(scale);
    let line_h = (sfont.ascent() - sfont.descent()).ceil().max(th as f32) as u32 + 1;
    let mut layer = RgbaImage::from_pixel(tw as u32, line_h, Rgba([0, 0, 0, 0]));
    imageproc::drawing::draw_text_mut(&mut layer, Rgba([255, 255, 255, 255]), 0, 0, scale, font, text);
    composite_layer(img, &layer, x0, y0, WATERMARK_OPACITY, true);

    if has_pear {
        let scaled =
            image::imageops::resize(pear, emoji_w as u32, emoji_h as u32, FilterType::Lanczos3);
        let pear_y = y0 + (emoji_h as f32 * 0.12).round() as i32;
        composite_layer(img, &scaled, x0 + tw + gap, pear_y, WATERMARK_OPACITY, false);
    }
}
