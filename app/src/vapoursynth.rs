use dolby_vision::rpu::dovi_rpu::DoviRpu;
use image::RgbaImage;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, OnceLock};

use vapoursynth::api::API;
use vapoursynth::map::{Error as MapError, OwnedMap};
use vapoursynth::prelude::*;
use vapoursynth::video_info::{Framerate, Resolution};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceInfo {
    pub fps: f64,
    pub total: u64,
    pub width: u32,
    pub height: u32,
    pub duration: f64,
    pub sar: f64,
    pub dar: String,
    pub is_still: bool,
    pub matrix: String,
    pub range: String,
    pub transfer: String,
    pub primaries: String,
    pub hdr: String,
    pub dv_profile: Option<u8>,
    pub dv_bl_compat: Option<u8>,
}

/// Exactly ONE core may exist at a time: vs-placebo creates one Vulkan device per core, and on
/// hybrid-GPU systems (e.g. NVIDIA + AMD) a second coexisting device fails to initialise and
/// crashes the process. So a program change drops the old core (freeing its device) BEFORE
/// building the new one.
struct Live {
    program: String,
    env: Arc<Environment>,
    cancel: Arc<AtomicBool>,
    active: usize,
}
static CORE: Mutex<Option<Live>> = Mutex::new(None);
static CORE_CV: Condvar = Condvar::new();

struct Semaphore {
    permits: Mutex<usize>,
    cv: Condvar,
}
impl Semaphore {
    fn acquire(&self) {
        let mut p = self.permits.lock().unwrap();
        while *p == 0 {
            p = self.cv.wait(p).unwrap();
        }
        *p -= 1;
    }
    fn release(&self) {
        *self.permits.lock().unwrap() += 1;
        self.cv.notify_one();
    }
}
static INFLIGHT: OnceLock<Semaphore> = OnceLock::new();
fn inflight() -> &'static Semaphore {
    INFLIGHT.get_or_init(|| {
        let n = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(8);
        Semaphore { permits: Mutex::new(n.clamp(4, 32)), cv: Condvar::new() }
    })
}

fn vs_script_error<E: std::error::Error>(e: E) -> String {
    let mut msg = e.to_string();
    let mut src = e.source();
    while let Some(s) = src {
        msg = s.to_string();
        src = s.source();
    }
    format!("VapourSynth script error\n{}", msg.trim())
}

fn build_env(program: &str, index_key: Option<&str>) -> Result<Environment, String> {
    let mut env = Environment::new().map_err(vs_script_error)?;
    install_console_log(&env, index_key.map(str::to_string));
    let res = env.eval_script(program);
    if let Some(key) = index_key {
        forward_index(key, None);
    }
    res.map_err(vs_script_error)?;
    Ok(env)
}

type IndexSink = Box<dyn Fn(&str, Option<u8>) + Send + Sync>;
static INDEX_SINK: OnceLock<IndexSink> = OnceLock::new();

pub fn set_index_sink<F: Fn(&str, Option<u8>) + Send + Sync + 'static>(f: F) {
    let _ = INDEX_SINK.set(Box::new(f));
}

fn forward_index(key: &str, percent: Option<u8>) {
    if let Some(sink) = INDEX_SINK.get() {
        sink(key, percent);
    }
}

fn parse_bs_progress(msg: &str) -> Option<Option<u8>> {
    if msg.contains("indexing complete") {
        return Some(Some(100));
    }
    let rest = &msg[msg.find("index progress ")? + "index progress ".len()..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    if !digits.is_empty() && rest[digits.len()..].trim_start().starts_with('%') {
        Some(digits.parse::<u32>().ok().map(|v| v.min(100) as u8))
    } else {
        Some(None)
    }
}

type LogSink = Box<dyn Fn(MessageType, &str) + Send + Sync>;
static LOG_SINK: OnceLock<LogSink> = OnceLock::new();

pub fn set_log_sink<F: Fn(MessageType, &str) + Send + Sync + 'static>(f: F) {
    let _ = LOG_SINK.set(Box::new(f));
}

fn forward_to_console(level: MessageType, msg: &str) {
    if let Some(sink) = LOG_SINK.get() {
        sink(level, msg);
    }
}

fn core_log(msg: impl AsRef<str>) {
    forward_to_console(MessageType::Information, &format!("core: {}", msg.as_ref()));
}

fn core_dbg(msg: impl AsRef<str>) {
    forward_to_console(MessageType::Debug, &format!("core: {}", msg.as_ref()));
}

fn install_console_log(env: &Environment, index_key: Option<String>) {
    let Ok(core) = env.get_core() else { return };
    core.add_log_handler(move |level, msg| {
        forward_to_console(level, msg);
        if let Some(key) = &index_key {
            if matches!(level, MessageType::Information) {
                if let Some(pct) = parse_bs_progress(msg) {
                    forward_index(key, pct);
                }
            }
        }
    });
}

fn build_env_from_script(src: &str) -> Result<Environment, String> {
    Environment::from_script(src).map_err(vs_script_error)
}

struct CoreHandle {
    env: Arc<Environment>,
    cancel: Arc<AtomicBool>,
}
impl Drop for CoreHandle {
    fn drop(&mut self) {
        let mut slot = CORE.lock().unwrap();
        if let Some(live) = slot.as_mut() {
            if Arc::ptr_eq(&live.cancel, &self.cancel) {
                live.active = live.active.saturating_sub(1);
                core_dbg(format!("fetch released core (active={})", live.active));
            }
        }
        CORE_CV.notify_all();
    }
}

