use gpui_kit::{
    component::{Theme, ThemeMode},
    *,
};
use serde_json::Value;
use std::sync::LazyLock;

static TOKENS: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../../assets/theme-tokens.json"))
        .expect("Frozen web-client tokens must be valid JSON")
});

#[derive(Clone, Copy)]
pub struct Palette {
    pub dark: bool,
}
impl Palette {
    pub fn new(dark: bool) -> Self {
        Self { dark }
    }
    pub fn color(self, name: &str) -> Hsla {
        let tokens = &TOKENS[if self.dark { "dark" } else { "light" }];
        let mut value = tokens[name].as_str().expect("Known theme token");
        for _ in 0..4 {
            if let Some(reference) = value
                .strip_prefix("var(--")
                .and_then(|s| s.strip_suffix(')'))
            {
                value = tokens[reference].as_str().expect("Known theme alias");
            } else {
                break;
            }
        }
        let hex = value
            .strip_prefix('#')
            .expect("Color token must be a hex value");
        if hex.len() == 8 {
            rgba(u32::from_str_radix(hex, 16).expect("Hex token")).into()
        } else {
            rgb(u32::from_str_radix(hex, 16).expect("Hex token")).into()
        }
    }
}

pub fn apply(dark: bool, window: Option<&mut Window>, cx: &mut App) {
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
        theme.font_size = px(14.);
        theme.colors.background = p.color("background");
        theme.colors.foreground = p.color("foreground");
        theme.colors.primary = p.color("primary");
        theme.colors.primary_foreground = p.color("primary-foreground");
        theme.colors.secondary = p.color("secondary");
        theme.colors.secondary_foreground = p.color("secondary-foreground");
        theme.colors.muted = p.color("muted");
        theme.colors.muted_foreground = p.color("muted-foreground");
        theme.colors.border = p.color("border");
        theme.colors.input = p.color("input");
        theme.colors.ring = p.color("ring");
        theme.colors.popover = p.color("popover");
        theme.colors.popover_foreground = p.color("popover-foreground");
    });
}
