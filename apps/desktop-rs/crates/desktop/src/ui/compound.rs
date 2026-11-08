//! Shared compound controls. These inputs contain no conversation or backend policy.
use super::{controls::*, theme::Palette};
use gpui_kit::{
    component::{Disableable, Selectable, button::Button},
    *,
};

#[derive(Clone, Copy)]
pub enum Tone {
    Neutral,
    Success,
    Warning,
    Danger,
}

pub fn badge(
    id: &'static str,
    text: impl Into<SharedString>,
    tone: Tone,
    p: Palette,
) -> Stateful<Div> {
    let text = text.into();
    let (background, foreground) = match tone {
        Tone::Neutral => ("secondary", "foreground"),
        Tone::Success => ("success", "success-foreground"),
        Tone::Warning => ("warning", "warning-foreground"),
        Tone::Danger => ("danger-soft", "destructive"),
    };
    div()
        .id(id)
        .role(Role::Label)
        .aria_label(text.clone())
        .px_2()
        .py_1()
        .rounded_full()
        .text_size(px(12.))
        .bg(p.color(background))
        .text_color(p.color(foreground))
        .child(text)
}

pub struct RowProps {
    pub id: &'static str,
    pub label: SharedString,
    pub hint: SharedString,
    pub selected: bool,
    pub disabled: bool,
}
pub fn list_row(props: RowProps, p: Palette, cx: &App) -> Button {
    button(props.id, props.label.clone(), ButtonKind::Ghost, p, cx)
        .accessibility_label(props.label.clone())
        .selected(props.selected)
        .disabled(props.disabled)
        .w_full()
        .min_h(px(46.))
        .h_auto()
        .justify_start()
        .px(px(14.))
        .child(caption(props.hint, p))
}

pub fn field(
    id: &'static str,
    label: impl Into<SharedString>,
    hint: impl Into<SharedString>,
    input: impl IntoElement,
    p: Palette,
) -> Stateful<Div> {
    let label = label.into();
    let hint = hint.into();
    div()
        .id(id)
        .role(Role::Group)
        .aria_label(label.clone())
        .aria_description(hint.clone())
        .flex()
        .flex_col()
        .gap_2()
        .child(label)
        .child(input)
        .child(caption(hint, p))
}
pub fn separator(p: Palette) -> Div {
    div().w_full().h(px(1.)).bg(p.color("border-subtle"))
}
pub fn skeleton(id: &'static str, p: Palette) -> Stateful<Div> {
    div()
        .id(id)
        .role(Role::Status)
        .aria_label("Loading content")
        .h(px(32.))
        .w_full()
        .rounded(px(8.))
        .bg(p.color("muted"))
}
pub fn bubble(
    id: &'static str,
    text: impl Into<SharedString>,
    emphasized: bool,
    p: Palette,
) -> Stateful<Div> {
    let text = text.into();
    div()
        .id(id)
        .role(Role::Paragraph)
        .aria_label(text.clone())
        .max_w(px(560.))
        .px_4()
        .py_3()
        .rounded(px(24.))
        .bg(p.color(if emphasized { "user-bubble" } else { "card" }))
        .text_color(p.color(if emphasized {
            "user-bubble-foreground"
        } else {
            "foreground"
        }))
        .child(text)
}

/// The input owns editing/focus/disabled behavior; this group composes adornments.
pub fn input_group(
    id: &'static str,
    label: impl Into<SharedString>,
    input: impl IntoElement,
    leading: Option<AnyElement>,
    trailing: Option<AnyElement>,
    p: Palette,
) -> Stateful<Div> {
    div()
        .id(id)
        .role(Role::Group)
        .aria_label(label)
        .flex()
        .items_center()
        .gap_2()
        .px_3()
        .py_1()
        .rounded(px(8.))
        .bg(p.color("control"))
        .children(leading)
        .child(div().flex_1().min_w_0().child(input))
        .children(trailing)
}
