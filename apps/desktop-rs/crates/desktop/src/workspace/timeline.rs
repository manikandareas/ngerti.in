//! Native milestone disclosure mirrors conversationEntries and TimelineActivity.
use super::*;
use crate::{
    models::message::PublicationTime,
    ui::{
        controls::{ButtonKind, button, caption},
        theme::{Palette, ui},
        workspace::glyph,
    },
};
use gpui_kit::{base::TestSupportExt, component::collapsible::Collapsible, prelude::FluentBuilder};
use ngertiin_client::{rows, text};

pub(super) fn batchable(parts: &[Value], next: &Value) -> bool {
    let Some(first) = parts.first() else {
        return false;
    };
    let kind = text(next, "kind");
    text(first, "kind") == kind
        && !kind.starts_with("routine_")
        && !matches!(
            kind,
            "handoff_requested" | "handoff_failed" | "goal_blocked"
        )
        && PublicationTime::local(text(first, "created_at"))
            .ok()
            .zip(PublicationTime::local(text(next, "created_at")).ok())
            .is_some_and(|(first, next)| first.date == next.date)
}

fn label(kind: &str) -> &'static str {
    match kind {
        "goal_created" => "Goal created",
        "goal_completed" => "Goal completed",
        "goal_blocked" => "Goal needs attention",
        "goal_paused" => "Goal paused",
        "goal_resumed" => "Goal resumed",
        "goal_stopped" => "Goal stopped",
        "routine_created" => "Routine created",
        "routine_paused" => "Routine paused",
        "routine_resumed" => "Routine resumed",
        "routine_stopped" => "Routine stopped",
        _ => "Work needs attention",
    }
}

impl Workspace {
    pub(super) fn timeline_view(
        &self,
        id: &str,
        parts: &[Value],
        cx: &mut Context<Self>,
    ) -> AnyElement {
        if parts.len() == 1 {
            return self.milestone(&parts[0], cx);
        }
        let p = Palette::new(self.store.dark());
        let expanded = self.conversation.timeline_expanded.contains(id);
        let target = id.to_owned();
        let title = format!("{} · {}", parts.len(), label(text(&parts[0], "kind")));
        let trigger = button(
            SharedString::from(format!("milestone-batch:{id}")),
            title,
            ButtonKind::Ghost,
            p,
            cx,
        )
        .h(ui(32.))
        .text_size(ui(12.))
        .text_color(p.color("muted-foreground"))
        .child(glyph(
            if expanded {
                "ArrowUp01Icon"
            } else {
                "ArrowDown01Icon"
            },
            12.,
            p,
        ))
        .on_click(cx.listener(move |this, _, _, cx| {
            if !this.conversation.timeline_expanded.remove(&target) {
                this.conversation.timeline_expanded.insert(target.clone());
            }
            this.conversation
                .scroller
                .update(cx, |scroller, cx| scroller.remeasure(cx));
            cx.notify();
        }));
        Collapsible::new()
            .open(expanded)
            .w_full()
            .child(div().flex().justify_center().child(trigger))
            .content(
                div()
                    .flex()
                    .flex_col()
                    .gap(ui(4.))
                    .children(parts.iter().map(|part| self.milestone(part, cx))),
            )
            .into_any_element()
    }
    fn milestone(&self, part: &Value, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let kind = text(part, "kind");
        let goal = kind.starts_with("goal_");
        let routine = kind.starts_with("routine_");
        let name = text(part, "name");
        let accessible = format!("{}: {name}", label(kind));
        let mut row = div()
            .flex()
            .flex_wrap()
            .items_center()
            .justify_center()
            .gap(ui(8.))
            .py(ui(5.))
            .text_size(ui(12.))
            .line_height(ui(18.))
            .text_color(p.color("muted-foreground"))
            .child(glyph(
                if goal {
                    "Target02Icon"
                } else if routine {
                    "Clock01Icon"
                } else {
                    "UserGroupIcon"
                },
                15.,
                p,
            ))
            .child(label(kind));
        if goal || routine {
            row = row.child(div().font_weight(FontWeight::MEDIUM).child(name.to_owned()));
        } else {
            for actor in rows(part, "actors") {
                let target = text(actor, "id").to_owned();
                row = row.child(
                    button(
                        SharedString::from(format!("milestone-actor:{target}")),
                        format!("@{}", text(actor, "name")),
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .h(ui(24.))
                    .text_size(ui(12.))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.show_member(target.clone(), window, cx)
                    })),
                );
            }
        }
        let resource = text(part, "resource_id").to_owned();
        let interactive = (goal || routine) && !resource.is_empty();
        let event = if interactive {
            row = row.child(glyph("ArrowUpRight01Icon", 14., p));
            button(
                SharedString::from(format!("timeline:{}", text(part, "id"))),
                "",
                ButtonKind::Ghost,
                p,
                cx,
            )
            .accessibility_label(accessible)
            .h_auto()
            .max_w_full()
            .child(row)
            .on_click(cx.listener(move |this, _, window, cx| {
                if goal {
                    this.show_goal(resource.clone(), window, cx)
                } else {
                    this.show_routine(resource.clone(), window, cx)
                }
            }))
            .into_any_element()
        } else {
            row.into_any_element()
        };
        div()
            .id(SharedString::from(format!(
                "milestone:{}",
                text(part, "id")
            )))
            .test_support()
            .w_full()
            .flex()
            .flex_col()
            .items_center()
            .child(event)
            .when(!text(part, "summary").is_empty(), |view| {
                view.child(
                    caption(text(part, "summary").to_owned(), p)
                        .text_center()
                        .max_w(ui(640.)),
                )
            })
            .when(!goal && !routine, |view| {
                view.children(
                    PublicationTime::local(text(part, "created_at"))
                        .ok()
                        .map(|time| crate::ui::message::clock(&time, p)),
                )
            })
            .into_any_element()
    }
}
