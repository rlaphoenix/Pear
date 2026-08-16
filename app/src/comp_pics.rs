use crate::commands::{export_name, AppState, GenParams, SaveProgress};
use crate::config;
use crate::share::{column_label, for_each_cell, TmdbTitle, UploadOpts};
use serde::Deserialize;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

pub(crate) fn upload(
    app: &AppHandle,
    st: &AppState,
    params: &GenParams,
    overlays: &HashMap<u32, String>,
    positions: &[u64],
    opts: &UploadOpts,
) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let n_cols = params.sources.len();
    let n_rows = positions.len();
    let api_key = config::load(app).comp_pics_api_key.trim().to_string();
    let auth = (!api_key.is_empty()).then_some(api_key);

    let (expire_days, expiration_type) = if auth.is_some() {
        let ty = if opts.expiration_type.trim().is_empty() {
            "from_last_access".to_string()
        } else {
            opts.expiration_type.clone()
        };
        (opts.expire_days, ty)
    } else {
        (Some(7), "from_last_access".to_string())
    };
    let show_name = opts
        .title
        .as_ref()
        .map(|t: &TmdbTitle| {
            let kind = if t.media_type == "tv" { "show" } else { "movie" };
            match t.year {
                Some(y) => format!("{} {} [{}-{}]", t.name, y, kind, t.id),
                None => format!("{} [{}-{}]", t.name, kind, t.id),
            }
        })
        .unwrap_or_default();

    let mut form: Vec<(&str, String)> = vec![
        ("name", opts.name.clone()),
        ("show_name", show_name),
        ("tags", opts.tags.join(",")),
        ("total_rows", n_rows.to_string()),
        ("total_columns", n_cols.to_string()),
        ("expiration_type", expiration_type),
    ];
    if let Some(days) = expire_days {
        form.push(("expiration_enabled", "true".to_string()));
        form.push(("expiration_days", days.to_string()));
    }
    let mut create = client.post("https://comp.pics/api/v1/comparison").form(&form);
    if let Some(key) = &auth {
        create = create.header("Authorization", key);
    }
    let resp = create.send().map_err(|e| {
        eprintln!("[comppics] POST /comparison request error: {e}");
        e.to_string()
    })?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().unwrap_or_default();
        eprintln!("[comppics] create failed: {}", body.chars().take(300).collect::<String>());
        return Err(format!("Could not create comparison ({status}): {body}"));
    }
    #[derive(Deserialize)]
    struct CreateResp {
        comparison_id: String,
    }
    let id = resp.json::<CreateResp>().map_err(|e| e.to_string())?.comparison_id;

    let total = n_rows * n_cols;
    let mut done = 0usize;
    for_each_cell(st, params, positions, overlays, |row, col, buf| {
        let src = &params.sources[col];
        let filename = format!("{:04}_{}.png", row + 1, export_name(src));
        let part = reqwest::blocking::multipart::Part::bytes(buf)
            .file_name(filename.clone())
            .mime_str("image/png")
            .map_err(|e| e.to_string())?;
        let mp = reqwest::blocking::multipart::Form::new()
            .part("file", part)
            .text("row", row.to_string())
            .text("column", col.to_string())
            .text("original_filename", filename)
            .text("custom_name", column_label(src));
        let mut req = client
            .post(format!("https://comp.pics/api/v1/comparison/{id}/image"))
            .multipart(mp);
        if let Some(key) = &auth {
            req = req.header("Authorization", key);
        }
        let up = req.send().map_err(|e| {
            eprintln!("[comppics] POST /comparison/{id}/image ({row},{col}) request error: {e}");
            e.to_string()
        })?;
        let status = up.status();
        if !status.is_success() {
            let body = up.text().unwrap_or_default();
            eprintln!("[comppics] image ({row},{col}) failed: {}", body.chars().take(300).collect::<String>());
            return Err(format!("Could not upload image ({status}): {body}"));
        }
        done += 1;
        let _ = app.emit("upload-progress", SaveProgress { done, total });
        Ok(())
    })?;

    Ok(format!("https://comp.pics/compare/{id}"))
}
