//! Native application commands. Reload reconciles the API and keeps authored drafts.
use gpui_kit::component::{Theme, input};
use gpui_kit::*;
use serde::{Deserialize, Serialize};
actions!(
    native_host,
    [
        ShowWorkspace,
        HideWorkspace,
        Minimize,
        Fullscreen,
        ZoomIn,
        ZoomOut,
        ActualSize,
        Reload,
        Diagnostics
    ]
);
#[derive(Serialize, Deserialize)]
struct Geometry {
    x: f32,
    y: f32,
    width: f32,
    height: f32,
}
pub(crate) fn bounds(cx: &App) -> Bounds<Pixels> {
    let default = Bounds::centered(None, size(px(1280.), px(900.)), cx);
    let Ok(home) = super::profile_root() else {
        return default;
    };
    let Ok(g) = super::profile::private_json::<Geometry>(&home.join("window.json")) else {
        return default;
    };
    if ![g.x, g.y, g.width, g.height].iter().all(|x| x.is_finite()) {
        return default;
    }
    let desired = Bounds::new(
        point(px(g.x), px(g.y)),
        size(px(g.width.max(720.)), px(g.height.max(500.))),
    );
    let Some(display) = cx
        .displays()
        .into_iter()
        .find(|d| d.bounds().intersects(&desired))
    else {
        return default;
    };
    let screen = display.bounds();
    let width = desired.size.width.min(screen.size.width);
    let height = desired.size.height.min(screen.size.height);
    Bounds::new(
        point(
            desired
                .origin
                .x
                .clamp(screen.origin.x, screen.right() - width),
            desired
                .origin
                .y
                .clamp(screen.origin.y, screen.bottom() - height),
        ),
        size(width, height),
    )
}
pub(crate) fn save_bounds(window: &Window) {
    if !window.is_visible() {
        return;
    }
    let WindowBounds::Windowed(bounds) = window.window_bounds() else {
        return;
    };
    if let Ok(home) = super::profile_root() {
        let g = Geometry {
            x: bounds.origin.x.into(),
            y: bounds.origin.y.into(),
            // WindowOptions takes content size. AppKit's window bounds include
            // the title bar, so persisting those dimensions grows every relaunch.
            width: window.viewport_size().width.into(),
            height: window.viewport_size().height.into(),
        };
        let _ = super::profile::write_private(&home.join("window.json"), &g);
    }
}
pub(crate) fn show(cx: &mut App) {
    super::views::visibility(true);
    cx.activate(true);
    for window in cx.windows() {
        let _ = window.update(cx, |_, window, _| window.activate_window());
    }
}
pub(crate) fn bind(cx: &mut App) {
    #[cfg(target_os = "macos")]
    if let Err(error) = super::tray::bind(cx) {
        eprintln!("Native tray unavailable: {error}");
    }
    cx.bind_keys([
        KeyBinding::new("cmd-q", crate::shell::Quit, None),
        KeyBinding::new("cmd-h", HideWorkspace, None),
        KeyBinding::new("cmd-m", Minimize, None),
        KeyBinding::new("ctrl-cmd-f", Fullscreen, None),
        KeyBinding::new("cmd-r", Reload, None),
        KeyBinding::new("cmd-alt-i", Diagnostics, None),
        KeyBinding::new("cmd-+", ZoomIn, None),
        KeyBinding::new("cmd-=", ZoomIn, None),
        KeyBinding::new("cmd--", ZoomOut, None),
        KeyBinding::new("cmd-0", ActualSize, None),
    ]);
    cx.on_action(|_: &ShowWorkspace, cx| show(cx));
    cx.on_action(|_: &HideWorkspace, cx| {
        super::views::visibility(false);
        cx.hide();
    });
    cx.on_action(|_: &Minimize, cx| {
        if let Some(w) = cx.active_window() {
            let _ = w.update(cx, |_, w, _| w.minimize_window());
        }
    });
    cx.on_action(|_: &Fullscreen, cx| {
        if let Some(w) = cx.active_window() {
            let _ = w.update(cx, |_, w, _| w.toggle_fullscreen());
        }
    });
    cx.on_action(|_: &ZoomIn, cx| zoom(1., cx));
    cx.on_action(|_: &ZoomOut, cx| zoom(-1., cx));
    cx.on_action(|_: &ActualSize, cx| Theme::update(cx, |t| t.font_size = px(16.)));
    cx.on_system_sleep(|_| super::views::visibility(false))
        .detach();
    cx.on_system_wake(|cx| {
        super::views::visibility(true);
        cx.refresh_windows();
    })
    .detach();
    // GPUI's final quit hook has a short deadline. Stop services before requesting quit.
    cx.on_action(|_: &crate::shell::Quit, cx| {
        super::views::visibility(false);
        cx.spawn(async move |cx| {
            cx.background_spawn(async {
                super::views::cleanup();
                super::stop();
            })
            .await;
            cx.update(|cx| cx.quit());
        })
        .detach();
    });
    cx.on_app_quit(|_| async {
        super::views::visibility(false);
    })
    .detach();
    cx.set_menus([
        Menu::new("Ngertiin").items([
            MenuItem::action("Show Workspace", ShowWorkspace),
            MenuItem::action("Settings…", crate::workspace::OpenSettings),
            MenuItem::separator(),
            MenuItem::action("Hide Ngertiin", HideWorkspace),
            MenuItem::separator(),
            MenuItem::action("Quit Ngertiin", crate::shell::Quit),
        ]),
        Menu::new("Edit").items([
            MenuItem::os_action("Undo", input::Undo, OsAction::Undo),
            MenuItem::os_action("Redo", input::Redo, OsAction::Redo),
            MenuItem::separator(),
            MenuItem::os_action("Cut", input::Cut, OsAction::Cut),
            MenuItem::os_action("Copy", input::Copy, OsAction::Copy),
            MenuItem::os_action("Paste", input::Paste, OsAction::Paste),
            MenuItem::os_action("Select All", input::SelectAll, OsAction::SelectAll),
        ]),
        Menu::new("View").items([
            MenuItem::action("Reload", Reload),
            MenuItem::action("Developer Tools…", Diagnostics),
            MenuItem::separator(),
            MenuItem::action("Actual Size", ActualSize),
            MenuItem::action("Zoom In", ZoomIn),
            MenuItem::action("Zoom Out", ZoomOut),
            MenuItem::separator(),
        ]),
        Menu::new("Window").items([
            MenuItem::action("Minimize", Minimize),
            MenuItem::action("Show Workspace", ShowWorkspace),
        ]),
    ]);
}
fn zoom(step: f32, cx: &mut App) {
    Theme::update(cx, |t| {
        t.font_size = px((f32::from(t.font_size) + step * 1.6).clamp(8., 32.))
    });
}
