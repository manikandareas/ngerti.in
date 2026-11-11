//! Retained presentation ownership, adapted from Zed's ConversationView/AgentPanel.
//! The backend remains authoritative; these projections are disposable read copies.
use super::scroll::{ScrollChanged, TranscriptScroll};
use super::*;
use crate::storage::ReadingPosition;
use ngertiin_client::{rows, text};
use std::collections::{BTreeMap, BTreeSet};

const MAX_IDLE_THREADS: usize = 8;

pub(super) struct ThreadState {
    pub(super) portraits: BTreeMap<String, (Value, Entity<AvatarPortrait>)>,
    pub(super) avatar_activity: BTreeMap<String, (bool, bool)>,
    pub(super) projection: Option<Conversation>,
    pub(super) opening: Value,
    pub(super) native: BTreeMap<String, Value>,
    pub(super) interaction_views: BTreeMap<String, interactions::BoundInteraction>,
    pub(super) question_steps: BTreeMap<String, usize>,
    pub(super) source_expanded: BTreeSet<String>,
    pub(super) timeline_expanded: BTreeSet<String>,
    pub(super) wrapped_code: BTreeSet<String>,
    pub(super) composer: Entity<Composer>,
    pub(super) find: Entity<thread_search::ThreadSearch>,
    pub(super) composer_height: Pixels,
    pub(super) editing: Option<Value>,
    pub(super) queue_expanded: bool,
    pub(super) scroller: Entity<TranscriptScroll>,
    pub(super) transcript: Vec<transcript::TranscriptRow>,
    pub(super) order: Vec<String>,
    pub(super) parts: BTreeMap<String, Value>,
    pub(super) history_before: Option<u64>,
    history_gaps: Vec<HistoryGap>,
    pub(super) reconciling: bool,
    pub(super) restore_reading: Option<ReadingPosition>,
    acknowledged_draft: Option<String>,
    notice: Option<String>,
    _subscriptions: Vec<Subscription>,
}
struct HistoryGap {
    before: u64,
    through: u64,
}
impl ThreadState {
    pub(super) fn retain_timeline(&mut self, timeline: &Value) {
        let next_before = timeline["next_before"].as_u64();
        if self.projection.is_none() || self.parts.is_empty() {
            self.history_before = next_before;
        } else if let (Some(before), Some(newest)) = (
            next_before,
            self.parts
                .values()
                .filter_map(|p| p["sequence"].as_u64())
                .max(),
        ) && rows(timeline, "parts")
            .iter()
            .filter_map(|p| p["sequence"].as_u64())
            .min()
            .is_some_and(|oldest| oldest > newest)
        {
            // Sequence numbers are owner-wide. Disjoint pages need a backend
            // overlap, rather than assuming consecutive thread sequences.
            self.history_gaps.push(HistoryGap {
                before,
                through: newest,
            });
        }
        self.merge_timeline_parts(timeline);
    }
    fn merge_timeline_parts(&mut self, timeline: &Value) {
        for part in rows(timeline, "parts") {
            self.parts.insert(text(part, "id").into(), part.clone());
        }
    }
    pub(super) fn earlier_cursor(&self) -> Option<u64> {
        self.history_gaps
            .last()
            .map(|gap| gap.before)
            .or(self.history_before)
    }
    pub(super) fn needs_history_recovery(&self) -> bool {
        !self.history_gaps.is_empty()
            || self.restore_reading.is_some() && self.history_before.is_some()
    }
    pub(super) fn retain_earlier(&mut self, timeline: &Value) {
        let next = timeline["next_before"].as_u64();
        if let Some(gap) = self.history_gaps.last_mut() {
            if next.is_none()
                || rows(timeline, "parts")
                    .iter()
                    .filter_map(|p| p["sequence"].as_u64())
                    .min()
                    .is_some_and(|oldest| oldest <= gap.through)
            {
                self.history_gaps.pop();
            } else if let Some(next) = next {
                gap.before = next;
            }
            if let Some(oldest) = self.history_before
                && next.is_none_or(|next| next < oldest)
            {
                self.history_before = next;
            }
        } else {
            self.history_before = next;
        }
        self.merge_timeline_parts(timeline);
    }
    fn is_idle(&self) -> bool {
        if self.editing.is_some() {
            return false;
        }
        let Some(projection) = &self.projection else {
            return true;
        };
        let value = projection.value();
        !rows(value, "runs").iter().any(|run| {
            matches!(
                text(run, "status"),
                "queued" | "running" | "dispatching" | "cancel_requested" | "unknown"
            )
        }) && !rows(value, "human_requests")
            .iter()
            .any(|request| request["state"] == "pending")
            && !self.native.iter().any(|(run_id, history)| {
                // Closed runs may retain historical pending observations. Fresh run
                // events, not an old tool-card snapshot, decide retention eligibility.
                if rows(value, "runs").iter().any(|run| {
                    run["id"] == *run_id
                        && matches!(
                            text(run, "status"),
                            "succeeded" | "failed" | "cancelled" | "steered"
                        )
                }) {
                    return false;
                }
                rows(history, "records").iter().any(|record| {
                    record["observed_state"] == "pending"
                        && record["submission"]["state"] != "submitted"
                })
            })
    }
}
struct RetainedThread {
    state: ThreadState,
    last_used: u64,
}
#[derive(Default)]
pub(super) struct ThreadCache {
    entries: BTreeMap<Uuid, RetainedThread>,
    clock: u64,
}
impl ThreadCache {
    pub(super) fn oldest_cursor(&self) -> Option<u64> {
        self.entries
            .values()
            .filter_map(|entry| entry.state.projection.as_ref().map(Conversation::cursor))
            .min()
    }
    pub(super) fn apply_events(
        &mut self,
        page: &ngertiin_client::EventPage,
    ) -> Result<(), ngertiin_client::ClientError> {
        for (id, entry) in &mut self.entries {
            if let Some(projection) = &mut entry.state.projection
                && projection.cursor() <= page.next_cursor
            {
                projection.apply(page.clone())?;
                if page.events.iter().any(|event| {
                    event["conversation_thread_id"] == id.to_string()
                        || event["data"]["thread_id"] == id.to_string()
                }) {
                    self.clock += 1;
                    entry.last_used = self.clock;
                }
            }
        }
        Ok(())
    }
    fn take(&mut self, id: Uuid) -> Option<ThreadState> {
        self.entries.remove(&id).map(|entry| entry.state)
    }
    fn insert(&mut self, id: Uuid, state: ThreadState) {
        self.clock += 1;
        self.entries.insert(
            id,
            RetainedThread {
                state,
                last_used: self.clock,
            },
        );
    }
    fn trim(&mut self, protected: &BTreeSet<Uuid>) {
        let mut idle = self
            .entries
            .iter()
            .filter(|(id, entry)| !protected.contains(id) && entry.state.is_idle())
            .map(|(id, entry)| (*id, entry.last_used))
            .collect::<Vec<_>>();
        idle.sort_by_key(|(_, used)| *used);
        let count = idle.len().saturating_sub(MAX_IDLE_THREADS);
        for (id, _) in idle.into_iter().take(count) {
            self.entries.remove(&id);
        }
    }
}