fn acquire_core(program: &str) -> Result<CoreHandle, String> {
    let mut slot = CORE.lock().unwrap();
    loop {
        let busy = match slot.as_mut() {
            Some(live) if live.program == program && !live.cancel.load(Ordering::Relaxed) => {
                live.active += 1;
                core_dbg(format!("reuse core (active={})", live.active));
                return Ok(CoreHandle {
                    env: Arc::clone(&live.env),
                    cancel: Arc::clone(&live.cancel),
                });
            }
            Some(live) => {
                if !live.cancel.swap(true, Ordering::Relaxed) {
                    core_log(format!(
                        "program changed - cancelling current core ({} fetch(es) in flight, draining)",
                        live.active
                    ));
                }
                live.active > 0
            }
            None => false,
        };
        if busy {
            slot = CORE_CV.wait(slot).unwrap();
            continue;
        }
        if slot.is_some() {
            core_log("closing core (Vulkan device freed)");
        }
        *slot = None;
        core_log(format!("building new core ({}-byte program)", program.len()));
        let env = build_env(program, None)?;
        let arc = Arc::new(env);
        let cancel = Arc::new(AtomicBool::new(false));
        *slot = Some(Live {
            program: program.to_string(),
            env: Arc::clone(&arc),
            cancel: Arc::clone(&cancel),
            active: 1,
        });
        core_log("core ready");
        return Ok(CoreHandle { env: arc, cancel });
    }
}

pub fn clear_env_cache() {
    let Ok(mut slot) = CORE.lock() else { return };
    let idle = match slot.as_ref() {
        Some(live) => {
            if !live.cancel.swap(true, Ordering::Relaxed) {
                core_log(format!(
                    "cache cleared - cancelling core ({} fetch(es) in flight)",
                    live.active
                ));
            }
            live.active == 0
        }
        None => false,
    };
    if idle {
        core_log("cache cleared - closing idle core (Vulkan device freed)");
        *slot = None;
    }
    CORE_CV.notify_all();
}

static READY: OnceLock<bool> = OnceLock::new();

pub fn is_active(script: &str) -> bool {
    script.lines().any(|l| {
        let t = l.trim();
        !t.is_empty() && !t.starts_with('#')
    })
}

#[derive(Debug, Clone, Default)]
pub struct Deint {
    pub on: bool,
    pub kernel: String,
    pub double: bool,
    pub tff: bool,
}

#[derive(Debug, Clone, Default)]
pub struct Tonemap {
    pub on: bool,
    pub src_csp: String,
    pub function: String,
    pub gamut: String,
    pub dynamic_peak: bool,
    pub dst_max: Option<f64>,
    pub dst_min: Option<f64>,
    pub src_max: Option<f64>,
    pub use_dovi: bool,
    pub matrix: String,
    pub transfer: String,
    pub primaries: String,
    pub range: String,
}

#[derive(Debug, Clone)]
pub enum Fit {
    None,
    Scale(u32, u32, String),
    CropCenter(u32, u32),
}

impl Default for Fit {
    fn default() -> Self {
        Fit::None
    }
}

#[derive(Debug, Clone, Default)]
pub struct Geom {
    pub deint: Deint,
    pub tonemap: Tonemap,
    pub matrix: String,
    pub range: String,
    pub dar_width: Option<u32>,
    pub dar_kernel: String,
    pub crop: Option<(u32, u32, u32, u32)>,
    pub fit: Fit,
}

fn prepend_search_dirs(dirs: &[PathBuf]) {
    let dirs: Vec<PathBuf> = dirs.iter().filter(|d| d.is_dir()).cloned().collect();
    if dirs.is_empty() {
        return;
    }
    let existing = std::env::var_os("PATH").unwrap_or_default();
    let mut all = dirs;
    all.extend(std::env::split_paths(&existing));
    if let Ok(joined) = std::env::join_paths(all) {
        std::env::set_var("PATH", joined);
    }
}

#[cfg(windows)]
fn python_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut bases: Vec<PathBuf> = Vec::new();
    for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramW6432"] {
        if let Some(v) = std::env::var_os(var) {
            bases.push(PathBuf::from(v));
        }
    }
    if let Some(v) = std::env::var_os("LOCALAPPDATA") {
        bases.push(PathBuf::from(v).join("Programs").join("Python"));
    }
    for base in bases {
        if let Ok(rd) = std::fs::read_dir(&base) {
            for e in rd.flatten() {
                if e.file_name().to_string_lossy().to_ascii_lowercase().starts_with("python") {
                    roots.push(e.path());
                }
            }
        }
    }
    roots
}
#[cfg(not(windows))]
fn python_roots() -> Vec<PathBuf> {
    Vec::new()
}

