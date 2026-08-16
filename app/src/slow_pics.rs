use crate::commands::{export_name, AppState, GenParams, SaveProgress};
use crate::config;
use crate::share::{column_label, for_each_cell, TmdbTitle, UploadOpts};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::sync_channel;
use std::sync::{Condvar, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TMDB_BEARER: &str = "eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJmNjdiYTRmOWIwODBhNmEwNDQxMmNmMTIwYTU4YjM4NiIsInN1YiI6IjYzNDYyZGY5MDBmYjZiMDA3OWY0ODllMiIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.dsI7u_kFT_X0nXLUQOsTMDL2odaF2PhFr5pe2gU7V2M";

#[tauri::command]
pub async fn search_titles(query: String) -> Result<Vec<TmdbTitle>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(15))
            .build()
            .map_err(|e| e.to_string())?;
        let mut hits = Vec::new();
        for (kind, date_field, name_field) in
            [("movie", "release_date", "title"), ("tv", "first_air_date", "name")]
        {
            let resp = client
                .get(format!("https://api.themoviedb.org/3/search/{kind}"))
                .query(&[
                    ("language", "en-US"),
                    ("include_adult", "false"),
                    ("query", query.as_str()),
                ])
                .header("Authorization", format!("Bearer {TMDB_BEARER}"))
                .header("Accept", "application/json")
                .send()
                .map_err(|e| e.to_string())?;
            if !resp.status().is_success() {
                continue;
            }
            let json: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
            for item in json.get("results").and_then(|r| r.as_array()).into_iter().flatten() {
                let (Some(id), Some(name)) =
                    (item.get("id").and_then(|v| v.as_u64()), item.get(name_field).and_then(|v| v.as_str()))
                else {
                    continue;
                };
                let year = item
                    .get(date_field)
                    .and_then(|v| v.as_str())
                    .and_then(|d| d.get(0..4))
                    .and_then(|y| y.parse::<u32>().ok());
                hits.push(TmdbTitle {
                    media_type: kind.to_string(),
                    id,
                    name: name.to_string(),
                    year,
                });
            }
        }
        Ok(hits)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Deserialize a field that may be absent OR explicitly `null` into `T::default()`.
fn null_or_missing<'de, D, T>(d: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de> + Default,
{
    Ok(Option::<T>::deserialize(d)?.unwrap_or_default())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagOption {
    pub label: String,
    pub value: String,
    #[serde(default, deserialize_with = "null_or_missing")]
    pub synonyms: Vec<String>,
}

static SESSION: Mutex<Option<(reqwest::blocking::Client, String, String)>> = Mutex::new(None);

fn get_session(app: &AppHandle) -> Result<(reqwest::blocking::Client, String), String> {
    let cookie = config::load(app).slowpics_cookie.trim().to_string();
    let mut guard = SESSION.lock().unwrap();
    if let Some((client, xsrf, cached_cookie)) = guard.as_ref() {
        if *cached_cookie == cookie {
            return Ok((client.clone(), xsrf.clone()));
        }
    }
    let (client, xsrf) = session(&browser_id(app), &cookie)?;
    *guard = Some((client.clone(), xsrf.clone(), cookie));
    Ok((client, xsrf))
}

fn invalidate_session() {
    *SESSION.lock().unwrap() = None;
}

fn get_tags(app: &AppHandle, url: &str, query: &[(&str, &str)]) -> Vec<TagOption> {
    let snippet = |s: &str| s.chars().take(400).collect::<String>();
    let (client, xsrf) = match get_session(app) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[tags] session failed: {e}");
            return Vec::new();
        }
    };
    eprintln!("[tags] GET {url} {query:?}");
    let resp = match header(client.get(url).query(query), &xsrf).send() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[tags] request error: {e}");
            return Vec::new();
        }
    };
    let status = resp.status();
    let body = resp.text().unwrap_or_default();
    eprintln!("[tags] status {status}, {} bytes", body.len());
    if !status.is_success() {
        if matches!(status.as_u16(), 401 | 403) {
            invalidate_session();
        }
        eprintln!("[tags] non-success body: {}", snippet(&body));
        return Vec::new();
    }
    match serde_json::from_str::<Vec<TagOption>>(&body) {
        Ok(tags) => {
            let out: Vec<TagOption> = tags
                .into_iter()
                .filter(|t| !t.label.is_empty() && !t.value.is_empty())
                .collect();
            eprintln!("[tags] parsed {} tags", out.len());
            out
        }
        Err(e) => {
            eprintln!("[tags] parse error: {e}; body: {}", snippet(&body));
            Vec::new()
        }
    }
}

