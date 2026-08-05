use crate::config::Crop;
use crate::vapoursynth::Fit;
use ab_glyph::{FontVec, PxScale};
use image::imageops::FilterType;
use image::{Rgba, RgbaImage};

pub struct ScaleOpts {
    pub upscale: bool,
    pub up_algo: String,
    pub downscale: bool,
    pub down_algo: String,
    pub crop_to_smallest: bool,
    pub pad_to_largest: bool,
}

pub fn filter_from_name(name: &str) -> FilterType {
    match name {
        "Nearest" => FilterType::Nearest,
        "Triangle" => FilterType::Triangle,
        "CatmullRom" => FilterType::CatmullRom,
        "Gaussian" => FilterType::Gaussian,
        "Lanczos3" => FilterType::Lanczos3,
        _ => FilterType::Triangle,
    }
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

fn fit_dims(d: (u32, u32), target: (u32, u32)) -> (u32, u32) {
    let (iw, ih) = d;
    if iw == target.0 && ih == target.1 {
        return d;
    }
    let s = f64::min(target.0 as f64 / iw as f64, target.1 as f64 / ih as f64);
    (((iw as f64 * s).round() as u32).max(1), ((ih as f64 * s).round() as u32).max(1))
}

fn center_on_canvas(img: &RgbaImage, tw: u32, th: u32, fill: Rgba<u8>) -> RgbaImage {
    let mut canvas = RgbaImage::from_pixel(tw, th, fill);
    let (iw, ih) = img.dimensions();
    let x = ((tw as i64 - iw as i64) / 2).max(0);
    let y = ((th as i64 - ih as i64) / 2).max(0);
    image::imageops::overlay(&mut canvas, img, x, y);
    canvas
}

pub struct Placed {
    pub img: RgbaImage,
    pub off_x: i32,
    pub off_y: i32,
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

const TRANSPARENT: Rgba<u8> = Rgba([0, 0, 0, 0]);
const BLACK: Rgba<u8> = Rgba([0, 0, 0, 255]);

pub fn plan_sizes(dims: &[(u32, u32)], opts: &ScaleOpts) -> ((u32, u32), Rgba<u8>, Vec<Fit>) {
    if dims.is_empty() {
        return ((1, 1), TRANSPARENT, Vec::new());
    }
    let areas: Vec<u64> = dims.iter().map(|&(w, h)| w as u64 * h as u64).collect();
    let smallest = dims[argmin(&areas)];
    let largest = dims[argmax(&areas)];
    let bbox = (
        dims.iter().map(|d| d.0).max().unwrap_or(1),
        dims.iter().map(|d| d.1).max().unwrap_or(1),
    );

    if opts.upscale {
        let fits = dims
            .iter()
            .map(|&d| {
                let (w, h) = fit_dims(d, largest);
                Fit::Scale(w, h, opts.up_algo.clone())
            })
            .collect();
        (largest, TRANSPARENT, fits)
    } else if opts.downscale {
        let fits = dims
            .iter()
            .map(|&d| {
                let (w, h) = fit_dims(d, smallest);
                Fit::Scale(w, h, opts.down_algo.clone())
            })
            .collect();
        (smallest, TRANSPARENT, fits)
    } else if opts.crop_to_smallest {
        let fits = dims
            .iter()
            .map(|&d| Fit::CropCenter(smallest.0.min(d.0), smallest.1.min(d.1)))
            .collect();
        (smallest, TRANSPARENT, fits)
    } else if opts.pad_to_largest {
        (largest, BLACK, dims.iter().map(|_| Fit::None).collect())
    } else {
        (bbox, TRANSPARENT, dims.iter().map(|_| Fit::None).collect())
    }
}

pub fn place_on_canvas(img: &RgbaImage, canvas: (u32, u32), fill: Rgba<u8>) -> Placed {
    let (tw, th) = canvas;
    let (iw, ih) = img.dimensions();
    let off_x = ((tw as i64 - iw as i64) / 2).max(0) as i32;
    let off_y = ((th as i64 - ih as i64) / 2).max(0) as i32;
    Placed {
        img: center_on_canvas(img, tw, th, fill),
        off_x,
        off_y,
    }
}

pub fn draw_info_box(
    img: &mut RgbaImage,
    lines: &[String],
    font: &FontVec,
    ox: i32,
    oy: i32,
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

    let (cx0, cy0, cx1, cy1) = (ox, oy, w as i32 - ox, h as i32 - oy);
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
    ox: i32,
    oy: i32,
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

    let x0 = w as i32 - ox - pad - total_w;
    let y0 = if at_top {
        oy + pad
    } else {
        h as i32 - oy - pad - th
    };

    let mut layer = RgbaImage::from_pixel(tw as u32, th as u32, Rgba([0, 0, 0, 0]));
    imageproc::drawing::draw_text_mut(&mut layer, Rgba([255, 255, 255, 255]), 0, 0, scale, font, text);
    composite_layer(img, &layer, x0, y0, WATERMARK_OPACITY, true);

    if has_pear {
        let scaled =
            image::imageops::resize(pear, emoji_w as u32, emoji_h as u32, FilterType::Lanczos3);
        let pear_y = y0 + (emoji_h as f32 * 0.12).round() as i32;
        composite_layer(img, &scaled, x0 + tw + gap, pear_y, WATERMARK_OPACITY, false);
    }
}