fn discover() -> Option<(PathBuf, Vec<PathBuf>)> {
    let dll_name = if cfg!(windows) {
        "vsscript.dll"
    } else {
        "libvapoursynth-script.so"
    };

    let vsscript = std::env::var_os("VSSCRIPT_PATH");
    if let Some(v) = &vsscript {
        if !v.is_empty() {
            let p = PathBuf::from(v);
            if p.is_file() {
                let dir = p.parent().map(Path::to_path_buf);
                return Some((p, dir.into_iter().collect()));
            }
        }
    }
    let use_bundled = vsscript.is_none();

    if use_bundled {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(dir) = exe.parent() {
                for sub in ["", "vapoursynth", "VapourSynth", "binaries/vapoursynth"] {
                    let cand = if sub.is_empty() {
                        dir.join(dll_name)
                    } else {
                        dir.join(sub).join(dll_name)
                    };
                    if cand.is_file() {
                        let mut dirs: Vec<PathBuf> =
                            cand.parent().map(Path::to_path_buf).into_iter().collect();
                        dirs.push(dir.to_path_buf());
                        return Some((cand, dirs));
                    }
                }
            }
        }

        #[cfg(debug_assertions)]
        {
            let vendor = Path::new(env!("CARGO_MANIFEST_DIR")).join("vendor");
            let cand = vendor.join("vapoursynth").join(dll_name);
            if cand.is_file() {
                return Some((cand, vec![vendor.join("vapoursynth"), vendor]));
            }
        }
    }

    for root in python_roots() {
        let cand = root
            .join("Lib")
            .join("site-packages")
            .join("vapoursynth")
            .join(dll_name);
        if cand.is_file() {
            let dll_dir = cand.parent().map(Path::to_path_buf).unwrap_or_else(|| root.clone());
            return Some((cand, vec![dll_dir, root]));
        }
    }

    None
}

pub fn prepare() -> bool {
    *READY.get_or_init(|| match discover() {
        Some((dll, dirs)) => {
            prepend_search_dirs(&dirs);
            std::env::set_var("VSSCRIPT_PATH", &dll);
            true
        }
        None => false,
    })
}

pub fn supported() -> bool {
    prepare()
}

pub fn root_dir() -> Option<PathBuf> {
    let (dll, _) = discover()?;
    dll.parent().map(Path::to_path_buf)
}

pub fn ensure_supported() -> Result<(), String> {
    if supported() {
        Ok(())
    } else {
        Err("VapourSynth was not found. Install VapourSynth to decode sources.".into())
    }
}

pub fn core_version() -> String {
    if !supported() {
        return "not found".into();
    }
    match build_env_from_script("import vapoursynth as vs\n") {
        Ok(env) => match env.get_core() {
            Ok(core) => {
                let f = info_to_facts(&core.info());
                if f.api.is_empty() {
                    f.version
                } else {
                    format!("{} API {}", f.version, f.api)
                }
            }
            Err(_) => "unknown".into(),
        },
        Err(_) => "not found".into(),
    }
}