impl Workspace {
    pub(super) fn new_thread_state(window: &mut Window, cx: &mut Context<Self>) -> ThreadState {
        let composer = cx.new(|cx| {
            let mut composer = Composer::new(vec![], window, cx);
            // Apply the conversation presentation before restore/autofocus can
            // expose the first frame, including while the snapshot is pending.
            composer.embedded("Pesan…".into(), window, cx);
            composer
        });
        let scroller = cx.new(|cx| TranscriptScroll::new(window, cx));
        let find = cx.new(|cx| thread_search::ThreadSearch::new(window, cx));
        let owner = cx.entity().downgrade();
        let scroll_id = scroller.entity_id();
        scroller.read(cx).set_readiness(move |ix, cx| {
            owner
                .read_with(cx, |workspace, cx| {
                    if workspace.conversation.scroller.entity_id() != scroll_id {
                        return true;
                    }
                    match workspace
                        .conversation
                        .transcript
                        .get(ix)
                        .map(|row| &row.kind)
                    {
                        Some(transcript::RowKind::Message {
                            body,
                            content,
                            message,
                            ..
                        }) => {
                            let rendered = body.read(cx).rendered_text();
                            if message["author"] == "user" {
                                rendered.source()
                                    == crate::models::content::literal_markdown(content)
                            } else {
                                rendered.source() == content
                            }
                        }
                        _ => true,
                    }
                })
                .unwrap_or(true)
        });
        let subscriptions = vec![
            cx.observe(&find, |this, owner, cx| {
                if this.conversation.find.entity_id() == owner.entity_id() {
                    this.conversation
                        .scroller
                        .update(cx, |scroll, cx| scroll.remeasure_items(0..1, cx));
                    cx.notify();
                }
            }),
            cx.subscribe_in(
                &find,
                window,
                |this, owner, reveal: &thread_search::Reveal, _, cx| {
                    if this.conversation.find.entity_id() != owner.entity_id() {
                        return;
                    }
                    let Some(ix) = this
                        .conversation
                        .transcript
                        .iter()
                        .position(|row| row.id == reveal.row)
                    else {
                        return;
                    };
                    this.conversation.restore_reading = None;
                    this.conversation.scroller.update(cx, |scroll, cx| {
                        scroll.scroll_to(
                            ListOffset {
                                item_ix: ix,
                                offset_in_item: px(0.),
                            },
                            cx,
                        )
                    });
                    let reveal = reveal.clone();
                    let scope = this.scope;
                    let workspace = cx.entity().downgrade();
                    cx.defer(move |cx| {
                        let _ = workspace.update(cx, |this, cx| {
                            if this.scope == scope
                                && this.conversation.find.read(cx).is_active(&reveal)
                            {
                                reveal.body.update(cx, |body, cx| {
                                    let _ = body.reveal_range(reveal.range, cx);
                                });
                            }
                        });
                    });
                    cx.notify();
                },
            ),
            cx.subscribe_in(
                &composer,
                window,
                |this, owner, event: &ComposerEvent, window, cx| {
                    if this.conversation.composer.entity_id() != owner.entity_id() {
                        return;
                    }
                    match event {
                        ComposerEvent::Submit(_) => this.send(window, cx),
                        ComposerEvent::Files(entries) => this.stage_entries(entries.clone(), cx),
                        ComposerEvent::EditQueued => this.edit_next_queued(window, cx),
                        ComposerEvent::Changed(_) => {
                            if !this.restoring
                                && this.conversation.editing.is_none()
                                && let Some(thread) = this.selected
                                && let Err(error) = this
                                    .store
                                    .save_composer(thread, owner.read(cx).snapshot(cx))
                            {
                                this.error = error.to_string();
                            }
                            cx.notify();
                        }
                    }
                },
            ),
            cx.subscribe_in(
                &scroller,
                window,
                |this, owner, _: &ScrollChanged, window, cx| {
                    if this.conversation.scroller.entity_id() != owner.entity_id() {
                        return;
                    }
                    // User scrolling takes precedence over a pending cold restore.
                    this.conversation.restore_reading = None;
                    this.schedule_reading_save(window, cx);
                    cx.notify();
                },
            ),
        ];
        ThreadState {
            portraits: BTreeMap::new(),
            avatar_activity: BTreeMap::new(),
            projection: None,
            opening: Value::Null,
            native: BTreeMap::new(),
            interaction_views: BTreeMap::new(),
            question_steps: BTreeMap::new(),
            source_expanded: BTreeSet::new(),
            timeline_expanded: BTreeSet::new(),
            wrapped_code: BTreeSet::new(),
            composer,
            find,
            composer_height: window.rem_size() * 4.5,
            editing: None,
            queue_expanded: true,
            scroller,
            transcript: vec![],
            order: vec![],
            parts: BTreeMap::new(),
            history_before: None,
            history_gaps: vec![],
            reconciling: true,
            restore_reading: None,
            acknowledged_draft: None,
            notice: None,
            _subscriptions: subscriptions,
        }
    }
    pub(super) fn trim_retained_threads(&mut self) {
        let mut protected = self
            .store
            .unresolved()
            .into_iter()
            .filter_map(|(_, operation)| operation.thread)
            .collect::<BTreeSet<_>>();
        protected.extend(
            self.activities
                .iter()
                .filter(|activity| {
                    activity["waiting_for_user"] == true
                        || matches!(
                            text(activity, "status"),
                            "queued" | "running" | "dispatching" | "cancel_requested" | "unknown"
                        )
                })
                .filter_map(|activity| text(activity, "thread_id").parse::<Uuid>().ok()),
        );
        if self.staging_task.is_some() {
            return;
        }
        self.retained_threads.trim(&protected);
    }
    fn sequence_for_row(&self, row: &transcript::TranscriptRow) -> Option<u64> {
        use transcript::RowKind;
        let message = match &row.kind {
            RowKind::Message { message, .. } => &message["id"],
            RowKind::Run(run) | RowKind::Computer(run) | RowKind::Sources(run) => {
                &run["input_message_id"]
            }
            RowKind::Route(route) => &route["message_id"],
            _ => return None,
        };
        self.conversation
            .parts
            .values()
            .find(|part| &part["message_id"] == message)
            .and_then(|part| part["sequence"].as_u64())
    }
    pub(super) fn save_thread_presentation(
        &mut self,
        window: &Window,
        cx: &App,
    ) -> anyhow::Result<()> {
        let Some(id) = self.selected else {
            return Ok(());
        };
        if self.conversation.editing.is_none() {
            self.store
                .save_composer(id, self.conversation.composer.read(cx).snapshot(cx))?;
        }
        if self.conversation.restore_reading.is_some() {
            return Ok(());
        }
        let scroll = self.conversation.scroller.read(cx);
        let position = scroll.logical_scroll_top();
        let following = scroll.is_following_tail();
        let row_ix = position
            .item_ix
            .min(self.conversation.transcript.len().saturating_sub(1));
        let Some(row) = self.conversation.transcript.get(row_ix) else {
            return Ok(());
        };
        let sequence = self.conversation.transcript[..=row_ix]
            .iter()
            .rev()
            .find_map(|row| self.sequence_for_row(row));
        self.store.save_reading_position(
            id,
            ReadingPosition {
                row: row.id.clone(),
                sequence,
                offset: f32::from(position.offset_in_item) / f32::from(window.rem_size()),
                following,
            },
        )
    }
    fn schedule_reading_save(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let scope = self.scope;
        self.reading_save_task = Some(cx.spawn_in(window, async move |view, cx| {
            cx.background_executor()
                .timer(std::time::Duration::from_millis(200))
                .await;
            let _ = view.update_in(cx, |this, window, cx| {
                if this.scope == scope
                    && let Err(error) = this.save_thread_presentation(window, cx)
                {
                    this.error = error.to_string();
                    cx.notify();
                }
            });
        }));
    }
    pub(super) fn restore_reading_position(&mut self, window: &Window, cx: &mut Context<Self>) {
        let Some(position) = self.conversation.restore_reading.as_ref() else {
            return;
        };
        if !position.following
            && !self
                .conversation
                .transcript
                .iter()
                .any(|row| row.id == position.row)
            && self.conversation.history_before.is_some()
            && position.sequence.is_some_and(|sequence| {
                self.conversation
                    .parts
                    .values()
                    .filter_map(|part| part["sequence"].as_u64())
                    .min()
                    .is_none_or(|oldest| oldest > sequence)
            })
        {
            return;
        }
        let position = self.conversation.restore_reading.take().unwrap();
        let row_ix =
            self.conversation
                .transcript
                .iter()
                .position(|row| row.id == position.row)
                .or_else(|| {
                    position.sequence.and_then(|sequence| {
                        self.conversation.transcript.iter().rposition(|row| {
                            self.sequence_for_row(row).is_some_and(|s| s <= sequence)
                        })
                    })
                });
        self.conversation.scroller.update(cx, |scroll, cx| {
            if position.following {
                scroll.scroll_to_end(cx);
            } else if let Some(item_ix) = row_ix {
                scroll.scroll_to(
                    ListOffset {
                        item_ix,
                        offset_in_item: window.rem_size() * position.offset,
                    },
                    cx,
                );
            }
        });
    }
    pub(super) fn activate_thread(
        &mut self,
        id: Uuid,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let retained = self.retained_threads.take(id);
        let is_retained = retained.is_some();
        let mut state = retained.unwrap_or_else(|| Self::new_thread_state(window, cx));
        state.reconciling = true;
        if !is_retained {
            state.restore_reading = self.store.reading_position(id);
        }
        let previous = std::mem::replace(&mut self.conversation, state);
        for (_, portrait) in previous.portraits.values() {
            portrait.update(cx, |portrait, _| portrait.pause());
        }
        if let Some(old) = self.selected {
            self.retained_threads.insert(old, previous);
        }
        self.selected = Some(id);
        if let Some(notice) = self.conversation.notice.take() {
            self.error = notice;
        }
        let acknowledged = self.conversation.acknowledged_draft.take();
        let stale_draft = acknowledged.as_ref().is_some_and(|authored| {
            self.conversation.composer.read(cx).snapshot(cx).draft.text == *authored
        });
        if !is_retained || stale_draft {
            self.restore_draft(window, cx);
        }
        let input = self.conversation.composer.read(cx).input.clone();
        input.update(cx, |input, cx| input.focus(window, cx));
        self.trim_retained_threads();
        self.prepare_portraits(cx);
    }
    pub(super) fn acknowledge_retained_composer(&mut self, thread: Uuid, authored: &str) {
        if let Some(entry) = self.retained_threads.entries.get_mut(&thread) {
            entry.state.acknowledged_draft = Some(authored.to_owned());
        }
    }
    pub(super) fn acknowledge_thread_edit(
        &mut self,
        operation: &crate::storage::Operation,
        cx: &App,
    ) -> bool {
        let Some(thread) = operation.thread else {
            return false;
        };
        let active = self.selected == Some(thread);
        let state = if active {
            &mut self.conversation
        } else if let Some(entry) = self.retained_threads.entries.get_mut(&thread) {
            &mut entry.state
        } else {
            return false;
        };
        let Some(message) = state.editing.as_ref() else {
            return false;
        };
        if operation.request.path != format!("/v1/messages/{}/edit", text(message, "id"))
            || operation.request.body["expected_revision"] != message["revision"]
            || state.composer.read(cx).snapshot(cx).draft.text
                != text(&operation.request.body, "text")
        {
            return false;
        }
        state.editing = None;
        if !active {
            state.acknowledged_draft = Some(text(&operation.request.body, "text").to_owned());
        }
        active
    }
    pub(super) fn record_retained_error(&mut self, thread: Option<Uuid>, message: String) {
        if thread.is_some() && thread == self.selected {
            self.error = message;
            return;
        }
        if let Some(entry) = thread.and_then(|id| self.retained_threads.entries.get_mut(&id)) {
            entry.state.notice = Some(message);
        }
    }
}
