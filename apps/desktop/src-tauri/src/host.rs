use crate::{
    desktop_session::DesktopSession,
    gateway::{self, Gateway},
    log::Log,
    profile::{self, Profile, RuntimePaths, private_json, write_private},
};
use anyhow::{Context, Result};
use fs2::FileExt;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::{
    fs::{File, OpenOptions},
    path::{Path, PathBuf},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
use tauri::{
    Manager, WebviewUrl, WebviewWindowBuilder,
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    webview::{DownloadEvent, NewWindowResponse},
};

pub struct Host {
    pub session: Arc<DesktopSession>,
    pub gateway: Gateway,
    pub home: PathBuf,
    pub quitting: AtomicBool,
    pub finished: AtomicBool,
    pub geometry_revision: AtomicU64,
    pub zoom: Mutex<f64>,
    _lock: File,
}

#[derive(Clone, Deserialize, Serialize)]
struct Geometry {
    width: f64,
    height: f64,
    x: Option<f64>,
    y: Option<f64>,
    maximized: bool,
}

pub fn setup(app: &mut tauri::App) -> Result<()> {
    let home = profile::desktop_home()?;
    profile::prepare_home(&home)?;
    let profile = Profile::load(&home)?;
    let data_store = *uuid::Uuid::parse_str(&profile.manager_id)?.as_bytes();
    let mut options = OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let lock = options.open(home.join("desktop.lock"))?;
    if lock.try_lock_exclusive().is_err() {
        let port = profile.ui_port;
        tauri::async_runtime::block_on(async {
            let _ = reqwest::Client::new()
                .post(format!("http://127.0.0.1:{port}/_desktop/focus"))
                .timeout(std::time::Duration::from_secs(2))
                .send()
                .await;
        });
        app.handle().exit(0);
        return Ok(());
    }
    let paths = RuntimePaths::resolve(&profile, &app.path().resource_dir()?)?;
    let secrets = Vec::<String>::new();
    let log = Log::new(&home, secrets);
    let session = DesktopSession::new(profile, paths, log.clone())?;
    let gateway = tauri::async_runtime::block_on(gateway::start(
        session.clone(),
        Some(app.handle().clone()),
    ))?;
    let origin = gateway.origin.clone();
    let geometry = private_json::<Geometry>(&home.join("window.json")).unwrap_or(Geometry {
        width: 1280.,
        height: 900.,
        x: None,
        y: None,
        maximized: false,
    });
    let width = geometry.width.clamp(720., 10000.);
    let height = geometry.height.clamp(500., 10000.);
    let native_data = home.join("webkit");
    profile::prepare_home(&native_data)?;
    app.manage(Host {
        session: session.clone(),
        gateway,
        home,
        quitting: AtomicBool::new(false),
        finished: AtomicBool::new(false),
        geometry_revision: AtomicU64::new(0),
        zoom: Mutex::new(1.),
        _lock: lock,
    });
    let navigation_origin = origin.clone();
    let popup_origin = origin.clone();
    let popup_app = app.handle().clone();
    let download_origin = origin.clone();
    let download_log = log.clone();
    let initial_url = format!(
        "{origin}{}",
        session.profile.initial_path.as_deref().unwrap_or("/")
    );
    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(initial_url.parse()?))
        .title("Ngertiin")
        .inner_size(width, height)
        .min_inner_size(720., 500.)
        .visible(true)
        .background_color(tauri::window::Color(23, 23, 23, 255))
        .data_directory(native_data)
        .data_store_identifier(data_store)
        .disable_drag_drop_handler()
        .initialization_script(include_str!("bridge.js"))
        .on_navigation(move |url| {
            if url.origin().ascii_serialization() == navigation_origin || trusted_blob(url, &navigation_origin) {
                return true;
            }
            external(url);
            false
        })
        .on_new_window(move |url, _| {
            if url.origin().ascii_serialization() == popup_origin && url.path().starts_with("/v1/")
            {
                let app = popup_app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) = download(&app, &url).await {
                        app.state::<Host>().session.log.event(
                            "desktop.download.failed",
                            json!({"error": error.to_string()}),
                        );
                    }
                });
            } else {
                external(&url);
            }
            NewWindowResponse::Deny
        })
        .on_download(move |_, event| {
            match event {
                DownloadEvent::Requested { url, destination } => {
                    if !trusted_blob(&url, &download_origin) && (url.origin().ascii_serialization() != download_origin
                        || !url.path().starts_with("/v1/"))
                    {
                        return false;
                    }
                    if let Some(directory) = dirs::download_dir() {
                        let name = destination
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy();
                        *destination = unique_destination(&directory, &name);
                    } else {
                        return false;
                    }
                }
                DownloadEvent::Finished { success, .. } => {
                    download_log.event("desktop.download.finished", json!({"success": success}));
                }
                _ => {}
            }
            true
        })
        .on_page_load(|window, payload| {
            if payload.event() == tauri::webview::PageLoadEvent::Started {
                let session = window.state::<Host>().session.clone();
                tauri::async_runtime::spawn(async move {
                    session.release_views().await;
                });
            }
            if payload.event() == tauri::webview::PageLoadEvent::Finished {
                let host = window.state::<Host>();
                let visible = host.session.visible.load(Ordering::Acquire);
                let _ = window.eval(format!("window.__ngertiinDesktopVisibility?.({visible})"));
                let log = host.session.log.clone();
                let _ = window.eval_with_callback("JSON.stringify({ready:document.readyState,hidden:document.hidden,online:navigator.onLine,bridge:!!window.ngertiinDesktop})", move |result| { log.event("desktop.webview.ready", json!({"diagnostic":result})); });
            }
        });
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(12., 24.));
    }
    if let (Some(x), Some(y)) = (geometry.x, geometry.y) {
        let visible = app.available_monitors()?.iter().any(|monitor| {
            let origin = monitor.position().to_logical::<f64>(monitor.scale_factor());
            let size = monitor.size().to_logical::<f64>(monitor.scale_factor());
            x < origin.x + size.width
                && x + width > origin.x
                && y < origin.y + size.height
                && y + height > origin.y
        });
        builder = if visible {
            builder.position(x, y)
        } else {
            builder.center()
        };
    } else {
        builder = builder.center();
    }
    let window = builder.build()?;
    if geometry.maximized {
        let _ = window.maximize();
    }
    menus(app)?;
    tray(app)?;
    crate::power::observe(app.handle())?;
    #[cfg(target_os = "macos")]
    app.show()?;
    window.show()?;
    window.set_focus()?;
    log.event("desktop.started", json!({"framework": "tauri", "version": tauri::VERSION, "packaged": session.paths.packaged}));
    signals(app.handle());
    Ok(())
}

