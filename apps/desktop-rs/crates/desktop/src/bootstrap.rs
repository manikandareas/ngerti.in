use crate::{platform::assets, shell::Gallery, ui::theme};
use gpui_kit::*;
use std::borrow::Cow;

pub fn run() -> anyhow::Result<()> {
    run_mode(std::env::var_os("NGERTIIN_RS_GALLERY").is_some())
}
pub(crate) fn run_mode(gallery: bool) -> anyhow::Result<()> {
    let profile = crate::host::profile_root()?;
    let fixture = if gallery {
        Some(crate::features::ProbeAssets::prepare(&profile)?)
    } else {
        None
    };
    let store = if gallery {
        None
    } else {
        Some(crate::storage::Store::open(profile.join("workspace"))?)
    };
    gpui_kit::application()
        .with_assets(assets::Assets)
        .run(move |cx| {
            init(cx);
            crate::platform::motion::bind(cx);
            for name in ["Geist", "GeistMono"] {
                cx.text_system()
                    .add_fonts(vec![Cow::Owned(
                        std::fs::read(assets::root().join(format!("fonts/{name}.ttf")))
                            .expect("Bundled reference fonts must be present"),
                    )])
                    .expect("Reference font registration failed");
            }
            theme::apply(false, None, cx);
            cx.on_action(|_: &crate::shell::Quit, cx| cx.quit());
            cx.bind_keys([
                KeyBinding::new("cmd-q", crate::shell::Quit, None),
                KeyBinding::new("cmd-d", crate::shell::ToggleTheme, None),
            ]);
            let options = WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                    None,
                    size(px(1280.), px(900.)),
                    cx,
                ))),
                window_min_size: Some(size(px(720.), px(500.))),
                titlebar: Some(TitlebarOptions {
                    title: Some("Ngertiin Rust Development".into()),
                    ..Default::default()
                }),
                ..Default::default()
            };
            if let Some(fixture) = fixture {
                open_window(options, cx, |window, cx| {
                    cx.new(|cx| Gallery::new(fixture, window, cx))
                })
                .expect("The native gallery window could not open");
            } else if let Some(store) = store {
                open_window(options, cx, |window, cx| {
                    cx.new(|cx| crate::workspace::Workspace::new(store, window, cx))
                })
                .expect("The native workspace window could not open");
            }
            cx.activate(true);
        });
    Ok(())
}
