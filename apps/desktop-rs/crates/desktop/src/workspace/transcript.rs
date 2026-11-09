use super::*;
use crate::{
    models::{activity, message::PublicationTime},
    ui::{
        controls::*,
        message::{clock, day_marker},
        theme::{Palette, agent_bubble, ui},
    },
};
use gpui_kit::base::{
    TestSupportExt,
    text::{TextView, TextViewStyle},
};
use gpui_kit::component::{
    shimmer::ShimmerText,
    text::{TextViewMotion, TextViewState},
};
use ngertiin_client::{rows, text};
use sha2::{Digest, Sha256};
use std::time::Duration;

pub(super) enum RowKind {
    Message {
        message: Value,
        body: Entity<TextViewState>,
        content: String,
        markup: Box<gpui_kit::component::text::MarkdownExtensions>,
        sources: Vec<String>,
        tables: BTreeMap<usize, Entity<crate::ui::table::RichTable>>,
        tail: bool,
    },
    Interaction {
        key: String,
        agent: String,
    },
    Run(Value),
    Computer(Value),
    Sources(Value),
    Route(Value),
    Milestones(Vec<Value>),
}
pub(super) struct TranscriptRow {
    pub id: String,
    pub at: String,
    pub starts_day: bool,
    pub kind: RowKind,
}
impl TranscriptRow {
    // Entity revisions and the actual displayed slice are distinct: one message
    // can span several rows around an interaction boundary.
    fn layout_revision(&self) -> Option<u64> {
        use std::hash::{Hash, Hasher};
        let RowKind::Message {
            message,
            content,
            sources,
            tail,
            ..
        } = &self.kind
        else {
            return None;
        };
        let mut hash = std::collections::hash_map::DefaultHasher::new();
        self.at.hash(&mut hash);
        self.starts_day.hash(&mut hash);
        message["revision"].as_u64().hash(&mut hash);
        content.hash(&mut hash);
        sources.hash(&mut hash);
        tail.hash(&mut hash);
        Some(hash.finish())
    }
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
    fn grouped_avatar(&self, row: &str, agent: &str, cx: &mut Context<Self>) -> Option<AnyElement> {
        if self.value()["thread"]["type"] != "group" {
            return None;
        }
        let portrait = self.portrait(&format!("message:{row}:{agent}"));
        let name = self
            .agents
            .iter()
            .find(|value| value["id"] == agent)
            .map(|value| text(value, "name"))
            .unwrap_or("Agent");
        let target = agent.to_owned();
        let p = Palette::new(self.store.dark());
        Some(
            button(
                SharedString::from(format!("message-profile:{row}")),
                "",
                ButtonKind::Ghost,
                p,
                cx,
            )
            .accessibility_label(format!("Open {name}’s profile"))
            .size(ui(32.))
            .flex_shrink_0()
            .p_0()
            .rounded_full()
            .child(
                portrait
                    .map(IntoElement::into_any_element)
                    .unwrap_or_else(|| super::loading::avatar_placeholder(cx)),
            )
            .on_click(
                cx.listener(move |this, _, window, cx| {
                    this.show_member(target.clone(), window, cx)
                }),
            )
            .into_any_element(),
        )
    }
    pub(super) fn rebuild_transcript(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let previous_layouts: BTreeMap<_, _> = self
            .conversation
            .transcript
            .iter()
            .map(|row| (row.id.clone(), row.layout_revision()))
            .collect();
        let mut previous: BTreeMap<_, _> = self
            .conversation
            .transcript
            .drain(..)
            .map(|row| (row.id.clone(), row))
            .collect();
        // Preserve presentation order separately from the lookup map.
        let old_count = self.conversation.scroller.read(cx).item_count();
        let value = self.value().clone();
        let mut parts: Vec<_> = self.conversation.parts.values().cloned().collect();
        parts.sort_by_key(|p| p["sequence"].as_u64().unwrap_or(0));
        let mut result = vec![];
        let mut placed = std::collections::BTreeSet::new();
        let superseded: Vec<_> = rows(&value, "runs")
            .iter()
            .filter(|r| !r["retried_by_run_id"].is_null())
            .map(|r| r["id"].clone())
            .collect();
        let mut batch_allowed = true;
        for part in parts {
            if part["kind"] == "handoff_requested" {
                batch_allowed = false;
                continue;
            }
            if part["kind"] != "message" {
                if batch_allowed
                    && let Some(TranscriptRow {
                        kind: RowKind::Milestones(parts),
                        ..
                    }) = result.last_mut()
                    && super::timeline::batchable(parts, &part)
                {
                    parts.push(part);
                    continue;
                }
                batch_allowed = true;
                result.push(TranscriptRow {
                    id: text(&part, "id").into(),
                    at: text(&part, "created_at").into(),
                    starts_day: false,
                    kind: RowKind::Milestones(vec![part]),
                });
                continue;
            }
            batch_allowed = false;
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
                    if let Some(card) = self.conversation.interaction_views.get(&key) {
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
                    self.conversation
                        .native
                        .get(text(run, "id"))
                        .unwrap_or(&Value::Null),
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
                    for (key, card) in
                        self.conversation
                            .interaction_views
                            .iter()
                            .filter(|(key, _)| {
                                self.interaction_visible(key)
                                    && (*key == &prefix || key.starts_with(&format!("{prefix}:")))
                            })
                    {
                        anchors.push((
                            offset,
                            key.clone(),
                            card.at.clone(),
                            text(run, "agent_id").to_owned(),
                            match &card.binding {
                                super::interactions::Binding::Question {
                                    request,
                                    question,
                                    ..
                                } => rows(request, "questions")
                                    .iter()
                                    .position(|item| item["id"] == *question)
                                    .unwrap_or(0),
                                _ => 0,
                            },
                        ));
                    }
                }
            }
            anchors.sort_by(|a, b| {
                a.0.cmp(&b.0)
                    .then(a.2.cmp(&b.2))
                    .then(a.4.cmp(&b.4))
                    .then(a.1.cmp(&b.1))
            });
            let sources: Vec<String> = rows(&value, "runs")
                .iter()
                .find(|run| run["id"] == message["run_id"])
                .map(|run| {
                    rows(run, "sources")
                        .iter()
                        .map(|source| text(source, "url").to_owned())
                        .collect()
                })
                .unwrap_or_default();
            let content = text(message, "text");
            let mut start = 0;
            let mut at = text(&part, "created_at").to_owned();
            for (offset, key, card_at, agent, _) in anchors {
                if offset > start {
                    push_message(
                        &mut result,
                        &mut previous,
                        message,
                        &content[start..offset],
                        MessageSlice {
                            start,
                            at: &at,
                            sources: &sources,
                        },
                        window,
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
                    MessageSlice {
                        start,
                        at: &at,
                        sources: &sources,
                    },
                    window,
                    cx,
                );
            }
        }
        for (key, card) in &self.conversation.interaction_views {
            if placed.contains(key) || !self.interaction_visible(key) {
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
            if !activity::visible(run, &value) {
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
                    kind: if run["computer_activity"].is_object() {
                        RowKind::Computer(run.clone())
                    } else {
                        RowKind::Run(run.clone())
                    },
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
        for run in rows(&value, "runs").iter().filter(|run| {
            !crate::models::content::research_sources(rows(run, "sources")).is_empty()
        }) {
            if let Some(anchor) = result.iter().rposition(|row| matches!(&row.kind,RowKind::Message { message,.. } if message["run_id"] == run["id"] && message["author"] == "agent")) {
                let at=result[anchor].at.clone();
                result.insert(anchor+1,TranscriptRow { id:format!("sources:{}",text(run,"id")),at,starts_day:false,kind:RowKind::Sources(run.clone()) });
            }
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
        self.conversation.scroller.update(cx, |state, cx| {
            if old_count != original_ids.len() {
                state.reset(result.len(), cx);
            } else {
                if prefix + suffix != old_count || old_count != result.len() {
                    state.splice(
                        prefix..old_count - suffix,
                        result.len() - prefix - suffix,
                        cx,
                    );
                }
                for (ix, row) in result.iter().enumerate() {
                    let revision = row.layout_revision();
                    if revision.is_none() || previous_layouts.get(&row.id) != Some(&revision) {
                        state.remeasure_items(ix..ix + 1, cx);
                    }
                }
            }
        });
        self.conversation.transcript = result;
        self.conversation.order = new_ids;
    }
    fn row_order(&self) -> Vec<String> {
        self.conversation.order.clone()
    }
    pub(super) fn transcript_row(
        &mut self,
        ix: usize,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let Some(row) = self.conversation.transcript.get(ix) else {
            return div().into_any_element();
        };
        let at = row.at.clone();
        let day = row.starts_day;
        let id = row.id.clone();
        let group = self.value()["thread"]["type"] == "group";
        let plain = |message: &Value| {
            rows(message, "artifact_ids").is_empty()
                && !rows(self.value(), "human_requests")
                    .iter()
                    .any(|request| request["message_id"] == message["id"])
                && !self.conversation.native.values().any(|history| {
                    rows(history, "records")
                        .iter()
                        .any(|record| record["anchor_message_id"] == message["id"])
                })
                && !rows(self.value(), "runs").iter().any(|run| {
                    run["input_message_id"] == message["id"]
                        && (run["status"] != "succeeded"
                            || !rows(run, "native_tools").is_empty()
                            || !rows(run, "product_tools").is_empty())
                })
        };
        let joins = |upper: &TranscriptRow, lower: &TranscriptRow| match (&upper.kind, &lower.kind)
        {
            (RowKind::Message { message: a, .. }, RowKind::Message { message: b, .. }) => {
                !lower.starts_day
                    && a["id"] != b["id"]
                    && a["author"] == b["author"]
                    && a["author_agent_id"] == b["author_agent_id"]
                    && plain(a)
                    && plain(b)
            }
            _ => false,
        };
        let join_above = ix
            .checked_sub(1)
            .and_then(|index| self.conversation.transcript.get(index))
            .is_some_and(|previous| joins(previous, row));
        let join_below = self
            .conversation
            .transcript
            .get(ix + 1)
            .is_some_and(|next| joins(row, next));
        let same_message_above = ix.checked_sub(1).and_then(|index|self.conversation.transcript.get(index)).is_some_and(|previous| matches!((&previous.kind,&row.kind),(RowKind::Message {message:a,..},RowKind::Message {message:b,..}) if a["id"] == b["id"]));
        let mut container = div()
            .id(SharedString::from(id.clone()))
            .w_full()
            .flex()
            .flex_col()
            .px(ui(20.))
            .gap(ui(0.))
            .when(join_above || same_message_above, |view| view.mt(-ui(12.)));
        if day && let Ok(time) = PublicationTime::local(&at) {
            container = container.child(day_marker(&time.day_label, p));
        }
        let content = match &row.kind {
            RowKind::Message {
                message,
                body,
                markup,
                tail,
                content,
                ..
            } => {
                let tail = *tail;
                let message = message.clone();
                let body = body.clone();
                let user = message["author"] == "user";
                let agent = text(&message, "author_agent_id").to_owned();
                let partial = message["state"] == "partial";
                let markup = markup.as_ref().clone();
                let copy_content = content.clone();
                let mut bubble = div()
                    .id(SharedString::from(format!("bubble:{id}")))
                    .test_support()
                    .relative()
                    .flex()
                    .flex_col()
                    .min_w_0()
                    .max_w_full()
                    .whitespace_normal()
                    .gap(ui(0.))
                    .px(ui(12.))
                    .py(ui(7.))
                    .rounded(ui(18.))
                    .when(join_above, |view| {
                        if user {
                            view.rounded_tr(ui(6.))
                        } else {
                            view.rounded_tl(ui(6.))
                        }
                    })
                    .when(join_below, |view| {
                        if user {
                            view.rounded_br(ui(6.))
                        } else {
                            view.rounded_bl(ui(6.))
                        }
                    })
                    .font_weight(FontWeight::NORMAL)
                    .text_size(ui(15.))
                    .line_height(ui(22.))
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
                bubble = bubble.child(
                    TextView::new(&body)
                        .min_w_0()
                        .max_w_full()
                        .markdown_extensions(markup)
                        .selectable(true)
                        .text_color(p.color(if user {
                            "primary-foreground"
                        } else {
                            "foreground"
                        }))
                        .style(
                            TextViewStyle::from_theme(&gpui_kit::base::Theme::global(cx))
                                .with_foreground(p.color(if user {
                                    "primary-foreground"
                                } else {
                                    "foreground"
                                }))
                                .with_paragraph_gap(ui(10.))
                                .with_border(p.color("border").opacity(0.4))
                                .with_heading(|_| {
                                    StyleRefinement::default()
                                        .text_size(ui(15.))
                                        .line_height(ui(22.))
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .pt_0()
                                        .pb(ui(10.))
                                })
                                .with_table(
                                    StyleRefinement::default()
                                        .w_full()
                                        .rounded(ui(20.))
                                        .bg(p.color("popover")),
                                )
                                .with_table_head(
                                    StyleRefinement::default()
                                        .font_weight(FontWeight::SEMIBOLD)
                                        .bg(p.color("popover")),
                                )
                                .with_table_cell(
                                    StyleRefinement::default()
                                        .text_size(ui(14.))
                                        .line_height(ui(20.))
                                        .px(ui(16.))
                                        .py(ui(10.))
                                        .border_0()
                                        .border_color(gpui_kit::transparent_black()),
                                ),
                        )
                        .text_size(ui(15.))
                        .line_height(ui(22.))
                        .motion(if partial {
                            TextViewMotion::default().with_stream_fade(Duration::from_millis(80))
                        } else {
                            TextViewMotion::default()
                        })
                        .on_link_click({
                            let weak = cx.entity().downgrade();
                            move |url, _, window, cx| {
                                let _ = weak.update(cx, |this, cx| {
                                    this.message_link(url.as_ref(), window, cx)
                                });
                            }
                        }),
                );
                let mut attachments = div().flex().flex_col().items_start().gap(ui(6.));
                let has_text = !content.trim().is_empty();
                for artifact in rows(self.value(), "artifacts")
                    .iter()
                    .filter(|a| tail && rows(&message, "artifact_ids").contains(&a["id"]))
                {
                    let artifact_id = text(artifact, "id").to_owned();
                    let name = text(artifact, "name").to_owned();
                    let artifact = artifact.clone();
                    let attachment = button(
                        SharedString::from(format!("file:{artifact_id}")),
                        "",
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .accessibility_label(format!("Open {name}"))
                    .h(ui(24.))
                    .w_auto()
                    .min_w_0()
                    .max_w_full()
                    .self_start()
                    .px(ui(7.))
                    .py_0()
                    .rounded_full()
                    .bg(p.color("popover"))
                    .child(
                        div()
                            .min_w_0()
                            .flex()
                            .items_center()
                            .max_w_full()
                            .gap(ui(4.))
                            .child(context::file_icon_sized(&name, false, false, p.dark, 14.))
                            .child(
                                div()
                                    .min_w_0()
                                    .max_w(ui(192.))
                                    .truncate()
                                    .text_size(ui(12.))
                                    .child(name),
                            )
                            .child(crate::ui::workspace::glyph("ArrowUpRight01Icon", 10., p)),
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.open_artifact(artifact.clone(), window, cx)
                    }));
                    if user {
                        bubble = bubble.child(attachment);
                    } else {
                        attachments = attachments.child(attachment);
                    }
                }
                if text(&message, "text").trim().is_empty() {
                    bubble = bubble.bg(gpui_kit::rgba(0)).px_0().py_0().max_w_full();
                }
                if let Ok(time) = PublicationTime::local(&at) {
                    let clock =
                        div()
                            .flex()
                            .justify_end()
                            .child(clock(&time, p).when(user, |clock| {
                                clock.text_color(p.color("primary-foreground"))
                            }));
                    if has_text || user {
                        bubble = bubble.child(clock);
                    } else {
                        attachments = attachments.child(clock);
                    }
                }
                let avatar = if group && !user {
                    self.grouped_avatar(&id, &agent, cx)
                } else {
                    None
                };
                let mut copy = Some(
                    button(
                        SharedString::from(format!("copy:{id}")),
                        "",
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .accessibility_label("Copy message")
                    .size(ui(24.))
                    .p_0()
                    .flex_shrink_0()
                    .self_center()
                    .child(crate::ui::workspace::glyph("Copy01Icon", 14., p))
                    .disabled_state(copy_content.trim().is_empty(), p)
                    .opacity(0.)
                    .group_hover(
                        SharedString::from(format!("message-actions:{id}")),
                        |style| style.opacity(1.),
                    )
                    .focus_visible(|style| style.opacity(1.))
                    .on_click(move |_, _, cx| {
                        cx.write_to_clipboard(ClipboardItem::new_string(copy_content.clone()))
                    })
                    .into_any_element(),
                );
                div()
                    .flex()
                    .w_full()
                    .gap_2()
                    .when(user, |v| v.justify_end())
                    .when_some(avatar, |view, portrait| view.child(portrait))
                    .child(
                        div()
                            .group(SharedString::from(format!("message-actions:{id}")))
                            .max_w(relative(0.8))
                            .min_w_0()
                            .flex()
                            .gap_2()
                            .children(if user { copy.take() } else { None })
                            .child(
                                div()
                                    .min_w_0()
                                    .max_w_full()
                                    .flex()
                                    .flex_col()
                                    .items_start()
                                    .gap(ui(6.))
                                    .when(has_text || user, |view| view.child(bubble))
                                    .when(!user && tail, |view| view.child(attachments)),
                            )
                            .children(copy),
                    )
                    .into_any_element()
            }
            RowKind::Interaction { key, agent } => {
                let key = key.clone();
                let agent = agent.clone();
                let card = self
                    .conversation
                    .interaction_views
                    .get(&key)
                    .map(|c| c.view.clone());
                let avatar = self.grouped_avatar(&id, &agent, cx);
                div()
                    .flex()
                    .gap_2()
                    .when_some(avatar, |v, a| v.child(a))
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .items_start()
                            .gap_1()
                            .flex_1()
                            .min_w_0()
                            .when_some(card, |v, c| v.child(c)),
                    )
                    .into_any_element()
            }
            RowKind::Run(run) => {
                let run = run.clone();
                let status = text(&run, "status");
                let target = rows(&run, "active_tools")
                    .last()
                    .and_then(|tool| {
                        self.agents
                            .iter()
                            .find(|agent| agent["id"] == tool["target_agent_id"])
                    })
                    .map(|agent| text(agent, "name"));
                let label = activity::label(&run, self.checked, target);
                let agent = text(&run, "agent_id").to_owned();
                let avatar = self.grouped_avatar(&id, &agent, cx);
                let mut card = div()
                    .id(SharedString::from(format!(
                        "run-status:{}",
                        text(&run, "id")
                    )))
                    .role(Role::Status)
                    .aria_label(label.clone())
                    .test_support()
                    .min_w_0()
                    .max_w(ui(448.))
                    .flex()
                    .flex_col()
                    .gap(ui(3.))
                    .px(ui(13.))
                    .pt(ui(9.))
                    .pb(ui(10.))
                    .rounded(ui(14.))
                    .text_size(ui(14.))
                    .line_height(ui(21.))
                    .text_color(p.color(
                        if status == "failed" || run["preparation"]["state"] == "blocked" {
                            "destructive"
                        } else {
                            "muted-foreground"
                        },
                    ))
                    .bg(p.color("card"));
                card = if activity::loading(&run, self.checked) {
                    card.child(
                        ShimmerText::new(label)
                            .id(SharedString::from(format!("activity:{}", text(&run, "id")))),
                    )
                } else {
                    card.child(label)
                };

                if run["diagnostic"].is_object()
                    && (status == "failed" || run["preparation"]["state"] == "blocked")
                {
                    let guidance = activity::guidance(text(&run["diagnostic"], "code"));
                    card = card.child(
                        caption(guidance, p)
                            .id("activity-guidance")
                            .role(Role::Status)
                            .aria_label(guidance)
                            .test_support(),
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
                        .disabled_state(self.busy || !self.checked, p)
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
                            "Check status",
                            ButtonKind::Outline,
                            p,
                            cx,
                        )
                        .disabled_state(self.busy || !self.checked, p)
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
                        .disabled_state(self.busy || !self.checked, p)
                        .on_click(cx.listener(
                            move |this, _, window, cx| {
                                this.run_command(retry.clone(), "retry-preparation", window, cx)
                            },
                        )),
                    );
                }
                if run["preparation"]["state"] == "blocked"
                    || run["diagnostic"].is_object()
                        && !matches!(status, "succeeded" | "cancelled" | "unknown")
                        && run["diagnostic"]["outcome"] != "not_dispatched"
                {
                    card = card.child(
                        button(
                            SharedString::from(format!("activity-settings:{}", text(&run, "id"))),
                            "Open settings",
                            ButtonKind::Ghost,
                            p,
                            cx,
                        )
                        .on_click(
                            cx.listener(|this, _, window, cx| this.open_settings(window, cx)),
                        ),
                    );
                }
                if let Ok(time) = PublicationTime::local(&at) {
                    card = card.child(clock(&time, p));
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
                let stage = text(&route["execution"], "stage");
                let loading =
                    route["state"] == "pending" && !matches!(stage, "blocked" | "reconcile");
                let label = if route["state"] == "rejected" {
                    route["clarification"]
                        .as_str()
                        .filter(|text| !text.trim().is_empty())
                        .unwrap_or_else(|| activity::routing_label(&route))
                } else {
                    activity::routing_label(&route)
                };
                let mut card = div()
                    .id("group-routing-status")
                    .role(Role::Status)
                    .aria_label(format!("{name}: {label}"))
                    .flex()
                    .flex_col()
                    .min_w_0()
                    .max_w(ui(448.))
                    .gap(ui(3.))
                    .px(ui(13.))
                    .pt(ui(9.))
                    .pb(ui(10.))
                    .rounded(ui(14.))
                    .text_size(ui(14.))
                    .line_height(ui(21.))
                    .text_color(p.color("muted-foreground"))
                    .bg(p.color("card"));
                card =
                    if loading {
                        card.child(ShimmerText::new(label.to_owned()).id(SharedString::from(
                            format!("routing:{}", text(&route, "id")),
                        )))
                    } else {
                        card.child(label.to_owned())
                    };

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
                if stage == "blocked" {
                    card = card.child(caption(
                        activity::guidance(text(&route["execution"]["diagnostic"], "code")),
                        p,
                    ));
                }
                if let Ok(time) = PublicationTime::local(&at) {
                    card = card.child(clock(&time, p));
                }
                div()
                    .flex()
                    .items_start()
                    .gap(ui(9.))
                    .when(group, |row| {
                        row.child(self.thread_portrait(&self.value()["thread"], "route", cx))
                    })
                    .child(card.test_support())
                    .into_any_element()
            }
            RowKind::Computer(run) => {
                let run = run.clone();
                let preview = self.panel != Some(Panel::Computer);
                let agent = text(&run, "agent_id");
                let avatar = self.grouped_avatar(&id, agent, cx);
                let card = self
                    .computer
                    .update(cx, |computer, cx| computer.activity_view(&run, preview, cx));
                div()
                    .w_full()
                    .flex()
                    .gap(ui(9.))
                    .when_some(avatar, |view, avatar| view.child(avatar))
                    .child(card)
                    .into_any_element()
            }
            RowKind::Sources(run) => {
                let run_id = text(run, "id").to_owned();
                let sources = crate::models::content::research_sources(rows(run, "sources"));
                let expanded = self.conversation.source_expanded.contains(&run_id);
                let mut view = div()
                    .flex()
                    .flex_col()
                    .items_start()
                    .gap(ui(6.))
                    .max_w(ui(460.));
                view = view.child(
                    button(
                        SharedString::from(format!("source-toggle:{run_id}")),
                        "",
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .accessibility_label(format!("{} sumber riset", sources.len()))
                    .h(ui(28.))
                    .px(ui(2.))
                    .justify_start()
                    .child({
                        let mut stack = div().flex().items_center();
                        for (index, source) in sources.iter().take(3).enumerate() {
                            stack = stack.child(
                                div()
                                    .size(ui(23.))
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .rounded_full()
                                    .border_1()
                                    .border_color(p.color("panel"))
                                    .bg(p.color("secondary"))
                                    .text_size(ui(10.))
                                    .font_weight(FontWeight::SEMIBOLD)
                                    .when(index > 0, |view| view.ml(-ui(4.)))
                                    .child(
                                        crate::models::content::source_domain(text(source, "url"))
                                            .chars()
                                            .next()
                                            .unwrap_or(' ')
                                            .to_uppercase()
                                            .to_string(),
                                    ),
                            );
                        }
                        stack
                    })
                    .child(caption(format!("{} sumber", sources.len()), p))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if !this.conversation.source_expanded.remove(&run_id) {
                            this.conversation.source_expanded.insert(run_id.clone());
                        }
                        cx.notify();
                    })),
                );
                if expanded {
                    for source in sources {
                        let url = text(source, "url").to_owned();
                        if !crate::host::is_external_url(&url) {
                            continue;
                        }
                        view = view.child(
                            button(
                                SharedString::from(format!("source:{url}")),
                                "",
                                ButtonKind::Ghost,
                                p,
                                cx,
                            )
                            .accessibility_label(text(source, "title").to_owned())
                            .w_full()
                            .h_auto()
                            .py(ui(6.))
                            .child(
                                div()
                                    .w_full()
                                    .min_w_0()
                                    .text_left()
                                    .text_size(ui(13.))
                                    .child(caption(crate::models::content::source_domain(&url), p))
                                    .child(text(source, "title").to_owned()),
                            )
                            .on_click(move |_, _, cx| cx.open_url(&url)),
                        );
                    }
                }
                view.into_any_element()
            }
            RowKind::Milestones(parts) => self.timeline_view(&id, parts, cx),
        };
        let _ = window;
        container.child(content).test_support().into_any_element()
    }
}
struct MessageSlice<'a> {
    start: usize,
    at: &'a str,
    sources: &'a [String],
}
fn push_message(
    result: &mut Vec<TranscriptRow>,
    previous: &mut BTreeMap<String, TranscriptRow>,
    message: &Value,
    content: &str,
    slice: MessageSlice<'_>,
    window: &mut Window,
    cx: &mut Context<Workspace>,
) {
    if content.trim().is_empty() && rows(message, "artifact_ids").is_empty() {
        return;
    }
    let source = content;
    let display = if message["author"] == "user" {
        crate::models::content::literal_markdown(source)
    } else {
        source.to_owned()
    };
    let start = slice.start;
    let tail = slice.start + source.len() == text(message, "text").len();
    let id = format!("message:{}:{start}", text(message, "id"));
    let retained = previous.remove(&id);
    let (body, old_tables, retained_markup) = match retained.map(|row| row.kind) {
        Some(RowKind::Message {
            message: old_message,
            body,
            content: old,
            tables,
            markup,
            sources,
            ..
        }) => {
            let unchanged = old == source && sources == slice.sources;
            let settled = old_message["state"] == "partial" && message["state"] != "partial";
            let body = if settled {
                // Commit the authoritative final snapshot in one parse. An
                // in-flight incremental parse must not leave a closed code
                // fence or trailing paragraph behind the completed clock.
                cx.new(|cx| TextViewState::markdown(&display, cx))
            } else {
                if old != source {
                    body.update(cx, |body, cx| body.set_text(&display, cx));
                }
                body
            };
            (body, tables, unchanged.then_some(markup))
        }
        _ => (
            cx.new(|cx| TextViewState::markdown(&display, cx)),
            BTreeMap::new(),
            None,
        ),
    };
    let (tables, markup) = if let Some(markup) = retained_markup {
        (old_tables, markup)
    } else {
        let tables =
            super::message_markup::prepare_tables(old_tables, &display, slice.sources, window, cx);
        let markup = super::message_markup::extensions(
            cx.entity().downgrade(),
            id.clone(),
            slice.sources.to_vec(),
            tables.clone(),
        );
        (tables, markup)
    };
    result.push(TranscriptRow {
        id,
        at: slice.at.into(),
        starts_day: false,
        kind: RowKind::Message {
            message: message.clone(),
            body,
            content: source.into(),
            markup,
            sources: slice.sources.to_vec(),
            tables,
            tail,
        },
    });
}

use gpui_kit::prelude::FluentBuilder as _;