#[tauri::command]
pub async fn list_tags(app: AppHandle) -> Result<Vec<TagOption>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        Ok(get_tags(&app, "https://slow.pics/api/tags", &[]))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn autofill_tags(app: AppHandle, name: String) -> Result<Vec<TagOption>, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Ok(Vec::new());
    }
    tauri::async_runtime::spawn_blocking(move || {
        Ok(get_tags(&app, "https://slow.pics/api/tags/autofill", &[("name", name.as_str())]))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn header(
    req: reqwest::blocking::RequestBuilder,
    xsrf: &str,
) -> reqwest::blocking::RequestBuilder {
    req.header("User-Agent", BROWSER_UA)
        .header("Accept", "application/json")
        .header("Accept-Language", "en-US,en;q=0.9")
        .header("X-XSRF-TOKEN", xsrf)
        .header("Origin", "https://slow.pics")
        .header("Referer", "https://slow.pics/comparison")
        .header("Sec-Fetch-Site", "same-origin")
        .header("Sec-Fetch-Mode", "cors")
        .header("Sec-Fetch-Dest", "empty")
}

fn browser_id(app: &AppHandle) -> String {
    let mut prefs = config::load(app);
    if prefs.slowpics_browser_id.trim().is_empty() {
        prefs.slowpics_browser_id = uuid::Uuid::new_v4().to_string();
        let _ = config::save(app, &prefs);
    }
    prefs.slowpics_browser_id
}

fn session(
    browser_id: &str,
    cookie: &str,
) -> Result<(reqwest::blocking::Client, String), String> {
    let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());
    let base = reqwest::Url::parse("https://slow.pics").map_err(|e| e.to_string())?;
    jar.add_cookie_str(&format!("BROWSER-ID={browser_id}; Path=/"), &base);
    for pair in cookie.split(';') {
        let pair = pair.trim();
        if pair.contains('=') {
            jar.add_cookie_str(&format!("{pair}; Path=/"), &base);
        }
    }
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(180))
        .cookie_provider(jar)
        .build()
        .map_err(|e| e.to_string())?;
    let xsrf = prime(&client)?;
    Ok((client, xsrf))
}

fn prime(client: &reqwest::blocking::Client) -> Result<String, String> {
    let nav = client
        .get("https://slow.pics/comparison")
        .header("User-Agent", BROWSER_UA)
        .header(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        )
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .map_err(|e| e.to_string())?;
    eprintln!("[slowpics] GET /comparison -> {}", nav.status());
    if !nav.status().is_success() {
        return Err(format!("slow.pics is unavailable ({})", nav.status()));
    }
    let cookie = |name: &str| -> Option<String> {
        for hv in nav.headers().get_all(reqwest::header::SET_COOKIE) {
            let Ok(s) = hv.to_str() else { continue };
            for part in s.split(';') {
                if let Some(v) = part.trim().strip_prefix(&format!("{name}=")) {
                    return Some(v.to_string());
                }
            }
        }
        None
    };
    let xsrf = cookie("XSRF-TOKEN").unwrap_or_default();
    eprintln!("[slowpics] primed; xsrf.len={}", xsrf.len());
    Ok(xsrf)
}

const MAX_UPLOAD_CONCURRENCY: usize = 4;

enum ImageOutcome {
    Done,
    RateLimited,
    Failed(String),
}

struct UploadGate {
    state: Mutex<(usize, usize)>, // (in_flight, max)
    cv: Condvar,
}

impl UploadGate {
    fn new(max: usize) -> Self {
        UploadGate { state: Mutex::new((0, max)), cv: Condvar::new() }
    }
    fn acquire(&self) {
        let mut s = self.state.lock().unwrap();
        while s.0 >= s.1 {
            s = self.cv.wait(s).unwrap();
        }
        s.0 += 1;
    }
    fn release(&self) {
        self.state.lock().unwrap().0 -= 1;
        self.cv.notify_one();
    }
    fn set_max(&self, max: usize) {
        self.state.lock().unwrap().1 = max;
        self.cv.notify_all();
    }
}

