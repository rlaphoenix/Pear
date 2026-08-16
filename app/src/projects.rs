use crate::commands::AppState;
use crate::config;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, State};

fn default_true() -> bool {
    true
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

/// Compute a stable identity (size + partial content hash) for a source file.
pub fn identity(path: &str) -> Result<FileId, String> {
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

fn default_gutter_width() -> f64 {
    120.0
}
fn default_up_algo() -> String {
    "Triangle".into()
}
fn default_down_algo() -> String {
    "Lanczos3".into()
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

/// Read a project document (a zip of `settings.json` plus an optional thumbnail).
pub fn load(path: &str) -> Result<Config, String> {
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

/// Write a project document with an atomic write (temp file + rename).
pub fn save(path: &str, project: &Config) -> Result<(), String> {
    use std::io::Write;
    if let Some(parent) = Path::new(path).parent() {
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

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// Project-document Tauri commands.

#[tauri::command]
pub fn load_project(path: String) -> Result<Config, String> {
    load(&path)
}

#[tauri::command]
pub fn save_project(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    mut project: Config,
) -> Result<(), String> {
    let now = now_secs();
    let existing = load(&path).ok();
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
    state.with_project_write(Path::new(&path), || save(&path, &project))?;
    config::push_recent(&app, &path)
}

#[tauri::command]
pub async fn file_id(path: String) -> Result<FileId, String> {
    tauri::async_runtime::spawn_blocking(move || identity(&path))
        .await
        .map_err(|e| e.to_string())?
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
    let paths = config::load(&app).recent_projects;
    Ok(paths
        .into_iter()
        .map(|p| {
            let cfg = load(&p).ok();
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
