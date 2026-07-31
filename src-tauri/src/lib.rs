mod local_server;

// The greet command the About page invokes. Add your own #[tauri::command]
// functions here and register them in the invoke_handler below.
#[tauri::command]
fn greet(name: &str) -> String {
    let who = if name.trim().is_empty() { "friend" } else { name };
    format!("Hello, {who}! This reply came from Rust.")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_decorum::init())
        // OTA self-update: the JS side checks GitHub Releases (latest.json),
        // downloads the signed artifact, and relaunches via the process plugin.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            use tauri::Manager;
            let main = app.get_webview_window("main").expect("main window");
            // Center the native macOS traffic lights in the taller custom title
            // bar. decorum's `y` is the extra title-bar height reserved BELOW the
            // buttons (container height = button_height + y), and the buttons
            // center in that container; ~30 centers a ~14px button set in the
            // 52px (3.25rem) bar. macOS re-lays-out the buttons on resize, so
            // re-apply the inset on every resize.
            #[cfg(target_os = "macos")]
            {
                use tauri_plugin_decorum::WebviewWindowExt;
                const INSET: (f32, f32) = (16.0, 30.0);
                let _ = main.set_traffic_lights_inset(INSET.0, INSET.1);
                let win = main.clone();
                main.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Resized(_)) {
                        let _ = win.set_traffic_lights_inset(INSET.0, INSET.1);
                    }
                });
            }
            Ok(())
        })
        .manage(local_server::LocalServer(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            greet,
            local_server::local_server_start,
            local_server::local_server_stop,
            local_server::local_server_port
        ])
        .on_window_event(|window, event| {
            // The sidecar dies with the app - a headless local server left
            // behind would hold its port and its SQLite lock forever.
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                if let Some(state) = window.app_handle().try_state::<local_server::LocalServer>() {
                    if let Some((mut child, _)) = state.0.lock().unwrap().take() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