pub fn show(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    let _ = app.show();
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        visibility(app, true);
        if let Some(host) = app.try_state::<Host>() {
            let session = host.session.clone();
            tauri::async_runtime::spawn(async move {
                let _ = session.remote.metadata().await;
            });
        }
    }
}

pub fn visibility(app: &tauri::AppHandle, visible: bool) {
    let Some(host) = app.try_state::<Host>() else {
        return;
    };
    let changed = host.session.visible.swap(visible, Ordering::AcqRel) != visible;
    if !changed {
        return;
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(format!("window.__ngertiinDesktopVisibility?.({visible})"));
    }
    if !visible {
        let session = host.session.clone();
        tauri::async_runtime::spawn(async move {
            session.release_views().await;
        });
    }
}

pub fn hide(app: &tauri::AppHandle) {
    visibility(app, false);
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

pub fn quit(app: &tauri::AppHandle) {
    let Some(host) = app.try_state::<Host>() else {
        app.exit(1);
        return;
    };
    if host.quitting.swap(true, Ordering::AcqRel) {
        return;
    }
    visibility(app, false);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let host = app.state::<Host>();
        host.session.stop().await;
        host.gateway.shutdown.cancel();
        host.finished.store(true, Ordering::Release);
        host.session.log.event("desktop.stopped", json!({}));
        app.exit(0);
    });
}

