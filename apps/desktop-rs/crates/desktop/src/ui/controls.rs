//! Stateless presentation. Callers own state, callbacks and final style overrides.
use super::theme::Palette;
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    component::button::{Button, ButtonCustomVariant, ButtonVariants},
    *,
};

#[derive(Clone, Copy)]
pub enum ButtonKind {
    Default,
    Outline,
    Primary,
    Secondary,
    Ghost,
    Danger,
    Link,
}

pub fn button(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    kind: ButtonKind,
    p: Palette,
    cx: &App,
) -> Button {
    let label = label.into();
    let (background, foreground, hover, pressed) = match kind {
        ButtonKind::Default | ButtonKind::Outline => {
            ("control", "foreground", "control-hover", "control-hover")
        }
        ButtonKind::Primary => (
            "primary",
            "primary-foreground",
            "primary-hover",
            "primary-pressed",
        ),
        ButtonKind::Ghost => ("background", "foreground", "menu-hover", "menu-active"),
        ButtonKind::Secondary => ("secondary", "secondary-foreground", "accent", "accent"),
        ButtonKind::Danger => (
            "danger-action",
            "destructive-foreground",
            "danger-action",
            "danger-action",
        ),
        ButtonKind::Link => ("background", "link", "background", "background"),
    };
    let surface = if matches!(kind, ButtonKind::Ghost | ButtonKind::Link) {
        rgba(0).into()
    } else {
        p.color(background)
    };
    Button::new(id)
        .when(!label.is_empty(), |button| button.label(label.clone()))
        .accessibility_label(label)
        .custom(
            ButtonCustomVariant::new(cx)
                .color(surface)
                .foreground(p.color(foreground))
                .hover(if matches!(kind, ButtonKind::Danger) {
                    p.color(hover).opacity(0.9)
                } else {
                    p.color(hover)
                })
                .active(if matches!(kind, ButtonKind::Danger) {
                    p.color(pressed).opacity(0.9)
                } else {
                    p.color(pressed)
                }),
        )
        // GPUI 0.9 custom variants tint their resting background toward
        // transparency. Product tokens specify the complete solid surface.
        .bg(surface)
        .rounded(px(8.))
        .h(px(32.))
        .text_size(px(13.))
        .font_weight(FontWeight::MEDIUM)
        .when(
            matches!(kind, ButtonKind::Default | ButtonKind::Outline),
            |button| button.border_1().border_color(p.color("border")),
        )
}

pub trait ProductButtonStyle {
    fn disabled_state(self, disabled: bool, palette: Palette) -> Self;
}
impl ProductButtonStyle for Button {
    fn disabled_state(self, disabled: bool, palette: Palette) -> Self {
        use gpui_kit::component::Disableable;
        self.disabled(disabled).when(disabled, |button| {
            button
                .bg(palette.color("disabled-surface"))
                .text_color(palette.color("disabled-foreground"))
                .border_color(palette.color("disabled-surface"))
        })
    }
}

pub fn icon(name: &str, p: Palette) -> impl IntoElement {
    svg()
        .path(SharedString::from(format!("icons/{name}.svg")))
        .size(px(18.))
        .text_color(p.color("foreground"))
}

/// Expose caller-owned overlay copy to the native accessibility tree.
pub fn accessible_text(
    id: impl Into<ElementId>,
    text: impl Into<SharedString>,
    role: Role,
) -> Stateful<Div> {
    let text = text.into();
    div().id(id).role(role).aria_label(text.clone()).child(text)
}

pub fn card(p: Palette) -> Div {
    div()
        .flex()
        .flex_col()
        .gap_3()
        .p_5()
        .rounded(px(16.))
        .bg(p.color("panel"))
}
pub fn row() -> Div {
    div().flex().items_center().gap_3().flex_wrap()
}
pub fn caption(text: impl Into<SharedString>, p: Palette) -> Div {
    div()
        .text_size(px(12.))
        .line_height(px(18.))
        .text_color(p.color("muted-foreground"))
        .child(text.into())
}
pub fn title(text: impl Into<SharedString>) -> Div {
    div()
        .text_size(px(20.))
        .font_weight(FontWeight::SEMIBOLD)
        .child(text.into())
}
pub fn state(id: &'static str, label: &str, detail: &str, p: Palette) -> Stateful<Div> {
    card(p)
        .id(id)
        .role(Role::Status)
        .aria_label(label.to_owned())
        .aria_description(detail.to_owned())
        .child(
            div()
                .font_weight(FontWeight::MEDIUM)
                .child(label.to_owned()),
        )
        .child(caption(detail.to_owned(), p))
}
