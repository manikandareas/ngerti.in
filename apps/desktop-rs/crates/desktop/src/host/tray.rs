//! Native macOS tray; callbacks dispatch the same application Actions as menus.
use gpui_kit::*;
use tray_icon::{
    Icon, TrayIcon, TrayIconBuilder,
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
};
struct Tray {
    _icon: TrayIcon,
    _task: Task<()>,
}
impl Global for Tray {}
pub(super) fn bind(cx: &mut App) -> anyhow::Result<()> {
    let menu = Menu::new();
    menu.append(&MenuItem::with_id("show", "Open Ngertiin", true, None))?;
    menu.append(&PredefinedMenuItem::separator())?;
    menu.append(&MenuItem::with_id("quit", "Quit Ngertiin", true, None))?;
    // Rasterize the same Hugeicons Computer symbol used by the native panel.
    let tree = resvg::usvg::Tree::from_str(
        include_str!("../../../../assets/icons/ComputerIcon.svg"),
        &resvg::usvg::Options::default(),
    )?;
    let mut pixels = resvg::tiny_skia::Pixmap::new(24, 24)
        .ok_or_else(|| anyhow::anyhow!("Tray raster unavailable"))?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::identity(),
        &mut pixels.as_mut(),
    );
    let icon = TrayIconBuilder::new()
        .with_id("ngertiin-rust")
        .with_menu(Box::new(menu))
        .with_tooltip("Ngertiin · agents can work while the window is closed")
        .with_icon(Icon::from_rgba(pixels.take(), 24, 24)?)
        .with_icon_as_template(true)
        .build()?;
    let task = cx.spawn(async move |cx| {
        loop {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(150))
                .await;
            while let Ok(event) = MenuEvent::receiver().try_recv() {
                cx.update(|cx| match event.id.as_ref() {
                    "show" => super::lifecycle::show(cx),
                    "quit" => cx.dispatch_action(&crate::shell::Quit),
                    _ => {}
                });
            }
        }
    });
    cx.set_global(Tray {
        _icon: icon,
        _task: task,
    });
    Ok(())
}
