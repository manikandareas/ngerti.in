mod app;
mod assets;
mod fixtures;
mod server;
mod theme;

use app::Experiment;
use gpui_kit::*;
use std::borrow::Cow;

fn main() {
    let origin = server::start(assets::asset_root()).expect("Failed to start local fixture server");
    #[cfg(target_os = "windows")]
    unsafe {
        std::env::set_var("GPUI_DISABLE_DIRECT_COMPOSITION", "true");
    }
    #[cfg(target_os = "linux")]
    let application = gpui_kit::platform::linux(WindowingModes::X11);
    #[cfg(not(target_os = "linux"))]
    let application = gpui_kit::application();
    application
        .with_assets(assets::ExperimentAssets(assets::asset_root()))
        .run(move |cx| {
            init(cx);
            for name in ["Geist", "GeistMono"] {
                let bytes = std::fs::read(assets::asset_root().join(format!("fonts/{name}.ttf")))
                    .expect("Missing bundled fonts. Run the preparation command first.");
                cx.text_system()
                    .add_fonts(vec![Cow::Owned(bytes)])
                    .expect("Failed to register Geist font");
            }
            theme::apply_theme(false, None, cx);
            cx.on_action(|_: &app::Quit, cx| cx.quit());
            cx.bind_keys([
                KeyBinding::new("cmd-q", app::Quit, None),
                KeyBinding::new("cmd-1", app::ShowWorkspace, None),
                KeyBinding::new("cmd-2", app::ShowRich, None),
                KeyBinding::new("cmd-3", app::ShowCode, None),
                KeyBinding::new("cmd-4", app::ShowAvatar, None),
                KeyBinding::new("cmd-5", app::ShowHtml, None),
                KeyBinding::new("cmd-6", app::ShowComputer, None),
                KeyBinding::new("cmd-d", app::ToggleTheme, None),
                KeyBinding::new("cmd-b", app::TogglePanel, None),
            ]);
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(1280.), px(820.)),
                    cx,
                ))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Ngertiin GPUI Experiment".into()),
                    ..Default::default()
                }),
                window_min_size: Some(size(px(900.), px(600.))),
                ..Default::default()
            };
            open_window(options, cx, |window, cx| {
                cx.new(|cx| Experiment::new(&origin, window, cx))
            })
            .expect("Failed to open experiment window");
            cx.activate(true);
        });
}
