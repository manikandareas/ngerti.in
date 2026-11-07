//! Stateless presentation. Callers own state, callbacks and final style overrides.
use super::theme::Palette;
use gpui_kit::{
    component::button::{Button, ButtonCustomVariant, ButtonVariants},
    *,
};

#[derive(Clone, Copy)]
pub enum ButtonKind {
    Default,
    Primary,
    Ghost,
    Danger,
}

pub fn button(
    id: &'static str,
    label: impl Into<SharedString>,
    kind: ButtonKind,
    p: Palette,
    cx: &App,
) -> Button {
    let label = label.into();
    let (background, foreground, hover, pressed) = match kind {
        ButtonKind::Default => ("control", "foreground", "secondary", "accent"),
        ButtonKind::Primary => (
            "primary",
            "primary-foreground",
            "primary-hover",
            "primary-pressed",
        ),
        ButtonKind::Ghost => ("background", "foreground", "menu-hover", "menu-active"),
        ButtonKind::Danger => ("danger-soft", "destructive", "danger-soft", "danger-soft"),
    };
    Button::new(id)
        .label(label.clone())
        .accessibility_label(label)
        .custom(
            ButtonCustomVariant::new(cx)
                .color(p.color(background))
                .foreground(p.color(foreground))
                .hover(p.color(hover))
                .active(p.color(pressed)),
        )
        .rounded(px(8.))
        .h(px(32.))
        .text_size(px(13.))
}

pub fn icon(name: &str, p: Palette) -> impl IntoElement {
    svg()
        .path(SharedString::from(format!("icons/{name}.svg")))
        .size(px(18.))
        .text_color(p.color("foreground"))
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
