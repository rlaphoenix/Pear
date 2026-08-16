use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize)]
pub struct Crop {
    #[serde(default)]
    pub top: u32,
    #[serde(default)]
    pub right: u32,
    #[serde(default)]
    pub bottom: u32,
    #[serde(default)]
    pub left: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Segment {
    #[serde(default)]
    pub src: u64,
    #[serde(default)]
    pub len: u64,
    #[serde(default)]
    pub pos: i64,
    #[serde(default)]
    pub name: String,
}

fn default_deint_kernel() -> String {
    "bwdif".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeinterlaceOpt {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_deint_kernel")]
    pub kernel: String,
    #[serde(default)]
    pub double: bool,
}
impl Default for DeinterlaceOpt {
    fn default() -> Self {
        DeinterlaceOpt {
            enabled: false,
            kernel: default_deint_kernel(),
            double: false,
        }
    }
}

fn default_tonemap_src() -> String {
    "auto".to_string()
}
fn default_tonemap_func() -> String {
    "spline".to_string()
}
fn default_tonemap_gamut() -> String {
    "perceptual".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TonemapOpt {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_tonemap_src")]
    pub src: String,
    #[serde(default = "default_tonemap_func")]
    pub func: String,
    #[serde(default = "default_tonemap_gamut")]
    pub gamut: String,
    #[serde(default = "default_true")]
    pub peak: bool,
    #[serde(default)]
    pub dst_nits: Option<f64>,
    #[serde(default)]
    pub src_nits: Option<f64>,
    #[serde(default = "default_true")]
    pub use_dovi: bool,
}
impl Default for TonemapOpt {
    fn default() -> Self {
        TonemapOpt {
            enabled: false,
            src: default_tonemap_src(),
            func: default_tonemap_func(),
            gamut: default_tonemap_gamut(),
            peak: true,
            dst_nits: None,
            src_nits: None,
            use_dovi: true,
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedSource {
    #[serde(default)]
    pub crop: Crop,
    #[serde(default)]
    pub segments: Vec<Segment>,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub deinterlace: DeinterlaceOpt,
    #[serde(default)]
    pub tonemap: TonemapOpt,
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
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileId {
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub id: String,
}

pub fn file_id(path: &str) -> Result<FileId, String> {
    use sha2::{Digest, Sha256};
    use std::io::{Read, Seek, SeekFrom};

    const CHUNK: u64 = 2 * 1024 * 1024;

    let mut f = std::fs::File::open(path).map_err(|e| format!("{path}: {e}"))?;
    let size = f.metadata().map_err(|e| e.to_string())?.len();

    let mut hasher = Sha256::new();
    hasher.update(size.to_le_bytes());

    let head_len = size.min(CHUNK);
    let mut buf = vec![0u8; head_len as usize];
    f.read_exact(&mut buf).map_err(|e| e.to_string())?;
    hasher.update(&buf);

    if size > CHUNK {
        let tail_start = size - CHUNK;
        f.seek(SeekFrom::Start(tail_start)).map_err(|e| e.to_string())?;
        let mut tail = vec![0u8; CHUNK as usize];
        f.read_exact(&mut tail).map_err(|e| e.to_string())?;
        hasher.update(&tail);
    }

    let digest = hasher.finalize();
    let id: String = digest[..16].iter().map(|b| format!("{:02x}", b)).collect();
    Ok(FileId { size, id })
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScriptTemplate {
    pub name: String,
    #[serde(default)]
    pub script: String,
}

fn default_count() -> u32 {
    20
}
fn default_min_distance() -> f64 {
    5.0
}
fn default_gutter_width() -> f64 {
    120.0
}
fn default_up_algo() -> String {
    "Triangle".into()
}
fn default_down_algo() -> String {
    "Lanczos3".into()
}
fn default_margin() -> f64 {
    0.02
}
fn default_upscale() -> ScaleOpt {
    ScaleOpt { enabled: false, algorithm: default_up_algo() }
}
fn default_downscale() -> ScaleOpt {
    ScaleOpt { enabled: false, algorithm: default_down_algo() }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaleOpt {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_up_algo")]
    pub algorithm: String,
}
impl Default for ScaleOpt {
    fn default() -> Self {
        ScaleOpt { enabled: false, algorithm: default_up_algo() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarginOpt {
    #[serde(default = "default_margin")]
    pub start: f64,
    #[serde(default = "default_margin")]
    pub end: f64,
}
impl Default for MarginOpt {
    fn default() -> Self {
        MarginOpt { start: default_margin(), end: default_margin() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    #[serde(default)]
    pub comparisons: Vec<u64>,
    #[serde(default = "default_upscale")]
    pub upscale: ScaleOpt,
    #[serde(default = "default_downscale")]
    pub downscale: ScaleOpt,
    #[serde(default)]
    pub crop_to_smallest: bool,
    #[serde(default)]
    pub pad_to_largest: bool,
    #[serde(default = "default_gutter_width")]
    pub gutter_width: f64,
    #[serde(default)]
    pub sources: IndexMap<String, SavedSource>,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub thumbnail: String,
    #[serde(default)]
    pub created: u64,
    #[serde(default)]
    pub modified: u64,
    #[serde(default)]
    pub version: String,
}

impl Default for Config {
    fn default() -> Self {
        Config {
            comparisons: Vec::new(),
            upscale: default_upscale(),
            downscale: default_downscale(),
            crop_to_smallest: false,
            pad_to_largest: false,
            gutter_width: default_gutter_width(),
            sources: IndexMap::new(),
            name: String::new(),
            thumbnail: String::new(),
            created: 0,
            modified: 0,
            version: String::new(),
        }
    }
}

fn default_true() -> bool {
    true
}
fn default_zoom() -> String {
    "fit".into()
}
fn default_fullscreen_mode() -> String {
    "fullscreen".into()
}
fn default_zoom_algo() -> String {
    "auto".into()
}
fn default_last_tab() -> String {
    "preview".into()
}
fn default_preview_mode() -> String {
    "single".into()
}
fn default_info_pos() -> String {
    "top-left".into()
}
fn default_info_scale() -> f64 {
    100.0
}
fn default_weave_frames() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FullscreenIncludes {
    #[serde(default)]
    pub tabs: bool,
    #[serde(default)]
    pub framestrip: bool,
    #[serde(default = "default_true")]
    pub seekbar: bool,
    #[serde(default)]
    pub timeline: bool,
    #[serde(default)]
    pub markup: bool,
}

impl Default for FullscreenIncludes {
    fn default() -> Self {
        FullscreenIncludes {
            tabs: false,
            framestrip: false,
            seekbar: true,
            timeline: false,
            markup: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prefs {
    #[serde(default)]
    pub recent_projects: Vec<String>,
    #[serde(default)]
    pub templates: Vec<ScriptTemplate>,
    #[serde(default = "default_count")]
    pub default_count: u32,
    #[serde(default = "default_min_distance")]
    pub min_distance: f64,
    #[serde(default)]
    pub margin: MarginOpt,
    #[serde(default, rename = "match")]
    pub r#match: Option<String>,
    #[serde(default)]
    pub ordered_comparisons: bool,
    #[serde(default = "default_zoom")]
    pub default_zoom: String,
    #[serde(default)]
    pub pixel_perfect: bool,
    #[serde(default = "default_zoom_algo")]
    pub zoom_algo: String,
    #[serde(default = "default_fullscreen_mode")]
    pub fullscreen_mode: String,
    #[serde(default)]
    pub fullscreen_includes: FullscreenIncludes,
    #[serde(default = "default_info_pos")]
    pub info_box_position: String,
    #[serde(default = "default_info_scale")]
    pub info_box_scale: f64,
    #[serde(default = "default_weave_frames")]
    pub weave_frames: u32,
    #[serde(default = "default_true")]
    pub watermark: bool,
    #[serde(default)]
    pub preview_bg: serde_json::Value,
    #[serde(default)]
    pub preview_border: serde_json::Value,
    #[serde(default)]
    pub hwdevice: String,
    #[serde(default = "default_true")]
    pub hwfallback: bool,
    #[serde(default = "default_true")]
    pub check_for_updates: bool,
    #[serde(default = "default_last_tab")]
    pub last_tab: String,
    #[serde(default = "default_preview_mode")]
    pub preview_mode: String,
    #[serde(default)]
    pub seek_base: u64,
    #[serde(default)]
    pub last_project: String,
}

impl Default for Prefs {
    fn default() -> Self {
        Prefs {
            recent_projects: Vec::new(),
            templates: Vec::new(),
            default_count: default_count(),
            min_distance: default_min_distance(),
            margin: MarginOpt::default(),
            r#match: None,
            ordered_comparisons: false,
            default_zoom: default_zoom(),
            pixel_perfect: false,
            zoom_algo: default_zoom_algo(),
            fullscreen_mode: default_fullscreen_mode(),
            fullscreen_includes: FullscreenIncludes::default(),
            info_box_position: default_info_pos(),
            info_box_scale: default_info_scale(),
            weave_frames: default_weave_frames(),
            watermark: true,
            preview_bg: serde_json::Value::Null,
            preview_border: serde_json::Value::Null,
            hwdevice: String::new(),
            hwfallback: true,
            check_for_updates: true,
            last_tab: default_last_tab(),
            preview_mode: default_preview_mode(),
            seek_base: 0,
            last_project: String::new(),
        }
    }
}

const RECENTS_CAP: usize = 12;

fn prefs_path(dir: &PathBuf) -> PathBuf {
    dir.join("prefs.json")
}

pub fn load(dir: &PathBuf) -> Prefs {
    match std::fs::read_to_string(prefs_path(dir)) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => Prefs::default(),
    }
}

pub fn save(dir: &PathBuf, prefs: &Prefs) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    std::fs::write(prefs_path(dir), text).map_err(|e| e.to_string())
}

pub fn push_recent(dir: &PathBuf, path: &str) {
    let mut prefs = load(dir);
    prefs.recent_projects.retain(|p| p != path);
    prefs.recent_projects.insert(0, path.to_string());
    prefs.recent_projects.truncate(RECENTS_CAP);
    let _ = save(dir, &prefs);
}

const SETTINGS_ENTRY: &str = "settings.json";
const THUMB_ENTRY: &str = "thumbnail.jpg";

fn zip_opts() -> zip::write::SimpleFileOptions {
    zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Zstd)
        .compression_level(Some(19))
}

fn decode_data_url(url: &str) -> Option<Vec<u8>> {
    use base64::Engine;
    let comma = url.find(',')?;
    if !url[..comma].contains("base64") {
        return None;
    }
    base64::engine::general_purpose::STANDARD.decode(&url[comma + 1..]).ok()
}

pub fn load_project(path: &str) -> Result<Config, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("not a valid project file: {e}"))?;

    let mut json = String::new();
    zip.by_name(SETTINGS_ENTRY)
        .map_err(|e| format!("not a valid project file: {e}"))?
        .read_to_string(&mut json)
        .map_err(|e| e.to_string())?;
    let mut cfg: Config =
        serde_json::from_str(&json).map_err(|e| format!("not a valid project file: {e}"))?;

    if let Ok(mut f) = zip.by_name(THUMB_ENTRY) {
        let mut bytes = Vec::new();
        if f.read_to_end(&mut bytes).is_ok() && !bytes.is_empty() {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            cfg.thumbnail = format!("data:image/jpeg;base64,{b64}");
        }
    }
    Ok(cfg)
}

pub fn save_project(path: &str, project: &Config) -> Result<(), String> {
    use std::io::Write;
    if let Some(parent) = std::path::Path::new(path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = format!("{path}.tmp");
    {
        let file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);

        let mut cfg = project.clone();
        let thumb = std::mem::take(&mut cfg.thumbnail);
        let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
        zip.start_file(SETTINGS_ENTRY, zip_opts()).map_err(|e| e.to_string())?;
        zip.write_all(json.as_bytes()).map_err(|e| e.to_string())?;

        if let Some(bytes) = decode_data_url(&thumb) {
            zip.start_file(THUMB_ENTRY, zip_opts()).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }

        zip.finish().map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_prefs(app: AppHandle) -> Result<Prefs, String> {
    Ok(load(&directory(&app)?))
}

#[tauri::command]
pub fn save_templates(app: AppHandle, templates: Vec<ScriptTemplate>) -> Result<(), String> {
    let dir = directory(&app)?;
    let mut prefs = load(&dir);
    prefs.templates = templates;
    save(&dir, &prefs)
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
    let paths = load(&directory(&app)?).recent_projects;
    Ok(paths
        .into_iter()
        .map(|p| {
            let cfg = load_project(&p).ok();
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
    margin: MarginOpt,
    frame_match: Option<String>,
    ordered_comparisons: bool,
    default_zoom: String,
    pixel_perfect: bool,
    zoom_algo: String,
    fullscreen_mode: String,
    fullscreen_includes: FullscreenIncludes,
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
    let dir = directory(&app)?;
    let mut prefs = load(&dir);
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
    save(&dir, &prefs)
}

#[tauri::command]
pub fn set_ui_state(
    app: AppHandle,
    last_tab: String,
    preview_mode: String,
    seek_base: u64,
) -> Result<(), String> {
    let dir = directory(&app)?;
    let mut prefs = load(&dir);
    prefs.last_tab = last_tab;
    prefs.preview_mode = preview_mode;
    prefs.seek_base = seek_base;
    save(&dir, &prefs)
}

#[tauri::command]
pub fn set_last_project(app: AppHandle, path: String) -> Result<(), String> {
    let dir = directory(&app)?;
    let mut prefs = load(&dir);
    prefs.last_project = path;
    save(&dir, &prefs)
}

#[tauri::command]
pub fn mark_recent(app: AppHandle, path: String) -> Result<(), String> {
    push_recent(&directory(&app)?, &path);
    Ok(())
}

#[tauri::command]
pub fn remove_recent(app: AppHandle, path: String) -> Result<(), String> {
    let dir = directory(&app)?;
    let mut prefs = load(&dir);
    prefs.recent_projects.retain(|p| p != &path);
    let _ = save(&dir, &prefs);
    Ok(())
}
