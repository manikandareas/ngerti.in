mod gateway;
mod host;
mod log;
mod power;
mod profile;
mod supervisor;
#[cfg(test)]
mod tests;

use std::sync::atomic::Ordering;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Err(error) = host::setup(app) {
                let handle = app.handle().clone();
                app.dialog()
                    .message(format!(
                        "{error:#}\n\nYour data and credentials have not been reset."
                    ))
                    .title("Ngertiin could not start")
                    .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                    .show(move |_| handle.exit(1));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if !window
                        .state::<host::Host>()
                        .quitting
                        .load(Ordering::Acquire)
                    {
                        api.prevent_close();
                        host::hide(window.app_handle());
                    }
                }
                tauri::WindowEvent::Focused(true) => {
                    if window.is_visible().unwrap_or(false)
                        && !window.is_minimized().unwrap_or(true)
                    {
                        host::visibility(window.app_handle(), true);
                    }
                }
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                    host::save_geometry(window);
                }
                tauri::WindowEvent::Destroyed => {
                    host::visibility(window.app_handle(), false);
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("The desktop host could not initialize");
    app.run(|app, event| match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            if let Some(host) = app.try_state::<host::Host>()
                && !host.finished.load(Ordering::Acquire)
            {
                api.prevent_exit();
                host::quit(app);
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => host::show(app),
        tauri::RunEvent::Exit => power::clear(),
        _ => {}
    });
}