pub fn bestsource_version() -> String {
    if !supported() {
        return "not found".into();
    }
    let program = "import vapoursynth as vs\n\
                   try:\n\
                       _v = vs.core.bs.version\n\
                       bs_version = f'{_v.major}.{_v.minor}'\n\
                   except AttributeError:\n\
                       bs_version = 'not found'\n";
    let Ok(env) = build_env_from_script(program) else {
        return "unknown".into();
    };
    let Some(api) = API::get() else {
        return "unknown".into();
    };
    let mut map = OwnedMap::new(api);
    if env.get_variable("bs_version", &mut map).is_err() {
        return "unknown".into();
    }
    match map.get_data("bs_version") {
        Ok(bytes) => String::from_utf8_lossy(bytes).into_owned(),
        Err(_) => "unknown".into(),
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VsStatus {
    pub ready: bool,
    pub state: String,
    pub version: String,
    pub api: String,
    pub threads: usize,
    pub cache_used: u64,
    pub cache_max: u64,
    pub mem_used: u64,
    pub mem_max: u64,
    pub core_alive: bool,
    pub active: usize,
    pub decoder: String,
    pub hwdevice: String,
}

#[derive(Clone)]
struct CoreFacts {
    version: String,
    api: String,
    threads: usize,
}

fn info_to_facts(info: &vapoursynth::core::Info) -> CoreFacts {
    let version = info
        .version_string
        .lines()
        .find_map(|l| l.trim().strip_prefix("Core ").map(|s| s.trim().to_string()))
        .unwrap_or_else(|| "unknown".into());
    let api = format!("{}.{}", (info.api_version >> 16) & 0xffff, info.api_version & 0xffff);
    CoreFacts { version, api, threads: info.num_threads }
}

pub fn runtime_status() -> VsStatus {
    let hw = hwdevice();
    let hwdevice = if hw.is_empty() { "CPU".into() } else { hw };
    if !supported() {
        return VsStatus {
            ready: false,
            state: "Not found".into(),
            version: "not found".into(),
            api: String::new(),
            threads: 0,
            cache_used: 0,
            cache_max: 0,
            mem_used: 0,
            mem_max: 0,
            core_alive: false,
            active: 0,
            decoder: "BestSource".into(),
            hwdevice,
        };
    }
    let live = CORE
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(|l| (Arc::clone(&l.env), l.active)));
    if let Some((env, active)) = live {
        if let Ok(core) = env.get_core() {
            let info = core.info();
            let f = info_to_facts(&info);
            return VsStatus {
                ready: true,
                state: if active > 0 { "Rendering".into() } else { "Idle".into() },
                version: f.version,
                api: f.api,
                threads: f.threads,
                cache_used: info.used_framebuffer_size,
                cache_max: info.max_framebuffer_size,
                mem_used: 0,
                mem_max: 0,
                core_alive: true,
                active,
                decoder: "BestSource".into(),
                hwdevice,
            };
        }
    }
    VsStatus {
        ready: true,
        state: "Idle".into(),
        version: String::new(),
        api: String::new(),
        threads: 0,
        cache_used: 0,
        cache_max: 0,
        mem_used: 0,
        mem_max: 0,
        core_alive: false,
        active: 0,
        decoder: "BestSource".into(),
        hwdevice,
    }
}

#[cfg(test)]
mod status_bench {
    use super::*;
    use std::time::Instant;

    #[test]
    #[ignore]
    fn measure_runtime_status() {
        if !prepare() {
            eprintln!("VapourSynth not found; skipping");
            return;
        }
        let _ = runtime_status();
        let n = 5000;
        let t = Instant::now();
        for _ in 0..n {
            std::hint::black_box(runtime_status());
        }
        let per_us = t.elapsed().as_nanos() as f64 / n as f64 / 1000.0;
        eprintln!("runtime_status (no live core): {per_us:.2} us/call over {n} calls");
    }
}

pub fn vsprobe(
    path: &str,
    script: &str,
    deint: &Deint,
    progress_key: Option<&str>,
) -> Result<SourceInfo, String> {
    ensure_supported()?;
    let program = build_probe_script(path, script, deint);
    let env = build_env(&program, progress_key)?;
    let (node, _alpha) = env
        .get_output(0)
        .map_err(|e| format!("VapourSynth has no output clip: {e}"))?;
    let vi = node.info();

    let (width, height) = match vi.resolution {
        Property::Constant(Resolution { width, height }) => (width as u32, height as u32),
        Property::Variable => return Err("VapourSynth clip has variable resolution".into()),
    };
    let fps = match vi.framerate {
        Property::Constant(Framerate { numerator, denominator })
            if numerator > 0 && denominator > 0 =>
        {
            numerator as f64 / denominator as f64
        }
        _ => 25.0,
    };
    let total = vi.num_frames as u64;
    let duration = if fps > 0.0 { total as f64 / fps } else { 0.0 };

    // vsprobe() reports pure clip geometry and never decodes a frame, so it stays GIL-safe
    // (a build-time decode deadlocks Python-filter graphs).
    Ok(SourceInfo {
        fps,
        total,
        width,
        height,
        duration,
        sar: 1.0,
        dar: String::new(),
        is_still: false,
        matrix: String::new(),
        range: String::new(),
        transfer: String::new(),
        primaries: String::new(),
        hdr: String::new(),
        dv_profile: None,
        dv_bl_compat: None,
    })
}

pub struct SourceMeta {
    pub width: u32,
    pub sar: f64,
    pub dar: String,
    pub matrix: String,
    pub range: String,
    pub transfer: String,
    pub primaries: String,
    pub hdr: String,
    pub dv_profile: Option<u8>,
    pub dv_bl_compat: Option<u8>,
}

fn build_meta_program(path: &str) -> String {
    let safe = path.replace('\\', "/");
    let cache_hw = bs_cachepath(path);
    let cache_cpu = bs_cachepath_tag(path, "cpu");
    let rls = rls_load_src();
    format!(
        "import vapoursynth as vs\ncore = vs.core\n{rls}\nclip = _rls_load(r\"{safe}\", r\"{cache_hw}\", r\"{cache_cpu}\")\nclip.set_output(0)\n"
    )
}

pub fn probe_metadata(path: &str) -> Result<SourceMeta, String> {
    ensure_supported()?;
    let env = build_env(&build_meta_program(path), None)?;
    let (node, _alpha) = env
        .get_output(0)
        .map_err(|e| format!("VapourSynth has no output clip: {e}"))?;
    let frame = node
        .get_frame(0)
        .map_err(|e| format!("VapourSynth could not decode frame 0: {e}"))?;
    let width = frame.width(0) as u32;
    let height = frame.height(0) as u32;
    let props = frame.props();
    let get_i = |k: &str| props.get_int(k).ok();

    let matrix = get_i("_Matrix").map(vs_matrix_int).unwrap_or_default();
    let range = match get_i("_ColorRange") {
        Some(0) => "full".to_string(),
        Some(1) => "limited".to_string(),
        _ => String::new(),
    };
    let transfer = get_i("_Transfer").map(vs_transfer_str).unwrap_or_default();
    let primaries = get_i("_Primaries").map(vs_primaries_str).unwrap_or_default();

    let sarn = get_i("_SARNum").unwrap_or(1).max(1) as u64;
    let sard = get_i("_SARDen").unwrap_or(1).max(1) as u64;
    let sar = sarn as f64 / sard as f64;
    let dar = dar_string(width, height, sarn, sard);

    let has_dv = props.get_data("DolbyVisionRPU").is_ok();
    let hdr10plus = props.get_data("HDR10Plus").is_ok();
    let dv_profile = match props.get_data("DolbyVisionRPU") {
        Ok(rpu) => dv_profile_from_rpu(rpu),
        Err(_) => None,
    };
    let dv_bl_compat = dv_bl_compat_id(dv_profile, &transfer);
    let hdr = hdr_format(&transfer, hdr10plus, has_dv).to_string();

    Ok(SourceMeta {
        width,
        sar,
        dar,
        matrix,
        range,
        transfer,
        primaries,
        hdr,
        dv_profile,
        dv_bl_compat,
    })
}

fn vs_matrix_int(m: i64) -> String {
    match m {
        1 => "1",
        5 | 6 => "5",
        7 => "7",
        4 => "4",
        9 | 10 => "9",
        _ => "",
    }
    .to_string()
}

fn vs_transfer_str(t: i64) -> String {
    match t {
        16 => "st2084",
        18 => "std-b67",
        _ => "",
    }
    .to_string()
}

fn vs_primaries_str(p: i64) -> String {
    match p {
        1 => "709",
        9 => "2020",
        6 => "170m",
        7 => "240m",
        _ => "",
    }
    .to_string()
}

fn hdr_format(transfer: &str, hdr10plus: bool, has_dv: bool) -> &'static str {
    if has_dv {
        return "dovi";
    }
    match transfer {
        "std-b67" => "hlg",
        "st2084" => {
            if hdr10plus {
                "hdr10plus"
            } else {
                "hdr10"
            }
        }
        _ => "sdr",
    }
}

