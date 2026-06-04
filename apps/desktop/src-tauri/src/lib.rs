// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;

struct ServerProcess(Mutex<Option<CommandChild>>);

fn get_db_path(app: &AppHandle) -> String {
    let app_data = app
        .path()
        .app_data_dir()
        .expect("failed to get app data dir");
    let db_dir = app_data.join("Bookleaf");
    std::fs::create_dir_all(&db_dir).expect("failed to create db dir");
    db_dir.join("library.db").to_string_lossy().to_string()
}

fn spawn_server(app: &AppHandle) {
    let db_path = get_db_path(app);

    let sidecar_command = app
        .shell()
        .sidecar("bookleaf-server")
        .expect("failed to find bookleaf-server sidecar")
        .env("BOOKLEAF_DB_PATH", &db_path);

    match sidecar_command.spawn() {
        Ok((mut rx, child)) => {
            app.manage(ServerProcess(Mutex::new(Some(child))));

            // Forward server stdout/stderr to Tauri's console
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_shell::process::CommandEvent;
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line) => {
                            println!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Stderr(line) => {
                            eprintln!("[server] {}", String::from_utf8_lossy(&line));
                        }
                        CommandEvent::Error(e) => {
                            eprintln!("[server] error: {}", e);
                        }
                        CommandEvent::Terminated(status) => {
                            println!("[server] terminated: {:?}", status);
                            break;
                        }
                        _ => {}
                    }
                }
            });

            println!("[desktop] server spawned, db: {}", db_path);
        }
        Err(e) => {
            eprintln!("[desktop] failed to spawn server: {}", e);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            spawn_server(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill the server process when the window is destroyed
                if let Some(state) = window.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