fn upload_image(
    client: &reqwest::blocking::Client,
    xsrf: &str,
    collection_uuid: &str,
    browser_id: &str,
    uuid: &str,
    row: usize,
    col: usize,
    buf: Vec<u8>,
    filename: String,
) -> ImageOutcome {
    let part = match reqwest::blocking::multipart::Part::bytes(buf)
        .file_name(filename)
        .mime_str("image/png")
    {
        Ok(p) => p,
        Err(e) => return ImageOutcome::Failed(e.to_string()),
    };
    let form = reqwest::blocking::multipart::Form::new()
        .text("collectionUuid", collection_uuid.to_string())
        .text("imageUuid", uuid.to_string())
        .text("browserId", browser_id.to_string())
        .part("file", part);
    let up = match header(client.post(format!("https://slow.pics/upload/image/{uuid}")), xsrf)
        .multipart(form)
        .send()
    {
        Ok(u) => u,
        Err(e) => {
            eprintln!("[slowpics] POST /upload/image ({row},{col}) request error: {e}");
            return ImageOutcome::Failed(e.to_string());
        }
    };
    let status = up.status();
    let complete = status.as_u16() == 400
        && up.headers().get("X-Error-Message").and_then(|v| v.to_str().ok())
            == Some("IMAGE_IS_COMPLETE");
    eprintln!(
        "[slowpics] POST /upload/image ({row},{col}) -> {status}{}",
        if complete { " (already complete)" } else { "" }
    );
    if status.is_success() || complete {
        return ImageOutcome::Done;
    }
    if status.as_u16() == 524 {
        return ImageOutcome::RateLimited;
    }
    let body = up.text().unwrap_or_default();
    eprintln!("[slowpics] image ({row},{col}) failed: {}", body.chars().take(300).collect::<String>());
    ImageOutcome::Failed(format!("Could not upload image ({status}): {body}"))
}