fn dar_string(w: u32, h: u32, sarn: u64, sard: u64) -> String {
    if w == 0 || h == 0 || sarn == sard {
        return String::new();
    }
    let num = w as u64 * sarn;
    let den = h as u64 * sard;
    let g = gcd(num, den);
    if g == 0 {
        return String::new();
    }
    format!("{}:{}", num / g, den / g)
}

fn gcd(a: u64, b: u64) -> u64 {
    if b == 0 { a } else { gcd(b, a % b) }
}

pub fn resolution_matrix_int(width: u32) -> &'static str {
    if width > 1024 { "1" } else { "5" }
}

fn dv_profile_from_rpu(rpu: &[u8]) -> Option<u8> {
    DoviRpu::parse_unspec62_nalu(rpu).ok().map(|p| p.dovi_profile)
}

fn dv_bl_compat_id(profile: Option<u8>, transfer: &str) -> Option<u8> {
    match profile? {
        8 => Some(match transfer {
            "st2084" => 1,
            "std-b67" => 4,
            _ => 2,
        }),
        _ => Some(0),
    }
}

pub struct FetchReq {
    pub output: i32,
    pub frame: u64,
    pub label: String,
}

/// Callbacks run on VapourSynth worker threads: `env` (and the nodes) MUST outlive every
/// callback, which the caller guarantees by holding it for the whole call.
fn fetch_async(
    env: &Environment,
    reqs: &[FetchReq],
    cancel: &AtomicBool,
    req_cancel: Option<&AtomicBool>,
) -> Result<Vec<(RgbaImage, String)>, String> {
    if reqs.is_empty() {
        return Ok(Vec::new());
    }
    let cancelled =
        || cancel.load(Ordering::Relaxed) || req_cancel.is_some_and(|c| c.load(Ordering::Relaxed));

    let mut nodes = Vec::with_capacity(reqs.len());
    for req in reqs {
        let (node, _alpha) = env
            .get_output(req.output)
            .map_err(|e| format!("{}: {e}", req.label))?;
        nodes.push(node);
    }

    let n = reqs.len();
    type Slot = Option<Result<(RgbaImage, String), String>>;
    let slots: Arc<Mutex<Vec<Slot>>> = Arc::new(Mutex::new((0..n).map(|_| None).collect()));
    let remaining = Arc::new((Mutex::new(n), Condvar::new()));

    for (i, (req, node)) in reqs.iter().zip(&nodes).enumerate() {
        if cancelled() {
            core_dbg(format!("fetch superseded - stopped after dispatching {i}/{n} frame(s)"));
            let (lock, cvar) = &*remaining;
            *lock.lock().unwrap() -= n - i;
            cvar.notify_all();
            break;
        }
        inflight().acquire();
        if cancelled() {
            inflight().release();
            core_dbg(format!("fetch superseded - stopped after dispatching {i}/{n} frame(s)"));
            let (lock, cvar) = &*remaining;
            *lock.lock().unwrap() -= n - i;
            cvar.notify_all();
            break;
        }
        let slots = Arc::clone(&slots);
        let remaining = Arc::clone(&remaining);
        let label = req.label.clone();
        node.get_frame_async(req.frame as usize, move |res, _n, _node| {
            let out = match res {
                Ok(f) => match f.props().get_data("_rls_error") {
                    Ok(msg) => Err(String::from_utf8_lossy(msg).into_owned()),
                    Err(_) => frame_to_rgba(&f).map(|img| (img, pict_char(&f))),
                },
                Err(e) => Err(format!("{label}: {e}")),
            };
            slots.lock().unwrap()[i] = Some(out);
            inflight().release();
            let (lock, cvar) = &*remaining;
            *lock.lock().unwrap() -= 1;
            cvar.notify_all();
        });
    }

    let (lock, cvar) = &*remaining;
    let mut left = lock.lock().unwrap();
    while *left > 0 {
        left = cvar.wait(left).unwrap();
    }
    drop(left);

    if cancelled() {
        core_dbg("fetch discarded - superseded by a newer render");
        return Err("render superseded".into());
    }

    let results = std::mem::take(&mut *slots.lock().unwrap());
    let mut out = Vec::with_capacity(n);
    for slot in results {
        match slot {
            Some(Ok(v)) => out.push(v),
            Some(Err(e)) => return Err(e),
            None => return Err("VapourSynth batch: a frame was never delivered".into()),
        }
    }
    Ok(out)
}

pub fn extract_frames(
    specs: &[FrameSpec],
    reqs: &[FetchReq],
    req_cancel: Option<&AtomicBool>,
) -> Result<Vec<(RgbaImage, String)>, String> {
    ensure_supported()?;
    if reqs.is_empty() {
        return Ok(Vec::new());
    }
    let program = build_batch_program(specs);
    let handle = acquire_core(&program)?;
    fetch_async(&handle.env, reqs, &handle.cancel, req_cancel)
}

fn frame_to_rgba(frame: &FrameRef) -> Result<RgbaImage, String> {
    if frame.format().plane_count() != 3 {
        return Err("VapourSynth output is not RGB24 (expected 3 planes)".into());
    }
    let w = frame.width(0);
    let h = frame.height(0);
    let mut buf = vec![0u8; w * h * 4];
    for row in 0..h {
        let r = frame.data_row(0, row);
        let g = frame.data_row(1, row);
        let b = frame.data_row(2, row);
        let dst = &mut buf[row * w * 4..(row + 1) * w * 4];
        for x in 0..w {
            dst[x * 4] = r[x];
            dst[x * 4 + 1] = g[x];
            dst[x * 4 + 2] = b[x];
            dst[x * 4 + 3] = 255;
        }
    }
    RgbaImage::from_raw(w as u32, h as u32, buf).ok_or_else(|| "RGBA buffer size mismatch".into())
}

