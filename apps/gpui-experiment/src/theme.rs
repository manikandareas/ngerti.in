use gpui_kit::component::{Theme, ThemeMode};
use gpui_kit::*;

#[derive(Clone, Copy)]
pub struct Palette {
    pub background: Hsla,
    pub foreground: Hsla,
    pub card: Hsla,
    pub secondary: Hsla,
    pub muted: Hsla,
    pub border: Hsla,
    pub frame: Hsla,
    pub panel: Hsla,
    pub composer: Hsla,
    pub link: Hsla,
    pub user: Hsla,
}
impl Palette {
    pub fn new(dark: bool) -> Self {
        let values = if dark {
            [
                0x121212, 0xf5f5f5, 0x1f1f1f, 0x202020, 0xb1b1b1, 0x2a2a2a, 0x090909, 0x0e0e0e,
                0x1f1f1f, 0x7fc0ff, 0x70757c,
            ]
        } else {
            [
                0xfcfcfc, 0x1c1c1c, 0xf0f0f0, 0xe4e4e4, 0x555555, 0xe3e3e3, 0xededed, 0xf5f5f5,
                0xffffff, 0x0b5cb8, 0x70757c,
            ]
        };
        let [
            background,
            foreground,
            card,
            secondary,
            muted,
            border,
            frame,
            panel,
            composer,
            link,
            user,
        ] = values.map(|color| rgb(color).into());
        Self {
            background,
            foreground,
            card,
            secondary,
            muted,
            border,
            frame,
            panel,
            composer,
            link,
            user,
        }
    }
}
pub fn apply_theme(dark: bool, window: Option<&mut Window>, cx: &mut App) {
    Theme::change(
        if dark {
            ThemeMode::Dark
        } else {
            ThemeMode::Light
        },
        window,
        cx,
    );
    let p = Palette::new(dark);
    Theme::update(cx, |theme| {
        theme.font_family = "Geist".into();
        theme.mono_font_family = "Geist Mono".into();
        theme.font_size = px(16.);
        theme.colors.background = p.background;
        theme.colors.foreground = p.foreground;
        theme.colors.muted_foreground = p.muted;
        theme.colors.primary = rgb(0x0b62c4).into();
        theme.colors.border = p.border;
        theme.colors.input = p.composer;
        theme.colors.secondary = p.secondary;
    });
}
