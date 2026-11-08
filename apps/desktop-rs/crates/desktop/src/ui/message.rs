use super::avatar_view::AvatarPortrait;
use crate::{
    models::message::*,
    ui::{controls::*, theme::Palette},
};
use gpui_kit::component::shimmer::ShimmerText;
use gpui_kit::{
    component::text::{TextView, TextViewState},
    *,
};
use std::sync::Arc;

pub fn day_marker(date: &str, p: Palette) -> impl IntoElement {
    div()
        .flex()
        .w_full()
        .justify_center()
        .items_center()
        .py_2()
        .gap_3()
        .child(div().h(px(1.)).flex_1().bg(p.color("border")))
        .child(caption(date.to_owned(), p))
        .child(div().h(px(1.)).flex_1().bg(p.color("border")))
}
pub fn clock(time: &PublicationTime, p: Palette) -> Stateful<Div> {
    caption(time.clock.clone(), p)
        .text_size(px(11.))
        .line_height(px(14.))
        .mt(px(2.))
        .id(SharedString::from(time.accessible.clone()))
        .aria_label(time.accessible.clone())
}
pub struct ActivityRow {
    pub id: String,
    pub author: String,
    pub kind: ActivityKind,
    pub time: PublicationTime,
    pub group: bool,
    pub avatar: Entity<AvatarPortrait>,
}
impl ActivityRow {
    pub fn view(&self, p: Palette) -> AnyElement {
        let loading = matches!(
            self.kind,
            ActivityKind::Thinking
                | ActivityKind::Reading
                | ActivityKind::Searching
                | ActivityKind::Working
        );
        let text = if loading {
            ShimmerText::new(self.kind.label())
                .id(SharedString::from(format!("{}-shimmer", self.id)))
                .duration(std::time::Duration::from_millis(2200))
                .spread(0.15)
                .highlight_color(p.color("foreground"))
                .into_any_element()
        } else {
            div().child(self.kind.label()).into_any_element()
        };
        let mut bubble = div()
            .max_w(px(448.))
            .flex()
            .flex_col()
            .gap(px(3.))
            .px(px(13.))
            .pt(px(9.))
            .pb(px(10.))
            .rounded(px(14.))
            .bg(p.color("card"));
        if self.group {
            bubble = bubble.child(
                div()
                    .text_size(px(12.))
                    .line_height(px(16.))
                    .font_weight(FontWeight::MEDIUM)
                    .child(self.author.clone()),
            );
        }
        bubble = bubble
            .child(
                div()
                    .text_size(px(14.))
                    .line_height(px(21.))
                    .text_color(p.color(if self.kind == ActivityKind::Failed {
                        "destructive"
                    } else {
                        "muted-foreground"
                    }))
                    .child(text),
            )
            .child(clock(&self.time, p));
        div()
            .id(SharedString::from(self.id.clone()))
            .role(Role::Status)
            .aria_label(format!("{}: {}", self.author, self.kind.label()))
            .flex()
            .gap(px(9.))
            .py(px(3.))
            .when(self.group, |v| v.child(self.avatar.clone()))
            .child(bubble)
            .into_any_element()
    }
}

pub fn attachment(
    id: impl Into<ElementId>,
    name: &str,
    detail: &str,
    p: Palette,
    cx: &App,
) -> gpui_kit::component::button::Button {
    button(id, "", ButtonKind::Default, p, cx)
        .accessibility_label(format!("Open {name}"))
        .h_auto()
        .justify_start()
        .gap_2()
        .p_3()
        .rounded(px(10.))
        .bg(p.color("secondary"))
        .text_color(p.color("foreground"))
        .child(icon("File02Icon", p))
        .child(
            div()
                .child(name.to_owned())
                .child(caption(detail.to_owned(), p)),
        )
}

#[derive(Clone, Debug)]
pub enum MessageIntent {
    Attachment(usize),
    Reference(String),
}

