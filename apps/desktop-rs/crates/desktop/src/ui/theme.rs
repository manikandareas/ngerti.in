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
        self.resolve(name, 0)
    }
    fn resolve(self, name: &str, depth: usize) -> Hsla {
        assert!(depth < 8, "Frozen theme color references must be acyclic");
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
        if let Some(mix) = value
            .strip_prefix("color-mix(in srgb, ")
            .and_then(|s| s.strip_suffix(')'))
        {
            let (first, second) = mix.split_once(", ").expect("Frozen sRGB mix operands");
            let (second, percent) = second.rsplit_once(' ').expect("Frozen sRGB mix weight");
            let weight = percent
                .strip_suffix('%')
                .expect("Percent mix weight")
                .parse::<f32>()
                .expect("Numeric mix weight")
                / 100.;
            let operand = |reference: &str| -> Rgba {
                self.resolve(
                    reference
                        .strip_prefix("var(--")
                        .and_then(|s| s.strip_suffix(')'))
                        .expect("Frozen color reference"),
                    depth + 1,
                )
                .into()
            };
            let (a, b) = (operand(first), operand(second));
            return Rgba {
                r: a.r * (1. - weight) + b.r * weight,
                g: a.g * (1. - weight) + b.g * weight,
                b: a.b * (1. - weight) + b.b * weight,
                a: a.a * (1. - weight) + b.a * weight,
            }
            .into();
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
        theme.highlight_theme = std::sync::Arc::new(
            serde_json::from_str(if dark {
                include_str!("../../../../assets/syntax-dark.json")
            } else {
                include_str!("../../../../assets/syntax-light.json")
            })
            .expect("Frozen syntax theme"),
        );
        theme.font_family = "Geist".into();
        theme.mono_font_family = "Geist Mono".into();
        theme.font_size = px(14.);
        theme.colors.background = p.color("background");
        theme.colors.foreground = p.color("foreground");
        theme.colors.primary = p.color("primary");
        theme.colors.primary_foreground = p.color("primary-foreground");
        theme.colors.primary_hover = p.color("primary-hover");
        theme.colors.primary_active = p.color("primary-pressed");
        theme.colors.secondary = p.color("secondary");
        theme.colors.secondary_foreground = p.color("secondary-foreground");
        theme.colors.secondary_hover = p.color("accent");
        theme.colors.secondary_active = p.color("accent");
        theme.colors.accent = p.color("accent");
        theme.colors.accent_foreground = p.color("accent-foreground");
        theme.colors.button = p.color("control");
        theme.colors.button_foreground = p.color("foreground");
        theme.colors.button_hover = p.color("control-hover");
        theme.colors.button_active = p.color("control-hover");
        theme.colors.danger = p.color("danger-action");
        theme.colors.danger_foreground = p.color("destructive-foreground");
        theme.colors.link = p.color("link");
        theme.colors.link_hover = p.color("link");
        theme.colors.link_active = p.color("link");
        theme.colors.secondary_foreground = p.color("secondary-foreground");
        theme.colors.muted = p.color("muted");
        theme.colors.muted_foreground = p.color("muted-foreground");
        theme.colors.border = p.color("border");
        theme.colors.input = p.color("input");
        theme.colors.ring = p.color("ring");
        theme.colors.popover = p.color("popover");
        theme.colors.popover_foreground = p.color("popover-foreground");
        theme.colors.table_head = p.color("muted");
        theme.colors.table_head_foreground = p.color("muted-foreground");
        theme.colors.list_hover = p.color("menu-hover");
        theme.colors.list_active = p.color("menu-active");
        theme.colors.switch = p.color("input");
        theme.colors.switch_thumb = p.color("thumb");
        theme.colors.skeleton = p.color("muted");
        theme.colors.scrollbar_thumb = p.color("scrollbar");
        theme.colors.scrollbar_thumb_hover = p.color("scrollbar-hover");
    });
}
