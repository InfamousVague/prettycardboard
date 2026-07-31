//! The bundled game server, run locally: offline play against the AI bots.
//!
//! The desktop app normally talks to prettycardboard.com. Local play spawns
//! the SAME `prettycardboard-server` binary that runs production - bots,
//! rules, chat, persistence and all - as a bundled sidecar on a loopback
//! port, with its SQLite data living in the app's data directory. The client
//! flips its server origin to the returned port (see src/app/net/api.ts) and
//! everything else is unchanged.
//!
//! One instance per app process, spawned on demand and killed when the app
//! exits (or the toggle turns it off). The port is scanned from a base so a
//! dev server on 8787 never collides.

use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::Manager;

pub struct LocalServer(pub Mutex<Option<(Child, u16)>>);

/// First free loopback port at or above 8790.
fn free_port() -> Option<u16> {
    (8790..8890).find(|p| TcpListener::bind(("127.0.0.1", *p)).is_ok())
}

/// The sidecar lives next to the app executable (that is where Tauri's
/// `externalBin` bundling puts it on every platform). `tauri dev` runs from
/// target/debug with no bundling step, so it falls back to whatever
/// `scripts/stage-server-sidecar.mjs` staged in src-tauri/binaries.
fn sidecar_path() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let name = if cfg!(windows) { "prettycardboard-server.exe" } else { "prettycardboard-server" };
    let bundled = dir.join(name);
    if bundled.exists() {
        return Some(bundled);
    }
    // Dev: src-tauri/target/debug/app -> ../../binaries/prettycardboard-server-<triple>
    let staged_dir = dir.parent()?.parent()?.join("binaries");
    let entries = std::fs::read_dir(staged_dir).ok()?;
    entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with("prettycardboard-server-"))
                .unwrap_or(false)
        })
}

/// Start (or return the already-running) local server. Returns its port.
#[tauri::command]
pub fn local_server_start(app: tauri::AppHandle, state: tauri::State<LocalServer>) -> Result<u16, String> {
    let mut guard = state.0.lock().unwrap();
    if let Some((child, port)) = guard.as_mut() {
        // Still alive? Reuse it. A crashed child gets replaced below.
        if child.try_wait().ok().flatten().is_none() {
            return Ok(*port);
        }
        *guard = None;
    }
    let Some(bin) = sidecar_path() else {
        return Err("local server binary is not bundled with this build".to_string());
    };
    let port = free_port().ok_or("no free local port")?;
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("local-server");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let child = Command::new(bin)
        .env("PC_PORT", port.to_string())
        .env("PC_DATA_DIR", &data_dir)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("could not start local server: {e}"))?;
    *guard = Some((child, port));
    Ok(port)
}

/// Stop the local server if it is running.
#[tauri::command]
pub fn local_server_stop(state: tauri::State<LocalServer>) {
    if let Some((mut child, _)) = state.0.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// The running local server's port, if any (app relaunch recovery).
#[tauri::command]
pub fn local_server_port(state: tauri::State<LocalServer>) -> Option<u16> {
    let mut guard = state.0.lock().unwrap();
    let alive = match guard.as_mut() {
        Some((child, port)) => {
            let running = child.try_wait().ok().flatten().is_none();
            running.then_some(*port)
        }
        None => None,
    };
    if alive.is_none() {
        *guard = None;
    }
    alive
}