pub(crate) fn upload(
    app: &AppHandle,
    st: &AppState,
    params: &GenParams,
    overlays: &HashMap<u32, String>,
    positions: &[u64],
    opts: &UploadOpts,
) -> Result<String, String> {
    let n_cols = params.sources.len();
    let n_rows = positions.len();

    let browser_id = browser_id(app);
    let (client, xsrf) = get_session(app)?;
    let client = &client;

    let mut mp = reqwest::blocking::multipart::Form::new()
        .text("collectionName", opts.name.clone())
        .text("browserId", browser_id.clone())
        .text("optimizeImages", "true")
        .text("stripHdr", "false")
        .text("desiredFileType", "image/png")
        .text("hentai", opts.nsfw.to_string())
        .text("public", opts.visibility.to_string())
        .text("visibility", if opts.visibility { "PUBLIC" } else { "LINK_ONLY" })
        .text(
            "removeAfter",
            opts.expire_days.filter(|&d| d > 0).map(|d| d.to_string()).unwrap_or_default(),
        );
    if let Some(t) = &opts.title {
        mp = mp.text("tmdbId", format!("{}_{}", t.media_type.to_uppercase(), t.id));
    }
    for (i, tag) in opts.tags.iter().enumerate() {
        mp = mp.text(format!("tags[{i}]"), tag.clone());
    }
    for (row, &pos) in positions.iter().enumerate() {
        mp = mp
            .text(format!("comparisons[{row}].name"), pos.to_string())
            .text(format!("comparisons[{row}].hentai"), opts.nsfw.to_string())
            .text(format!("comparisons[{row}].sortOrder"), row.to_string());
        for (col, src) in params.sources.iter().enumerate() {
            mp = mp
                .text(format!("comparisons[{row}].images[{col}].name"), column_label(src))
                .text(format!("comparisons[{row}].images[{col}].sortOrder"), col.to_string());
        }
    }
    let resp = header(client.post("https://slow.pics/upload/comparison"), &xsrf)
        .multipart(mp)
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().unwrap_or_default();
    eprintln!("[slowpics] POST /upload/comparison -> {status}, {} bytes", body.len());
    if !status.is_success() {
        if matches!(status.as_u16(), 401 | 403) {
            invalidate_session();
        }
        eprintln!("[slowpics] create failed: {}", body.chars().take(500).collect::<String>());
        return Err(format!("Could not create collection ({status}): {body}"));
    }
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Meta {
        key: String,
        collection_uuid: String,
        images: Vec<Vec<String>>,
    }
    let meta: Meta = serde_json::from_str(&body).map_err(|e| e.to_string())?;

    let total = n_rows * n_cols;
    let done = AtomicUsize::new(0);
    let aborted = AtomicBool::new(false);
    let error: Mutex<Option<String>> = Mutex::new(None);
    let gate = UploadGate::new(MAX_UPLOAD_CONCURRENCY);
    let (tx, rx) = sync_channel::<(usize, usize, Vec<u8>)>(MAX_UPLOAD_CONCURRENCY);
    let rx = Mutex::new(rx);

    let render_err = std::thread::scope(|scope| {
        for _ in 0..MAX_UPLOAD_CONCURRENCY {
            scope.spawn(|| loop {
                let job = rx.lock().unwrap().recv();
                let (row, col, buf) = match job {
                    Ok(j) => j,
                    Err(_) => break,
                };
                if aborted.load(Ordering::SeqCst) {
                    continue; // drain remaining jobs so the producer never blocks on a full channel
                }
                let Some(uuid) = meta.images.get(row).and_then(|r| r.get(col)).cloned() else {
                    *error.lock().unwrap() =
                        Some("slow.pics returned an unexpected image layout".to_string());
                    aborted.store(true, Ordering::SeqCst);
                    gate.set_max(usize::MAX);
                    continue;
                };
                let filename = format!("{:04}_{}.png", row + 1, export_name(&params.sources[col]));
                loop {
                    gate.acquire();
                    if aborted.load(Ordering::SeqCst) {
                        gate.release();
                        break;
                    }
                    let outcome = upload_image(
                        client, &xsrf, &meta.collection_uuid, &browser_id, &uuid, row, col,
                        buf.clone(), filename.clone(),
                    );
                    gate.release();
                    match outcome {
                        ImageOutcome::Done => {
                            let n = done.fetch_add(1, Ordering::SeqCst) + 1;
                            let _ = app.emit("upload-progress", SaveProgress { done: n, total });
                            break;
                        }
                        ImageOutcome::RateLimited => {
                            gate.set_max(1);
                            eprintln!("[slowpics] 524 on ({row},{col}); throttling to 1 lane, retrying in 1s");
                            std::thread::sleep(Duration::from_secs(1));
                        }
                        ImageOutcome::Failed(msg) => {
                            *error.lock().unwrap() = Some(msg);
                            aborted.store(true, Ordering::SeqCst);
                            gate.set_max(usize::MAX);
                            break;
                        }
                    }
                }
            });
        }
        let r = for_each_cell(st, params, positions, overlays, |row, col, buf| {
            if aborted.load(Ordering::SeqCst) {
                return Err("upload aborted after an image failed".to_string());
            }
            tx.send((row, col, buf)).map_err(|e| e.to_string())
        });
        drop(tx);
        r
    });

    if let Some(msg) = error.into_inner().unwrap() {
        return Err(msg);
    }
    render_err?;

    eprintln!("[slowpics] collection complete -> https://slow.pics/c/{}", meta.key);
    Ok(format!("https://slow.pics/c/{}", meta.key))
}

#[cfg(test)]
mod tests {
    use super::UploadGate;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    #[test]
    fn gate_never_exceeds_max() {
        let gate = Arc::new(UploadGate::new(2));
        let peak = Arc::new(AtomicUsize::new(0));
        let live = Arc::new(AtomicUsize::new(0));
        let handles: Vec<_> = (0..8)
            .map(|_| {
                let (gate, peak, live) = (gate.clone(), peak.clone(), live.clone());
                std::thread::spawn(move || {
                    gate.acquire();
                    let n = live.fetch_add(1, Ordering::SeqCst) + 1;
                    peak.fetch_max(n, Ordering::SeqCst);
                    std::thread::sleep(std::time::Duration::from_millis(5));
                    live.fetch_sub(1, Ordering::SeqCst);
                    gate.release();
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        assert!(peak.load(Ordering::SeqCst) <= 2, "peak exceeded max");
    }

    #[test]
    fn gate_shrinks_ceiling() {
        let gate = UploadGate::new(3);
        gate.acquire();
        gate.acquire();
        gate.acquire();
        gate.set_max(1);
        gate.release();
        gate.release();
        gate.release();
        gate.acquire();
        gate.release();
    }
}
