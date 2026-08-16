use crate::commands::{render_position, stem, AppState, GenParams, SourceParams};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use tauri::{AppHandle, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmdbTitle {
    pub media_type: String, // "movie" | "tv"
    pub id: u64,
    pub name: String,
    #[serde(default)]
    pub year: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadOpts {
    pub provider: String, // "comppics" | "slowpics"
    pub name: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub expire_days: Option<u32>,
    #[serde(default)]
    pub expiration_type: String,
    #[serde(default)]
    pub title: Option<TmdbTitle>,
    #[serde(default)]
    pub visibility: bool, // slow.pics: true = public, false = unlisted
    #[serde(default)]
    pub nsfw: bool, // slow.pics `hentai` flag
}

pub(crate) fn column_label(src: &SourceParams) -> String {
    let name = src.name.trim();
    if name.is_empty() { stem(&src.path) } else { name.to_string() }
}

pub(crate) fn for_each_cell(
    st: &AppState,
    params: &GenParams,
    positions: &[u64],
    overlays: &HashMap<u32, String>,
    mut f: impl FnMut(usize, usize, Vec<u8>) -> Result<(), String>,
) -> Result<(), String> {
    for (row, &pos) in positions.iter().enumerate() {
        let imgs = render_position(st, params, pos, overlays.get(&(row as u32)))?;
        for (col, img) in imgs.into_iter().enumerate() {
            let mut buf = Vec::new();
            img.write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Png)
                .map_err(|e| e.to_string())?;
            f(row, col, buf)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn upload_comparison(
    app: AppHandle,
    state: State<'_, AppState>,
    params: GenParams,
    overlays: Option<HashMap<u32, String>>,
    positions: Vec<u64>,
    opts: UploadOpts,
) -> Result<String, String> {
    let st = state.inner().clone();
    let overlays = overlays.unwrap_or_default();
    tauri::async_runtime::spawn_blocking(move || {
        if params.sources.is_empty() || positions.is_empty() {
            return Err("Nothing to share - add sources and comparisons first.".to_string());
        }
        if opts.provider == "slowpics" {
            crate::slow_pics::upload(&app, &st, &params, &overlays, &positions, &opts)
        } else {
            crate::comp_pics::upload(&app, &st, &params, &overlays, &positions, &opts)
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
