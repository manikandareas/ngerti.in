//! Product chrome using the same geometry and assets as the Tauri reference.
use super::{
    controls::{ButtonKind, button},
    theme::{Palette, ui, ui_px},
};
use gpui_kit::{component::button::Button, *};

pub fn glyph(name: &str, size: f32, p: Palette) -> impl IntoElement {
    svg()
        .path(SharedString::from(format!("icons/{name}.svg")))
        .size(ui(size))
        .text_color(p.color("foreground"))
}
pub fn action(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    name: &str,
    p: Palette,
    cx: &App,
) -> Button {
    action_tinted(id, label, name, p.color("foreground"), p, cx)
}
pub fn action_tinted(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    name: &str,
    color: Hsla,
    p: Palette,
    cx: &App,
) -> Button {
    let label = label.into();
    button(id, "", ButtonKind::Ghost, p, cx)
        .accessibility_label(label)
        .p_0()
        .gap_0()
        .size(ui(32.))
        .rounded(ui_px(8., cx))
        .child(
            svg()
                .path(SharedString::from(format!("icons/{name}.svg")))
                .size(ui(18.))
                .text_color(color),
        )
}
pub fn header_action(
    id: impl Into<ElementId>,
    label: impl Into<SharedString>,
    name: &str,
    p: Palette,
    cx: &App,
) -> Button {
    action(id, label, name, p, cx)
        .size(ui(39.))
        .rounded_full()
        .bg(p.color("header-surface"))
}