fn pict_char(frame: &FrameRef) -> String {
    match frame.props().get_data("_PictType") {
        Ok(bytes) => bytes.first().map(|&b| (b as char).to_string()).unwrap_or_else(|| "?".into()),
        Err(MapError::KeyNotFound) => "?".into(),
        Err(_) => "?".into(),
    }
}

fn vs_kernel(name: &str) -> &'static str {
    match name {
        "Nearest" => "Point",
        "Bilinear" | "Triangle" => "Bilinear",
        "Bicubic" | "CatmullRom" => "Bicubic",
        "Lanczos" | "Lanczos3" => "Lanczos",
        _ => "Spline36",
    }
}

pub fn matrix_vs(matrix: &str) -> Option<&'static str> {
    match matrix {
        "1" => Some("709"),
        "5" => Some("170m"),
        "7" => Some("240m"),
        "4" => Some("fcc"),
        "9" => Some("2020ncl"),
        _ => None,
    }
}

pub fn resolution_matrix(width: u32) -> String {
    if width > 1024 { "709".into() } else { "170m".into() }
}

fn range_vs(range: &str) -> Option<&'static str> {
    match range {
        "limited" => Some("limited"),
        "full" => Some("full"),
        _ => None,
    }
}

fn placebo_csp(name: &str) -> i32 {
    match name {
        "hdr10" | "hdr10plus" => 1,
        "hlg" => 2,
        "dovi" => 3,
        _ => 0,
    }
}

fn placebo_gamut(name: &str) -> i32 {
    match name {
        "clip" => 0,
        "softclip" => 2,
        "relative" => 3,
        "saturation" => 4,
        "absolute" => 5,
        "desaturate" => 6,
        "darken" => 7,
        "highlight" => 8,
        "linear" => 9,
        _ => 1,
    }
}

fn tonemap_code(t: &Tonemap) -> String {
    if !t.on {
        return String::new();
    }
    let src = placebo_csp(&t.src_csp);
    let gamut = placebo_gamut(&t.gamut);
    let peak = if t.dynamic_peak { "True" } else { "False" };
    let dovi = if t.use_dovi { "True" } else { "False" };
    let mut args = format!(
        "clip, src_csp={src}, dst_csp=0, tone_mapping_function_s={func}, gamut_mapping={gamut}, dynamic_peak_detection={peak}, use_dovi={dovi}",
        func = py_str(if t.function.is_empty() { "spline" } else { t.function.as_str() }),
    );
    if let Some(v) = t.dst_max {
        args += &format!(", dst_max={v}");
    }
    if let Some(v) = t.dst_min {
        args += &format!(", dst_min={v}");
    }
    if let Some(v) = t.src_max {
        args += &format!(", src_max={v}");
    }

    let mut s = String::new();
    if src == 3 {
        // Dolby Vision: placebo applies the RPU in YUV and REJECTS an RGB input, so keep the
        // clip YUV here.
        s += "clip = core.resize.Bicubic(clip, format=vs.YUV444P16)\n";
        s += &format!("clip = core.placebo.Tonemap({args})\n");
        s += "clip = core.resize.Bicubic(clip, format=vs.RGB48, matrix_in_s=\"709\", range_in_s=\"limited\")\n";
    } else {
        // Build an HDR-tagged RGB48 clip (keeping the PQ/HLG encoding - NEVER linearise here)
        // so placebo reads the right colorimetry.
        let matrix = if t.matrix.is_empty() { "709" } else { t.matrix.as_str() };
        let transfer = if t.transfer.is_empty() {
            match t.src_csp.as_str() {
                "hlg" => "std-b67",
                _ => "st2084",
            }
        } else {
            t.transfer.as_str()
        };
        let primaries = if t.primaries.is_empty() { "2020" } else { t.primaries.as_str() };
        let range = range_vs(&t.range).unwrap_or("limited");
        s += &format!(
            "clip = clip if clip.format.color_family == vs.RGB else core.resize.Bicubic(clip, format=vs.RGB48, matrix_in_s=\"{matrix}\", transfer_in_s=\"{transfer}\", primaries_in_s=\"{primaries}\", range_in_s=\"{range}\")\n"
        );
        s += "clip = core.resize.Bicubic(clip, format=vs.RGB48) if clip.format.bits_per_sample != 16 else clip\n";
        s += &format!("clip = core.placebo.Tonemap({args})\n");
    }
    s
}

fn deint_code(d: &Deint) -> String {
    if !d.on {
        return String::new();
    }
    let tff = if d.tff { "True" } else { "False" };
    match d.kernel.as_str() {
        "bob" => {
            let full = format!("core.resize.Bicubic(core.std.SeparateFields(clip, tff={tff}), height=clip.height)");
            if d.double {
                format!("clip = {full}\n")
            } else {
                format!("clip = core.std.SelectEvery({full}, cycle=2, offsets=[0])\n")
            }
        }
        "qtgmc" => {
            let div = if d.double { 1 } else { 2 };
            format!(
                "import havsfunc as _haf\nclip = _haf.QTGMC(clip, TFF={tff}, FPSDivisor={div}, Preset=\"Slower\")\n"
            )
        }
        "nnedi3" => {
            let field = field_val(d);
            let pick = "(core.nnedi3.nnedi3 if hasattr(core, 'nnedi3') else core.znedi3.nnedi3)";
            format!("clip = {pick}(clip, field={field})\n")
        }
        "bwdif" => {
            let field = field_val(d);
            format!("clip = core.bwdif.Bwdif(clip, field={field})\n")
        }
        other => format!(
            "raise ValueError({})\n",
            py_str(&format!("unknown deinterlacer kernel: {other}"))
        ),
    }
}