pub fn error_retry(
    id: &'static str,
    title: &str,
    detail: &str,
    p: Palette,
    cx: &App,
    on_retry: impl Fn(&ClickEvent, &mut Window, &mut App) + 'static,
) -> impl IntoElement {
    card(p)
        .child(state(id, title, detail, p).role(Role::Alert))
        .child(
            button(
                SharedString::from(format!("{id}-retry")),
                "Retry",
                ButtonKind::Default,
                p,
                cx,
            )
            .on_click(on_retry),
        )
}

pub struct Message {
    pub id: String,
    pub author: String,
    pub user: bool,
    pub group: bool,
    pub avatar: Option<Entity<AvatarPortrait>>,
    pub user_fill: Option<Hsla>,
    pub time: PublicationTime,
    pub body: Option<Entity<TextViewState>>,
    pub files: Vec<(String, String)>,
    pub references: Vec<(String, String)>,
}
impl Message {
    pub fn view(
        &self,
        p: Palette,
        cx: &App,
        on_open: impl Fn(MessageIntent, &mut Window, &mut App) + Send + Sync + 'static,
    ) -> AnyElement {
        let on_open = Arc::new(on_open);
        let mut bubble = div()
            .flex()
            .flex_col()
            .gap_2()
            .max_w(px(560.))
            .px(px(12.))
            .py(px(7.))
            .rounded(px(18.))
            .text_size(px(15.))
            .line_height(px(24.))
            .bg(if self.user {
                self.user_fill.unwrap_or_else(|| p.color("user-bubble"))
            } else {
                p.color("card")
            })
            .text_color(if self.user {
                rgb(0xffffff).into()
            } else {
                p.color("card-foreground")
            });
        if self.group {
            bubble = bubble.child(
                div()
                    .font_weight(FontWeight::MEDIUM)
                    .child(self.author.clone()),
            );
        }
        if let Some(body) = &self.body {
            let open = on_open.clone();
            bubble = bubble.child(TextView::new(body).selectable(true).on_link_click(
                move |url, _, window, cx| {
                    if url.starts_with("https://") || url.starts_with("http://") {
                        cx.open_url(url.as_str());
                    } else if url.starts_with("ngertiin://") {
                        open(MessageIntent::Reference(url.to_string()), window, cx);
                    }
                },
            ));
        }
        for (i, (name, detail)) in self.files.iter().enumerate() {
            let open = on_open.clone();
            bubble = bubble.child(
                attachment(("message-file", i), name, detail, p, cx)
                    .on_click(move |_, window, cx| open(MessageIntent::Attachment(i), window, cx)),
            );
        }
        for (i, (label, url)) in self.references.iter().enumerate() {
            let target = url.clone();
            let open = on_open.clone();
            bubble = bubble.child(
                button(
                    ("message-reference", i),
                    label.clone(),
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .px_2()
                .py_1()
                .rounded_full()
                .bg(p.color("secondary"))
                .on_click(move |_, window, cx| {
                    if target.starts_with("https://") || target.starts_with("http://") {
                        cx.open_url(&target);
                    } else {
                        open(MessageIntent::Reference(target.clone()), window, cx);
                    }
                }),
            );
        }
        bubble = bubble.child(
            div()
                .flex()
                .justify_end()
                .child(clock(&self.time, p).when(self.user, |v| v.text_color(rgb(0xffffff)))),
        );
        div()
            .id(SharedString::from(self.id.clone()))
            .flex()
            .w_full()
            .when(self.user, |v| v.justify_end())
            .gap_2()
            .when(self.group && !self.user, |v| {
                if let Some(avatar) = &self.avatar {
                    v.child(avatar.clone())
                } else {
                    v
                }
            })
            .child(bubble)
            .into_any_element()
    }
}
pub use super::interaction::{AnswerIntent, InteractionView};
use gpui_kit::prelude::FluentBuilder;
