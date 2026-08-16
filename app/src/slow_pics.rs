use crate::commands::{export_name, AppState, GenParams, SaveProgress};
use crate::config;
use crate::share::{column_label, for_each_cell, TmdbTitle, UploadOpts};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use reqwest::cookie::{CookieStore, Jar};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::mpsc::sync_channel;
use std::sync::{Arc, Mutex};
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
    let remember_me = seed_token(config::load(app).slowpics_cookie.trim());

    let mut guard = SESSION.lock().unwrap();
    if let Some((client, xsrf, cached)) = guard.as_ref() {
        if *cached == remember_me {
            return Ok((client.clone(), xsrf.clone()));
        }
    }
    let cookie = if remember_me.is_empty() {
        String::new()
    } else {
        format!("remember-me={remember_me}")
    };
    let (client, xsrf, jar) = session(&browser_id(app), &cookie)?;
    let remember_me = match jar_cookie(&jar, "remember-me") {
        Some(rotated) if rotated != remember_me => {
            let _ = config::update(app, |p| p.slowpics_cookie = format!("remember-me={rotated}"));
            rotated
        }
        _ => remember_me,
    };
    *guard = Some((client.clone(), xsrf.clone(), remember_me));
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
    let resp = match header(client.get(url).query(query), &xsrf).send() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[tags] request error: {e}");
            return Vec::new();
        }
    };
    let status = resp.status();
    let body = resp.text().unwrap_or_default();
    if !status.is_success() {
        if matches!(status.as_u16(), 401 | 403) {
            invalidate_session();
        }
        eprintln!("[tags] non-success body: {}", snippet(&body));
        return Vec::new();
    }
    match serde_json::from_str::<Vec<TagOption>>(&body) {
        Ok(tags) => {
            tags.into_iter()
                .filter(|t| !t.label.is_empty() && !t.value.is_empty())
                .collect()
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
) -> Result<(reqwest::blocking::Client, String, Arc<Jar>), String> {
    let jar = Arc::new(Jar::default());
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
        .cookie_provider(jar.clone())
        .build()
        .map_err(|e| e.to_string())?;
    prime(&client)?;
    let xsrf = jar_cookie(&jar, "XSRF-TOKEN").unwrap_or_default();
    Ok((client, xsrf, jar))
}

fn cookie_value(header: &str, name: &str) -> Option<String> {
    let prefix = format!("{name}=");
    header.split(';').find_map(|pair| pair.trim().strip_prefix(&prefix).map(str::to_string))
}

fn jar_cookie(jar: &Jar, name: &str) -> Option<String> {
    let base = reqwest::Url::parse("https://slow.pics").ok()?;
    cookie_value(jar.cookies(&base)?.to_str().ok()?, name)
}

fn seed_token(seed: &str) -> String {
    if seed.is_empty() {
        return String::new();
    }
    cookie_value(seed, "remember-me").unwrap_or_else(|| seed.to_string())
}

fn prime(client: &reqwest::blocking::Client) -> Result<(), String> {
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
    if !nav.status().is_success() {
        return Err(format!("slow.pics is unavailable ({})", nav.status()));
    }
    Ok(())
}

const MAX_UPLOAD_CONCURRENCY: usize = 4;
const MAX_UPLOAD_RETRIES: u32 = 25;

enum ImageOutcome {
    Done,
    Retry { throttle: bool, pre_wait: Duration, err: String },
    Fatal(String),
}

fn jitter_ms(range_ms: u64) -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.subsec_nanos() as u64 % range_ms.max(1))
        .unwrap_or(0)
}

fn retry_wait(attempt: u32) -> Duration {
    let backoff = (1000u64 << attempt.min(4)).min(10_000);
    Duration::from_millis(backoff + 1000 + jitter_ms(500))
}

fn sleep_abortable(dur: Duration, aborted: &AtomicBool) {
    let step = Duration::from_millis(200);
    let mut left = dur;
    while !left.is_zero() && !aborted.load(Ordering::SeqCst) {
        let s = left.min(step);
        std::thread::sleep(s);
        left = left.saturating_sub(s);
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
    let retry = |throttle, pre_wait, err| ImageOutcome::Retry { throttle, pre_wait, err };
    let part = match reqwest::blocking::multipart::Part::bytes(buf)
        .file_name(filename)
        .mime_str("image/png")
    {
        Ok(p) => p,
        Err(e) => return retry(false, Duration::ZERO, e.to_string()),
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
            return retry(false, Duration::ZERO, e.to_string());
        }
    };
    let status = up.status();
    let err_msg = up.headers().get("X-Error-Message").and_then(|v| v.to_str().ok()).map(str::to_string);
    let complete = status.as_u16() == 400 && err_msg.as_deref() == Some("IMAGE_IS_COMPLETE");
    if status.is_success() || complete {
        return ImageOutcome::Done;
    }
    let body = up.text().unwrap_or_default();
    let fatal_token = |t: &str| err_msg.as_deref() == Some(t) || body.trim() == t;
    let fatal = status.as_u16() == 403
        || fatal_token("COLLECTION_CREATED_BY_ANOTHER_USER")
        || fatal_token("COLLECTION_DOES_NOT_EXIST");
    if fatal {
        eprintln!("[slowpics] image ({row},{col}) fatal ({status}): {}", body.chars().take(300).collect::<String>());
        return ImageOutcome::Fatal(format!("Upload rejected ({status}): {body}"));
    }
    let throttle = status.as_u16() == 524;
    let pre_wait = if status.is_server_error() && !throttle {
        Duration::from_millis(10_000 + jitter_ms(500))
    } else {
        Duration::ZERO
    };
    eprintln!("[slowpics] image ({row},{col}) failed ({status}): {}", body.chars().take(300).collect::<String>());
    retry(throttle, pre_wait, format!("Could not upload image ({status}): {body}"))
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
    let throttled = AtomicBool::new(false);
    let serialize = Mutex::new(());
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
                    continue;
                };
                let filename = format!("{:04}_{}.png", row + 1, export_name(&params.sources[col]));
                let _lane = throttled.load(Ordering::SeqCst).then(|| serialize.lock().unwrap());
                let mut attempt = 0u32;
                let failure = loop {
                    if aborted.load(Ordering::SeqCst) {
                        break None;
                    }
                    match upload_image(
                        client, &xsrf, &meta.collection_uuid, &browser_id, &uuid, row, col,
                        buf.clone(), filename.clone(),
                    ) {
                        ImageOutcome::Done => {
                            let n = done.fetch_add(1, Ordering::SeqCst) + 1;
                            let _ = app.emit("upload-progress", SaveProgress { done: n, total });
                            break None;
                        }
                        ImageOutcome::Fatal(err) => break Some(err),
                        ImageOutcome::Retry { throttle, pre_wait, err } => {
                            if throttle {
                                throttled.store(true, Ordering::SeqCst);
                            }
                            if attempt >= MAX_UPLOAD_RETRIES {
                                break Some(err);
                            }
                            sleep_abortable(pre_wait + retry_wait(attempt), &aborted);
                            attempt += 1;
                        }
                    }
                };
                if let Some(msg) = failure {
                    *error.lock().unwrap() = Some(msg);
                    aborted.store(true, Ordering::SeqCst);
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

    Ok(format!("https://slow.pics/c/{}", meta.key))
}
