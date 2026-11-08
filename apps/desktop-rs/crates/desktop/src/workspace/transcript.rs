use super::*;
use crate::{
    models::message::{ActivityKind, PublicationTime},
    ui::{
        controls::*,
        message::{clock, day_marker},
        theme::{Palette, agent_bubble, ui},
    },
};
use gpui_kit::component::{
    shimmer::ShimmerText,
    text::{TextView, TextViewMotion, TextViewState},
};
use ngertiin_client::{rows, text};
use sha2::{Digest, Sha256};
use std::time::Duration;

pub(super) enum RowKind {
    Message {
        message: Value,
        body: Entity<TextViewState>,
        content: String,
    },
    Interaction {
        key: String,
        agent: String,
    },
    Run(Value),
    Route(Value),
    Bar(Value),
}
pub(super) struct TranscriptRow {
    pub id: String,
    pub at: String,
    pub starts_day: bool,
    pub kind: RowKind,
}
fn utf16_offset(s: &str, offset: u64) -> Option<usize> {
    let mut units = 0;
    for (i, c) in s.char_indices() {
        if units == offset {
            return Some(i);
        }
        units += c.len_utf16() as u64;
        if units > offset {
            return None;
        }
    }
    (units == offset).then_some(s.len())
}
fn observed_anchor(record: &Value, run: &Value, message: &Value) -> Option<usize> {
    let content = text(message, "text");
    if message["author"] == "user"
        && message["id"] == run["input_message_id"]
        && record["anchor_text_offset"].is_null()
        && record["anchor_prefix_sha256"].is_null()
    {
        return Some(content.len());
    }
    if message["author"] != "agent"
        || message["run_id"] != run["id"]
        || message["author_agent_id"] != run["agent_id"]
    {
        return None;
    }
    let offset = utf16_offset(content, record["anchor_text_offset"].as_u64()?)?;
    let prefix = &content[..offset];
    if format!("{:x}", Sha256::digest(prefix.as_bytes())) != text(record, "anchor_prefix_sha256") {
        return None;
    }
    // Internal positions must end a complete paragraph outside a fenced block.
    // Other Markdown/legacy positions retain their separate per-run card.
    if offset > 0 && offset < content.len() {
        if !prefix.ends_with("\n\n") {
            return None;
        }
        let mut fence = None;
        for line in prefix.lines() {
            let line = line.trim_start();
            for marker in ["```", "~~~"] {
                if line.starts_with(marker) {
                    if fence == Some(marker) {
                        fence = None;
                    } else if fence.is_none() {
                        fence = Some(marker);
                    }
                    break;
                }
            }
        }
        if fence.is_some() {
            return None;
        }
    }
    Some(offset)
}
impl Workspace {
    pub(super) fn rebuild_transcript(&mut self, cx: &mut Context<Self>) {
        let mut previous: BTreeMap<_, _> = self
            .transcript
            .drain(..)
            .map(|row| (row.id.clone(), row))
            .collect();
        // Preserve presentation order separately from the lookup map.
        let old_count = self.scroller.read(cx).item_count();
        let value = self.value().clone();
        let mut parts: Vec<_> = self.parts.values().cloned().collect();
        parts.sort_by_key(|p| p["sequence"].as_u64().unwrap_or(0));
        let mut result = vec![];
        let mut placed = std::collections::BTreeSet::new();
        let superseded: Vec<_> = rows(&value, "runs")
            .iter()
            .filter(|r| !r["retried_by_run_id"].is_null())
            .map(|r| r["id"].clone())
            .collect();
        for part in parts {
            if part["kind"] == "handoff_requested" {
                continue;
            }
            if part["kind"] != "message" {
                result.push(TranscriptRow {
                    id: text(&part, "id").into(),
                    at: text(&part, "created_at").into(),
                    starts_day: false,
                    kind: RowKind::Bar(part),
                });
                continue;
            }
            let Some(message) = rows(&value, "messages")
                .iter()
                .find(|m| m["id"] == part["message_id"])
            else {
                continue;
            };
            if message["state"] == "deleted"
                || matches!(
                    text(message, "purpose"),
                    "handoff" | "review" | "continuation"
                )
                || message["author"] == "agent" && superseded.contains(&message["run_id"])
            {
                continue;
            }
            if rows(&value, "human_requests")
                .iter()
                .any(|r| r["message_id"] == message["id"])
            {
                for request in rows(&value, "human_requests")
                    .iter()
                    .filter(|r| r["message_id"] == message["id"])
                {
                    let key = format!("human:{}", text(request, "id"));
                    if let Some(card) = self.interaction_views.get(&key) {
                        result.push(TranscriptRow {
                            id: key.clone(),
                            at: card.at.clone(),
                            starts_day: false,
                            kind: RowKind::Interaction {
                                key: key.clone(),
                                agent: text(request, "agent_id").into(),
                            },
                        });
                        placed.insert(key);
                    }
                }
                continue;
            }
            let mut anchors = vec![];
            for run in rows(&value, "runs") {
                for record in rows(
                    self.native.get(text(run, "id")).unwrap_or(&Value::Null),
                    "records",
                ) {
                    if record["anchor_message_id"] != message["id"] {
                        continue;
                    }
                    let prefix = format!(
                        "native:{}:{}:{}",
                        text(run, "id"),
                        text(record, "request_id"),
                        record["source_index"]
                    );
                    let Some(offset) = observed_anchor(record, run, message) else {
                        continue;
                    };
                    for (key, card) in self.interaction_views.iter().filter(|(key, _)| {
                        *key == &prefix || key.starts_with(&format!("{prefix}:"))
                    }) {
                        anchors.push((
                            offset,
                            key.clone(),
                            card.at.clone(),
                            text(run, "agent_id").to_owned(),
                        ));
                    }
                }
            }
            anchors.sort_by(|a, b| a.0.cmp(&b.0).then(a.2.cmp(&b.2)).then(a.1.cmp(&b.1)));
            let content = text(message, "text");
            let mut start = 0;
            let mut at = text(&part, "created_at").to_owned();
            for (offset, key, card_at, agent) in anchors {
                if offset > start {
                    push_message(
                        &mut result,
                        &mut previous,
                        message,
                        &content[start..offset],
                        start,
                        &at,
                        cx,
                    );
                }
                result.push(TranscriptRow {
                    id: key.clone(),
                    at: card_at.clone(),
                    starts_day: false,
                    kind: RowKind::Interaction {
                        key: key.clone(),
                        agent,
                    },
                });
                placed.insert(key);
                start = offset;
                at = at.max(card_at);
            }
            if start < content.len()
                || !result.iter().any(
                    |r| matches!(&r.kind,RowKind::Message{message:m,..} if m["id"]==message["id"]),
                )
            {
                push_message(
                    &mut result,
                    &mut previous,
                    message,
                    &content[start..],
                    start,
                    &at,
                    cx,
                );
            }
        }
        for (key, card) in &self.interaction_views {
            if placed.contains(key) {
                continue;
            }
            let agent = match &card.binding {
                super::interactions::Binding::Human(request) => {
                    text(request, "agent_id").to_owned()
                }
                super::interactions::Binding::Approval { run, .. }
                | super::interactions::Binding::Question { run, .. } => rows(&value, "runs")
                    .iter()
                    .find(|r| r["id"] == *run)
                    .map(|r| text(r, "agent_id").to_owned())
                    .unwrap_or_default(),
            };
            result.push(TranscriptRow {
                id: key.clone(),
                at: card.at.clone(),
                starts_day: false,
                kind: RowKind::Interaction {
                    key: key.clone(),
                    agent,
                },
            });
        }
        for run in rows(&value, "runs") {
            if matches!(text(run, "status"), "succeeded" | "steered")
                || !run["retried_by_run_id"].is_null()
            {
                continue;
            }
            let visible = result.iter().any(|row| match &row.kind {
                RowKind::Message { message, .. } => {
                    message["run_id"] == run["id"] || message["id"] == run["input_message_id"]
                }
                _ => false,
            });
            let interaction = result.iter().any(|row| matches!(&row.kind, RowKind::Interaction { key, .. } if key.starts_with(&format!("native:{}:", text(run, "id")))));
            if !visible || interaction && matches!(text(run, "status"), "running" | "dispatching") {
                continue;
            }
            let anchor = result
                .iter()
                .rposition(|row| match &row.kind {
                    RowKind::Message { message, .. } => {
                        message["run_id"] == run["id"] || message["id"] == run["input_message_id"]
                    }
                    RowKind::Interaction { key, .. } => {
                        key.starts_with(&format!("native:{}:", text(run, "id")))
                    }
                    _ => false,
                })
                .map(|i| i + 1)
                .unwrap_or(result.len());
            result.insert(
                anchor,
                TranscriptRow {
                    id: format!("run:{}", text(run, "id")),
                    at: result
                        .get(anchor.saturating_sub(1))
                        .map(|row| row.at.clone())
                        .unwrap_or_else(|| text(run, "created_at").into()),
                    starts_day: false,
                    kind: RowKind::Run(run.clone()),
                },
            );
        }
        for route in rows(&value, "routes")
            .iter()
            .filter(|route| route["state"] != "selected")
        {
            let anchor=result.iter().rposition(|row|matches!(&row.kind,RowKind::Message{message,..} if message["id"]==route["message_id"])).map(|i|i+1).unwrap_or(result.len());
            result.insert(
                anchor,
                TranscriptRow {
                    id: format!("route:{}", text(route, "id")),
                    at: text(route, "created_at").into(),
                    starts_day: false,
                    kind: RowKind::Route(route.clone()),
                },
            );
        }
        let mut day = String::new();
        for row in &mut result {
            if let Ok(time) = PublicationTime::local(&row.at) {
                row.starts_day = time.date != day;
                day = time.date;
            }
        }
        // Splice only the changed identity interval; prepend and tail updates keep
        // GPUI's logical item anchor while a reader is above the latest content.
        let new_ids: Vec<_> = result.iter().map(|r| r.id.clone()).collect();
        let original_ids = self.row_order();
        let prefix = original_ids
            .iter()
            .zip(&new_ids)
            .take_while(|(a, b)| a == b)
            .count();
        let suffix = original_ids[prefix..]
            .iter()
            .rev()
            .zip(new_ids[prefix..].iter().rev())
            .take_while(|(a, b)| a == b)
            .count();
        self.scroller.update(cx, |state, cx| {
            if old_count != original_ids.len() {
                state.reset(result.len(), cx);
            } else {
                state.splice(
                    prefix..old_count - suffix,
                    result.len() - prefix - suffix,
                    cx,
                );
                state.remeasure(cx);
            }
        });
        self.transcript = result;
        self.order = new_ids;
    }
    fn row_order(&self) -> Vec<String> {
        self.order.clone()
    }
    pub(super) fn transcript_row(
        &mut self,
        ix: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let Some(row) = self.transcript.get(ix) else {
            return div().into_any_element();
        };
        let at = row.at.clone();
        let day = row.starts_day;
        let id = row.id.clone();
        let group = self.value()["thread"]["type"] == "group";
        let mut container = div()
            .id(SharedString::from(id.clone()))
            .w_full()
            .max_w(ui(1000.))
            .mx_auto()
            .flex()
            .flex_col()
            .px(ui(20.))
            .gap(ui(0.));
        if day && let Ok(time) = PublicationTime::local(&at) {
            container = container.child(day_marker(&time.day_label, p));
        }
        let content = match &row.kind {
            RowKind::Message { message, body, .. } => {
                let message = message.clone();
                let body = body.clone();
                let user = message["author"] == "user";
                let agent = text(&message, "author_agent_id").to_owned();
                let partial = message["state"] == "partial";
                let name = if user {
                    "Kamu".to_owned()
                } else {
                    self.agents
                        .iter()
                        .find(|a| a["id"] == agent)
                        .map(|a| text(a, "name").to_owned())
                        .unwrap_or_else(|| "Agent".into())
                };
                let mut bubble = div()
                    .flex()
                    .flex_col()
                    .gap(ui(0.))
                    .max_w(ui(560.))
                    .px(ui(12.))
                    .py(ui(7.))
                    .rounded(ui(18.))
                    .font_weight(FontWeight::NORMAL)
                    .text_size(ui(15.))
                    .line_height(ui(24.))
                    .bg(if user {
                        if group {
                            p.color("primary")
                        } else {
                            self.selected_agent()
                                .map(|agent| agent_bubble(agent, p))
                                .unwrap_or(p.color("user-bubble"))
                        }
                    } else {
                        p.color("card")
                    })
                    .text_color(if user {
                        p.color("primary-foreground")
                    } else {
                        p.color("foreground")
                    });
                if group {
                    bubble =
                        bubble.child(div().text_sm().font_weight(FontWeight::MEDIUM).child(name));
                }
                bubble = bubble.child(
                    TextView::new(&body)
                        .selectable(true)
                        .text_size(ui(15.))
                        .line_height(ui(24.))
                        .motion(if partial {
                            TextViewMotion::default().with_stream_fade(Duration::from_millis(80))
                        } else {
                            TextViewMotion::default()
                        })
                        .on_link_click(|url, _, _, cx| {
                            if url.starts_with("https://") || url.starts_with("http://") {
                                cx.open_url(url);
                            }
                        }),
                );
                for artifact in rows(self.value(), "artifacts")
                    .iter()
                    .filter(|a| rows(&message, "artifact_ids").contains(&a["id"]))
                {
                    let artifact_id = text(artifact, "id").to_owned();
                    let name = text(artifact, "name").to_owned();
                    bubble = bubble.child(
                        button(
                            SharedString::from(format!("file:{artifact_id}")),
                            name,
                            ButtonKind::Outline,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.panel = Some(Panel::Library);
                            cx.notify();
                        })),
                    );
                }
                if let Ok(time) = PublicationTime::local(&at) {
                    bubble = bubble.child(div().flex().justify_end().child(
                        clock(&time, p).when(user, |clock| {
                            clock.text_color(p.color("primary-foreground").opacity(0.8))
                        }),
                    ));
                }
                if let Some(run) = rows(self.value(), "runs")
                    .iter()
                    .find(|r| {
                        r["input_message_id"] == message["id"]
                            && r["status"] == "queued"
                            && r["delivery"] == "pending"
                    })
                    .cloned()
                {
                    let edit = message.clone();
                    let delete = message.clone();
                    let mut controls = div()
                        .flex()
                        .gap_2()
                        .child(
                            button(
                                SharedString::from(format!("edit:{}", text(&message, "id"))),
                                "Edit",
                                ButtonKind::Ghost,
                                p,
                                cx,
                            )
                            .on_click(cx.listener(
                                move |this, _, window, cx| this.edit(edit.clone(), window, cx),
                            )),
                        )
                        .child(
                            button(
                                SharedString::from(format!("delete:{}", text(&message, "id"))),
                                "Delete",
                                ButtonKind::Ghost,
                                p,
                                cx,
                            )
                            .on_click(cx.listener(
                                move |this, _, window, cx| this.delete(delete.clone(), window, cx),
                            )),
                        );
                    if let Some(active) = rows(self.value(), "runs")
                        .iter()
                        .find(|r| {
                            r["status"] == "running"
                                && r["agent_id"] == run["agent_id"]
                                && !r["native_run_id"].is_null()
                        })
                        .cloned()
                    {
                        controls = controls.child(
                            button(
                                SharedString::from(format!("steer:{}", text(&message, "id"))),
                                "Use now",
                                ButtonKind::Ghost,
                                p,
                                cx,
                            )
                            .on_click(cx.listener(
                                move |this, _, window, cx| {
                                    this.steer(active.clone(), Some(run.clone()), window, cx)
                                },
                            )),
                        );
                    }
                    bubble = bubble.child(controls);
                }
                let avatar = if group && !user {
                    self.portraits
                        .get(&format!("message:{id}:{agent}"))
                        .map(|(_, a)| a.clone())
                } else {
                    None
                };
                div()
                    .flex()
                    .w_full()
                    .gap_2()
                    .when(user, |v| v.justify_end())
                    .when_some(avatar, |v, a| v.child(a))
                    .child(div().max_w(relative(0.8)).min_w_0().child(bubble))
                    .into_any_element()
            }
            RowKind::Interaction { key, agent } => {
                let key = key.clone();
                let agent = agent.clone();
                let card = self.interaction_views.get(&key).map(|c| c.view.clone());
                let name = self
                    .agents
                    .iter()
                    .find(|a| a["id"] == agent)
                    .map(|a| text(a, "name").to_owned())
                    .unwrap_or_default();
                let avatar = if group {
                    self.portraits
                        .get(&format!("message:{id}:{agent}"))
                        .map(|(_, a)| a.clone())
                } else {
                    None
                };
                div()
                    .flex()
                    .gap_2()
                    .when_some(avatar, |v, a| v.child(a))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .gap_1()
                            .flex_1()
                            .min_w_0()
                            .when(group, |v| v.child(div().text_sm().child(name)))
                            .when_some(card, |v, c| v.child(c)),
                    )
                    .into_any_element()
            }
            RowKind::Run(run) => {
                let run = run.clone();
                let status = text(&run, "status");
                let pending = matches!(status, "running" | "dispatching");
                let waiting = rows(&run, "native_interactions")
                    .iter()
                    .any(|r| r["observed_state"] == "pending")
                    || rows(self.value(), "human_requests")
                        .iter()
                        .any(|r| r["source_run_id"] == run["id"] && r["state"] == "pending");
                let label = if waiting {
                    ActivityKind::Waiting.label()
                } else {
                    match status {
                        "queued" => "Queued",
                        "cancel_requested" => "Stop requested · waiting for confirmation",
                        "cancelled" if run["cancellation"] == "confirmed" => "Stopped.",
                        "unknown" => "Outcome unknown · checking before continuing",
                        "failed" => "Could not finish this request",
                        "dispatching" => "Getting ready…",
                        _ => match rows(&run, "active_tools").first().map(|t| text(t, "kind")) {
                            Some("reading") => ActivityKind::Reading.label(),
                            Some("searching") => ActivityKind::Searching.label(),
                            Some(_) => ActivityKind::Working.label(),
                            None => ActivityKind::Thinking.label(),
                        },
                    }
                };
                let agent = text(&run, "agent_id").to_owned();
                let name = self
                    .agents
                    .iter()
                    .find(|a| a["id"] == agent)
                    .map(|a| text(a, "name").to_owned())
                    .unwrap_or_default();
                let avatar = self
                    .portraits
                    .get(&format!("message:{id}:{agent}"))
                    .map(|(_, a)| a.clone());
                let mut card = div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .p_3()
                    .rounded_lg()
                    .bg(p.color("card"))
                    .when(group, |v| v.child(div().text_sm().child(name)));
                card = if pending && !waiting {
                    card.child(
                        ShimmerText::new(label)
                            .id(SharedString::from(format!("activity:{}", text(&run, "id")))),
                    )
                } else {
                    card.child(label)
                };

                if matches!(status, "running" | "dispatching" | "queued") {
                    let stop = run.clone();
                    card = card.child(
                        button(
                            SharedString::from(format!("stop:{}", text(&run, "id"))),
                            "Stop run",
                            ButtonKind::Ghost,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.run_command(stop.clone(), "cancel", window, cx)
                            },
                        )),
                    );
                }
                if run["retry_allowed"] == true {
                    let retry = run.clone();
                    card = card.child(
                        button(
                            SharedString::from(format!("retry:{}", text(&run, "id"))),
                            "Retry exact input",
                            ButtonKind::Outline,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.run_command(retry.clone(), "retry", window, cx)
                            },
                        )),
                    );
                }
                if status == "unknown" {
                    let reconcile = run.clone();
                    card = card.child(
                        button(
                            SharedString::from(format!("reconcile:{}", text(&run, "id"))),
                            "Check outcome",
                            ButtonKind::Outline,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.run_command(reconcile.clone(), "reconcile", window, cx)
                            },
                        )),
                    );
                }
                if run["preparation"]["state"] == "blocked" {
                    let retry = run.clone();
                    card = card.child(
                        button(
                            SharedString::from(format!("prepare:{}", text(&run, "id"))),
                            "Retry preparation",
                            ButtonKind::Outline,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.run_command(retry.clone(), "retry-preparation", window, cx)
                            },
                        )),
                    );
                }
                div()
                    .flex()
                    .gap_2()
                    .when_some(if group { avatar } else { None }, |v, a| v.child(a))
                    .child(card)
                    .into_any_element()
            }
            RowKind::Route(route) => {
                let route = route.clone();
                let name = self.value()["thread"]["name"].as_str().unwrap_or("Group");
                let label = match text(&route, "state") {
                    "unknown" => "I couldn’t confirm who should reply.",
                    "rejected" => "No member could start this request.",
                    _ => match text(&route["execution"], "stage") {
                        "blocked" => "I couldn’t get started.",
                        "retrying" => "Reconnecting…",
                        _ => "Finding the right person to help…",
                    },
                };
                let mut card = div()
                    .flex()
                    .flex_col()
                    .gap_2()
                    .p_3()
                    .rounded_lg()
                    .bg(p.color("card"))
                    .child(
                        div()
                            .text_sm()
                            .font_weight(FontWeight::MEDIUM)
                            .child(name.to_owned()),
                    )
                    .child(label);

                if route["state"] == "rejected" {
                    let retry = route.clone();
                    card = card.child(
                        button(
                            SharedString::from(format!("route-retry:{}", text(&route, "id"))),
                            "Retry routing",
                            ButtonKind::Outline,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                let id = text(&retry, "id");
                                let thread = text(&retry, "thread_id");
                                this.dispatch(
                                    format!("route:{id}"),
                                    crate::storage::Operation::command(
                                        format!("/v1/groups/{thread}/routes/{id}/retry"),
                                        serde_json::json!({"expected_revision":retry["revision"]}),
                                        this.selected,
                                    ),
                                    window,
                                    cx,
                                );
                            },
                        )),
                    )
                }
                if route["execution"]["retry_preparation"] == true {
                    let run = serde_json::json!({"id":route["execution"]["run_id"],"revision":route["execution"]["run_revision"]});
                    card = card.child(
                        button(
                            SharedString::from(format!("route-preparation:{}", text(&route, "id"))),
                            "Retry preparation",
                            ButtonKind::Outline,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.run_command(run.clone(), "retry-preparation", window, cx)
                            },
                        )),
                    );
                }
                card.into_any_element()
            }
            RowKind::Bar(part) => {
                let actors = rows(part, "actors")
                    .iter()
                    .map(|a| text(a, "name"))
                    .collect::<Vec<_>>()
                    .join(" · ");
                let event = if part["kind"] == "handoff_failed" {
                    "Could not hand off this step".into()
                } else {
                    format!(
                        "{} · {}",
                        text(part, "name"),
                        text(part, "kind").replace('_', " ")
                    )
                };
                div()
                    .flex()
                    .justify_center()
                    .text_sm()
                    .text_color(p.color("muted-foreground"))
                    .child(format!("{actors}  {event}"))
                    .into_any_element()
            }
        };
        let _ = window;
        container.child(content).into_any_element()
    }
}
fn push_message(
    result: &mut Vec<TranscriptRow>,
    previous: &mut BTreeMap<String, TranscriptRow>,
    message: &Value,
    content: &str,
    start: usize,
    at: &str,
    cx: &mut Context<Workspace>,
) {
    let id = format!("message:{}:{start}", text(message, "id"));
    let body = if let Some(TranscriptRow {
        kind: RowKind::Message {
            body, content: old, ..
        },
        ..
    }) = previous.remove(&id)
    {
        if old != content {
            body.update(cx, |body, cx| body.set_text(content, cx));
        }
        body
    } else {
        cx.new(|cx| TextViewState::markdown(content, cx))
    };
    result.push(TranscriptRow {
        id,
        at: at.into(),
        starts_day: false,
        kind: RowKind::Message {
            message: message.clone(),
            body,
            content: content.into(),
        },
    });
}
use gpui_kit::prelude::FluentBuilder as _;