/// Deinterlacing is unconditional (every frame) - never emit a per-frame Python callback
/// (`std.FrameEval` with a lambda), which deadlocks VSScript's threaded / async rendering.
fn field_val(d: &Deint) -> u8 {
    match (d.double, d.tff) {
        (true, true) => 3,
        (true, false) => 2,
        (false, true) => 1,
        (false, false) => 0,
    }
}

const TO_RGB_FN: &str = r#"def _to_rgb(clip, m, r, fmt):
    if clip.format.color_family == vs.RGB:
        return core.resize.Bicubic(clip, format=fmt)
    # `m` is resolved by the host (declared matrix / resolution) - NEVER sniff a frame
    # here: a build-time get_frame() would deadlock on the GIL for Python-filter graphs
    # (a Python-filter graph would deadlock). Fall back to resolution only if unset.
    if m is None:
        m = "709" if clip.width > 1024 else "170m"
    kw = dict(format=fmt, matrix_in_s=m)
    if r is not None:
        kw["range_in_s"] = r
    return core.resize.Bicubic(clip, **kw)
"#;

fn py_str(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

fn indent(code: &str, spaces: usize) -> String {
    let pad = " ".repeat(spaces);
    code.lines()
        .map(|l| if l.trim().is_empty() { String::new() } else { format!("{pad}{l}") })
        .collect::<Vec<_>>()
        .join("\n")
}

fn source_label(path: &str) -> String {
    Path::new(path)
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string())
}

fn geometry_code(g: &Geom) -> String {
    let mut s = String::new();
    if let Some(w) = g.dar_width {
        s += &format!("clip = core.resize.{}(clip, width={w})\n", vs_kernel(&g.dar_kernel));
    }
    if let Some((l, t, cw, ch)) = g.crop {
        s += &format!("clip = core.std.CropAbs(clip, width={cw}, height={ch}, left={l}, top={t})\n");
    }
    match &g.fit {
        Fit::Scale(nw, nh, kernel) => {
            s += &format!("clip = core.resize.{}(clip, width={nw}, height={nh})\n", vs_kernel(kernel));
        }
        Fit::CropCenter(cw, ch) => {
            s += &format!(
                "clip = core.std.CropAbs(clip, width={cw}, height={ch}, left=max(0, (clip.width - {cw}) // 2), top=max(0, (clip.height - {ch}) // 2))\n"
            );
        }
        Fit::None => {}
    }
    s
}

static HWDEVICE: Mutex<String> = Mutex::new(String::new());

pub fn set_hwdevice(dev: String) {
    if let Ok(mut d) = HWDEVICE.lock() {
        *d = dev;
    }
}

fn hwdevice() -> String {
    HWDEVICE.lock().map(|d| d.clone()).unwrap_or_default()
}

static HWFALLBACK: AtomicBool = AtomicBool::new(true);

pub fn set_hwfallback(on: bool) {
    HWFALLBACK.store(on, Ordering::Relaxed);
}

fn hwfallback() -> bool {
    HWFALLBACK.load(Ordering::Relaxed)
}

fn hwdevice_tag() -> String {
    let hw = hwdevice();
    if hw.is_empty() { "cpu".into() } else { hw }
}

fn index_dir() -> PathBuf {
    static DIR: OnceLock<PathBuf> = OnceLock::new();
    DIR.get_or_init(|| {
        let base = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(std::env::temp_dir);
        let d = base.join("pear").join("bsindex");
        let _ = std::fs::create_dir_all(&d);
        d
    })
    .clone()
}

fn source_key(path: &str) -> String {
    static CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    if let Some(k) = cache.lock().unwrap().get(path) {
        return k.clone();
    }
    let key = crate::config::file_id(path).map(|f| f.id).unwrap_or_else(|_| {
        use std::hash::{Hash, Hasher};
        let mut h = std::collections::hash_map::DefaultHasher::new();
        path.hash(&mut h);
        format!("{:016x}", h.finish())
    });
    cache.lock().unwrap().insert(path.to_string(), key.clone());
    key
}

fn bs_cachepath_tag(path: &str, tag: &str) -> String {
    let dir = index_dir().join(tag);
    let _ = std::fs::create_dir_all(&dir);
    dir.join(source_key(path)).to_string_lossy().replace('\\', "/")
}

fn bs_cachepath(path: &str) -> String {
    bs_cachepath_tag(path, &hwdevice_tag())
}

fn index_files_for(fileid: &str) -> Vec<(String, String, PathBuf)> {
    let prefix = format!("{fileid}.");
    let mut out = Vec::new();
    let Ok(devices) = std::fs::read_dir(index_dir()) else {
        return out;
    };
    for dev in devices.flatten() {
        let dir = dev.path();
        if !dir.is_dir() {
            continue;
        }
        let hw = dev.file_name().to_string_lossy().into_owned();
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for e in entries.flatten() {
                let name = e.file_name();
                let name = name.to_string_lossy();
                if let Some(track) =
                    name.strip_prefix(&prefix).and_then(|r| r.strip_suffix(".bsindex"))
                {
                    out.push((hw.clone(), track.to_string(), e.path()));
                }
            }
        }
    }
    out
}

