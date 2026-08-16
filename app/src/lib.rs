mod commands;
mod comp_pics;
pub mod config;
pub mod index;
pub mod pipeline;
pub mod projects;
mod share;
mod slow_pics;
mod sys;
pub mod vapoursynth;

use commands::AppState;
use tauri_plugin_window_state::StateFlags;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct IndexEvent {
    path: String,
    percent: Option<u8>,
}

#[cfg(windows)]
fn disable_reload_keys(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;
    let _ = window.with_webview(|webview| unsafe {
        let controller = webview.controller();
        if let Ok(core) = controller.CoreWebView2() {
            if let Ok(settings) = core.Settings() {
                if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
                    let _ = s3.SetAreBrowserAcceleratorKeysEnabled(false);
                }
            }
        }
    });
}

fn pcp_from_args<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter()
        .skip(1)
        .find(|a| a.to_ascii_lowercase().ends_with(".pcp"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::{Emitter, Manager};
            if let Some(path) = pcp_from_args(argv) {
                let _ = app.emit("open-project", path);
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.show();
                let _ = win.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS,
                )
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new())
        .setup(|app| {
            use tauri::Manager;
            if let Some(path) = pcp_from_args(std::env::args()) {
                app.state::<AppState>().set_pending_project(path);
            }
            #[cfg(windows)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    disable_reload_keys(&win);
                }
            }
            vapoursynth::prepare();
            if sys::attach_console_if_present() {
                // GPL-3.0 recommends a short notice when the program runs interactively (here,
                // from a terminal). The GUI's own notice is the About box.
                eprintln!(
                    "Pear  Copyright (C) 2026  rlaphoenix\n\
                     This program comes with ABSOLUTELY NO WARRANTY.\n\
                     This is free software, and you are welcome to redistribute it under the terms\n\
                     of the GNU General Public License v3.0; see the bundled LICENSE for details.\n\
                     Support development: https://ko-fi.com/rlaphoenix"
                );
                vapoursynth::set_log_sink(|level, msg| {
                    let tag = format!("{level:?}").to_uppercase();
                    let ts = chrono::Local::now().format("%H:%M:%S%.3f");
                    eprintln!("[{ts}] [VapourSynth {tag}] {msg}");
                });
            }
            {
                use tauri::Emitter;
                let handle = app.handle().clone();
                vapoursynth::set_index_sink(move |path, percent| {
                    let _ = handle.emit("vs-index", IndexEvent { path: path.to_string(), percent });
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::init_source,
            commands::source_keyframes,
            commands::render,
            commands::frame_bytes,
            commands::release_frames,
            commands::pick_positions,
            commands::save_all,
            share::upload_comparison,
            slow_pics::search_titles,
            slow_pics::list_tags,
            slow_pics::autofill_tags,
            commands::clear_cache,
            config::load_prefs,
            config::save_templates,
            config::save_settings,
            commands::set_hwdevice,
            commands::set_hwfallback,
            projects::recent_projects_meta,
            config::set_ui_state,
            config::set_last_project,
            config::set_slowpics_cookie,
            commands::open_url,
            commands::open_vapoursynth_folder,
            commands::build_info,
            commands::vs_status,
            config::mark_recent,
            config::remove_recent,
            commands::take_pending_project,
            projects::load_project,
            projects::save_project,
            commands::lock_project,
            commands::unlock_project,
            commands::toggle_devtools,
            commands::discard_indexes,
            commands::file_exists,
            projects::file_id,
            commands::is_portable,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