pub fn save_geometry(window: &tauri::Window) {
    let Some(host) = window.try_state::<Host>() else {
        return;
    };
    if window.is_minimized().unwrap_or(true) {
        return;
    }
    let revision = host.geometry_revision.fetch_add(1, Ordering::AcqRel) + 1;
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        let host = app.state::<Host>();
        if host.geometry_revision.load(Ordering::Acquire) != revision {
            return;
        }
        let app_for_main = app.clone();
        let _ = app.run_on_main_thread(move || {
            let Some(window) = app_for_main.get_webview_window("main") else {
                return;
            };
            let host = app_for_main.state::<Host>();
            let Ok(scale) = window.scale_factor() else {
                return;
            };
            let Ok(size) = window.inner_size() else {
                return;
            };
            let Ok(position) = window.outer_position() else {
                return;
            };
            let size = size.to_logical::<f64>(scale);
            let position = position.to_logical::<f64>(scale);
            let maximized = window.is_maximized().unwrap_or(false);
            if maximized {
                return;
            }
            let geometry = Geometry {
                width: size.width,
                height: size.height,
                x: Some(position.x),
                y: Some(position.y),
                maximized,
            };
            let path = host.home.join("window.json");
            tauri::async_runtime::spawn_blocking(move || {
                let _ = write_private(&path, &geometry);
            });
        });
    });
}

fn menus(app: &tauri::App) -> Result<()> {
    let show_item = MenuItemBuilder::with_id("show", "Show Workspace").build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", "Quit Ngertiin")
        .accelerator("CmdOrCtrl+Q")
        .build(app)?;
    let application = SubmenuBuilder::new(app, "Ngertiin")
        .about(None)
        .separator()
        .item(&show_item)
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .item(&quit_item)
        .build()?;
    let edit = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .build()?;
    let view = SubmenuBuilder::new(app, "View")
        .item(
            &MenuItemBuilder::with_id("devtools", "Toggle Developer Tools")
                .accelerator("CmdOrCtrl+Alt+I")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("reload", "Reload")
                .accelerator("CmdOrCtrl+R")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom-reset", "Actual Size")
                .accelerator("CmdOrCtrl+0")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom-in", "Zoom In")
                .accelerator("CmdOrCtrl+Plus")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("zoom-out", "Zoom Out")
                .accelerator("CmdOrCtrl+-")
                .build(app)?,
        )
        .fullscreen()
        .build()?;
    let development = SubmenuBuilder::new(app, "Development")
        .text("reconnect", "Reconnect Workspace")
        .text("logs", "Open Desktop Logs")
        .text("data", "Open Data Folder")
        .build()?;
    let menu = MenuBuilder::new(app)
        .items(&[&application, &edit, &view, &development])
        .build()?;
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| match event.id().as_ref() {
        "show" => show(app),
        "quit" => quit(app),
        "reload" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.reload();
            }
        }
        "devtools" => {
            if let Some(window) = app.get_webview_window("main") {
                if window.is_devtools_open() {
                    window.close_devtools();
                } else {
                    window.open_devtools();
                }
            }
        }
        "zoom-reset" | "zoom-in" | "zoom-out" => {
            if let Some(window) = app.get_webview_window("main") {
                let host = app.state::<Host>();
                let mut zoom = host.zoom.lock().unwrap_or_else(|e| e.into_inner());
                *zoom = match event.id().as_ref() {
                    "zoom-reset" => 1.,
                    "zoom-in" => (*zoom + 0.1).min(2.),
                    _ => (*zoom - 0.1).max(0.5),
                };
                let _ = window.set_zoom(*zoom);
            }
        }
        "reconnect" => {
            let session = app.state::<Host>().session.clone();
            tauri::async_runtime::spawn(async move {
                let _ = session.remote.metadata().await;
            });
        }
        "logs" => {
            let _ = open::that_detached(app.state::<Host>().home.join("tauri.log"));
        }
        "data" => {
            let _ = open::that_detached(&app.state::<Host>().home);
        }
        _ => {}
    });
    Ok(())
}

