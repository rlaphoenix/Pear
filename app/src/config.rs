use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn directory(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| e.to_string())
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
fn default_margin() -> f64 {
    0.02
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

fn prefs_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(directory(app)?.join("prefs.json"))
}

pub fn load(app: &AppHandle) -> Prefs {
    let Ok(path) = prefs_path(app) else {
        return Prefs::default();
    };
    match std::fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).unwrap_or_default(),
        Err(_) => Prefs::default(),
    }
}

pub fn save(app: &AppHandle, prefs: &Prefs) -> Result<(), String> {
    let path = prefs_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let text = serde_json::to_string_pretty(prefs).map_err(|e| e.to_string())?;
    let mut tmp = path.clone().into_os_string();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    std::fs::write(&tmp, text).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

pub fn update(app: &AppHandle, f: impl FnOnce(&mut Prefs)) -> Result<(), String> {
    let mut prefs = load(app);
    f(&mut prefs);
    save(app, &prefs)
}

pub fn push_recent(app: &AppHandle, path: &str) -> Result<(), String> {
    update(app, |prefs| {
        prefs.recent_projects.retain(|p| p != path);
        prefs.recent_projects.insert(0, path.to_string());
        prefs.recent_projects.truncate(RECENTS_CAP);
    })
}

#[tauri::command]
pub fn load_prefs(app: AppHandle) -> Result<Prefs, String> {
    Ok(load(&app))
}

#[tauri::command]
pub fn save_templates(app: AppHandle, templates: Vec<ScriptTemplate>) -> Result<(), String> {
    update(&app, |prefs| prefs.templates = templates)
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
    update(&app, |prefs| {
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
    })
}

#[tauri::command]
pub fn set_ui_state(
    app: AppHandle,
    last_tab: String,
    preview_mode: String,
    seek_base: u64,
) -> Result<(), String> {
    update(&app, |prefs| {
        prefs.last_tab = last_tab;
        prefs.preview_mode = preview_mode;
        prefs.seek_base = seek_base;
    })
}

#[tauri::command]
pub fn set_last_project(app: AppHandle, path: String) -> Result<(), String> {
    update(&app, |prefs| prefs.last_project = path)
}

#[tauri::command]
pub fn mark_recent(app: AppHandle, path: String) -> Result<(), String> {
    push_recent(&app, &path)
}

#[tauri::command]
pub fn remove_recent(app: AppHandle, path: String) -> Result<(), String> {
    update(&app, |prefs| prefs.recent_projects.retain(|p| p != &path))
}