pub fn source_index(path: &str) -> Option<crate::index::VideoIndex> {
    let want_hw = hwdevice_tag();
    let mut tags = vec![want_hw.clone()];
    if want_hw != "cpu" {
        tags.push("cpu".to_string());
    }
    let files = index_files_for(&source_key(path));
    for tag in &tags {
        for (hw, _track, file) in &files {
            if hw != tag {
                continue;
            }
            if let Ok(idx) = crate::index::parse_file(file) {
                return Some(idx);
            }
        }
    }
    None
}

pub fn remove_source_indexes(path: &str) {
    let prefix = format!("{}.", source_key(path));
    let Ok(devices) = std::fs::read_dir(index_dir()) else {
        return;
    };
    for dev in devices.flatten() {
        let dir = dev.path();
        if !dir.is_dir() {
            continue;
        }
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for e in entries.flatten() {
                let n = e.file_name();
                let n = n.to_string_lossy();
                if n.starts_with(&prefix) && n.ends_with(".bsindex") {
                    let _ = std::fs::remove_file(e.path());
                }
            }
        }
    }
}

/// BestSource's own `hwfallback` argument only covers a device that decodes SOME frames in
/// software; it does NOT cover failure to CREATE the HW device (no GPU present throws "Failed
/// to create specified HW device" from `VideoSource` before any frame is touched).
fn rls_load_src() -> String {
    let hw = hwdevice();
    let fb = if hwfallback() { "True" } else { "False" };
    if hw.is_empty() {
        return format!(
            "def _rls_load(p, cache_hw, cache_cpu):\n    return core.bs.VideoSource(p, showprogress=True, hwfallback={fb}, cachemode=4, cachepath=cache_cpu)\n"
        );
    }
    if hwfallback() {
        format!(
            "def _rls_load(p, cache_hw, cache_cpu):\n    \
             try:\n        \
             return core.bs.VideoSource(p, showprogress=True, hwfallback={fb}, hwdevice=\"{hw}\", cachemode=4, cachepath=cache_hw)\n    \
             except vs.Error:\n        \
             return core.bs.VideoSource(p, showprogress=True, hwfallback={fb}, cachemode=4, cachepath=cache_cpu)\n"
        )
    } else {
        format!(
            "def _rls_load(p, cache_hw, cache_cpu):\n    return core.bs.VideoSource(p, showprogress=True, hwfallback={fb}, hwdevice=\"{hw}\", cachemode=4, cachepath=cache_hw)\n"
        )
    }
}

fn build_probe_script(path: &str, user: &str, d: &Deint) -> String {
    let safe = path.replace('\\', "/");
    let cache_hw = bs_cachepath(path);
    let cache_cpu = bs_cachepath_tag(path, "cpu");
    let deint = deint_code(d);
    let rls = rls_load_src();
    format!(
        r#"import vapoursynth as vs
core = vs.core
SOURCE = r"{safe}"

{rls}
clip = _rls_load(SOURCE, r"{cache_hw}", r"{cache_cpu}")

# ===== hidden pre-step (deinterlace) =====
{deint}
# ===== user script =====
{user}
# ===== end user script =====

clip.set_output(0)
"#
    )
}

pub struct FrameSpec<'a> {
    pub path: &'a str,
    pub script: &'a str,
    pub geom: &'a Geom,
}

fn source_fn(index: usize, spec: &FrameSpec) -> String {
    let g = spec.geom;
    let safe = spec.path.replace('\\', "/");
    let cache_hw = bs_cachepath(spec.path);
    let cache_cpu = bs_cachepath_tag(spec.path, "cpu");
    let deint = indent(&deint_code(&g.deint), 8);
    let user = indent(spec.script, 8);
    let geometry = indent(&geometry_code(g), 8);
    let m = if g.matrix.is_empty() {
        "None".to_string()
    } else {
        format!("\"{}\"", g.matrix)
    };
    let r = range_vs(&g.range).map(|s| format!("\"{s}\"")).unwrap_or_else(|| "None".into());
    let rgb = if g.tonemap.on {
        indent(&tonemap_code(&g.tonemap), 8)
    } else {
        format!("        clip = _to_rgb(clip, {m}, {r}, vs.RGB48)")
    };
    let label = py_str(&source_label(spec.path));
    format!(
        r#"def _src_{index}():
    try:
        clip = _rls_load(r"{safe}", r"{cache_hw}", r"{cache_cpu}")
{deint}
        # ===== user script =====
{user}
        # ===== end user script =====
{rgb}
{geometry}
        clip = core.resize.Point(clip, format=vs.RGB24, dither_type="error_diffusion")
        return clip
    except Exception as _e:
        # Don't fail the whole eval - tag a placeholder so the host attributes the
        # error to this source at fetch time (VSScript flattens raised exceptions).
        _err = core.std.BlankClip(width=8, height=8, format=vs.RGB24, length=1048576)
        return core.std.SetFrameProps(_err, _rls_error=({label} + ": " + str(_e)))
_src_{index}().set_output({index})

"#
    )
}

fn build_batch_program(specs: &[FrameSpec]) -> String {
    let mut s = String::from("import vapoursynth as vs\ncore = vs.core\n\n");
    s.push_str(&rls_load_src());
    s.push('\n');
    s.push_str(TO_RGB_FN);
    s.push('\n');
    for (i, spec) in specs.iter().enumerate() {
        s.push_str(&source_fn(i, spec));
    }
    s
}