fn tray(app: &tauri::App) -> Result<()> {
    let menu = MenuBuilder::new(app)
        .text("show", "Open Ngertiin")
        .text("logs", "Open Desktop Logs")
        .separator()
        .text("quit", "Quit Ngertiin")
        .build()?;
    TrayIconBuilder::with_id("workspace")
        .icon(tauri::image::Image::from_bytes(include_bytes!(
            "../../dist/tray.png"
        ))?)
        .icon_as_template(true)
        .tooltip("Ngertiin · agents can work while the window is closed")
        .menu(&menu)
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                }
            ) {
                show(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}

fn external(url: &url::Url) {
    if url.as_str().len() > 8192 || !url.username().is_empty() || url.password().is_some() {
        return;
    }
    if url.scheme() == "https"
        || (url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
    {
        let _ = open::that_detached(url.as_str());
    }
}

fn trusted_blob(url: &url::Url, origin: &str) -> bool {
    url.scheme() == "blob"
        && url::Url::parse(url.path())
            .is_ok_and(|inner| inner.origin().ascii_serialization() == origin)
}

pub fn unique_destination(directory: &Path, suggested: &str) -> PathBuf {
    let name = Path::new(suggested)
        .file_name()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty() && *s != "." && *s != "..")
        .unwrap_or("download");
    let name: String = name
        .chars()
        .filter(|c| !c.is_control() && !['/', '\\', ':'].contains(c))
        .take(180)
        .collect();
    let file = Path::new(&name);
    let stem = file
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("download");
    let extension = file
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| format!(".{s}"))
        .unwrap_or_default();
    for index in 0..1000 {
        let path = directory.join(if index == 0 {
            name.clone()
        } else {
            format!("{stem} ({index}){extension}")
        });
        if !path.exists() {
            return path;
        }
    }
    directory.join(format!("{stem}-{}{extension}", uuid::Uuid::new_v4()))
}

async fn download(app: &tauri::AppHandle, url: &url::Url) -> Result<()> {
    use tokio::io::AsyncWriteExt;
    let host = app.state::<Host>();
    let response = reqwest::Client::builder()
        .no_proxy()
        .redirect(reqwest::redirect::Policy::none())
        .build()?
        .get(url.clone())
        .send()
        .await?
        .error_for_status()?;
    let disposition = response
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let name = disposition
        .split(';')
        .find_map(|part| part.trim().strip_prefix("filename="))
        .map(|s| s.trim_matches('"'))
        .unwrap_or("download");
    let directory = dirs::download_dir().context("The Downloads folder is unavailable.")?;
    let path = unique_destination(&directory, name);
    let mut file = tokio::fs::OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&path)
        .await?;
    let mut stream = response.bytes_stream();
    let result = async {
        while let Some(bytes) = stream.next().await {
            file.write_all(&bytes?).await?;
        }
        file.flush().await?;
        Ok::<_, anyhow::Error>(())
    }
    .await;
    if result.is_err() {
        drop(file);
        let _ = tokio::fs::remove_file(&path).await;
    }
    result?;
    host.session
        .log
        .event("desktop.download.finished", json!({"success": true}));
    Ok(())
}

fn signals(app: &tauri::AppHandle) {
    #[cfg(unix)]
    {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let Ok(mut terminate) =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            else {
                return;
            };
            tokio::select! { _ = terminate.recv() => {}, _ = tokio::signal::ctrl_c() => {} }
            quit(&app);
        });
    }
}
