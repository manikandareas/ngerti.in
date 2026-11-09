//! API conversation feature. Transport, durable intent, and presentation have
//! separate owners; the server remains the only admission/lifecycle authority.
mod chrome;
mod commands;
mod composer_view;
mod computer;
mod context;
mod interactions;
mod message_markup;
mod model_picker;
mod navigation;
mod panels;
mod sync;
#[cfg(test)]
mod tests;
mod timeline;
mod transcript;
mod view;

use crate::{
    models::composer::{Draft, Snapshot},
    storage::Store,
    ui::{
        avatar_view::{AvatarAnimator, AvatarPortrait},
        composer::{Composer, ComposerEvent},
    },
};
use gpui_kit::{
    component::{WindowExt, input::InputState, message_scroller::MessageScrollerState},
    *,
};
use ngertiin_client::{ApiWorker, Conversation};
use serde_json::Value;
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Panel {
    Detail,
    Library,
    Computer,
    Settings,
}
actions!(
    native_workspace,
    [
        CreateAgent,
        CreateGroup,
        OpenSettings,
        ToggleSidebar,
        ToggleDetails
    ]
);
pub(crate) struct Workspace {
    computer: Entity<computer::Computer>,
    store: Store,
    context_work: context::ContextWork,
    reads: Option<ApiWorker>,
    writes: Option<ApiWorker>,
    bound: bool,
    checked: bool,
    selected: Option<Uuid>,
    recipient: Option<Uuid>,
    agents: Vec<Value>,
    threads: Vec<Value>,
    connections: Vec<Value>,
    previews: BTreeMap<String, Value>,
    activities: Vec<Value>,
    projection: Option<Conversation>,
    opening: Value,
    native: BTreeMap<String, Value>,
    interaction_views: BTreeMap<String, interactions::BoundInteraction>,
    answers: BTreeMap<String, Value>,
    question_steps: BTreeMap<String, usize>,
    source_expanded: std::collections::BTreeSet<String>,
    timeline_expanded: std::collections::BTreeSet<String>,
    wrapped_code: std::collections::BTreeSet<String>,
    composer: Entity<Composer>,
    composer_height: Pixels,
    search: Entity<InputState>,
    group_name: Entity<InputState>,
    group_members: Vec<Uuid>,
    editing: Option<Value>,
    scroller: Entity<MessageScrollerState>,
    transcript: Vec<transcript::TranscriptRow>,
    order: Vec<String>,
    parts: BTreeMap<String, Value>,
    history_before: Option<u64>,
    history_loaded: bool,
    animator: Entity<AvatarAnimator>,
    avatar_activity: BTreeMap<String, (bool, bool)>,
    portraits: BTreeMap<String, (Value, Entity<AvatarPortrait>)>,
    portrait_observers: BTreeMap<String, Subscription>,
    ready_portraits: std::collections::BTreeSet<String>,
    search_open: bool,
    panel: Option<Panel>,
    context_tab_focus: [FocusHandle; 3],
    sidebar: bool,
    error: String,
    loading: bool,
    busy: bool,
    restoring: bool,
    scope: u64,
    ticks: u32,
    was_active: bool,
    read_task: Option<Task<()>>,
    command_task: Option<Task<()>>,
    staging_task: Option<Task<()>>,
    timer: Option<Task<()>>,
    feed: Option<ngertiin_client::EventFeed>,
    feed_task: Option<Task<()>>,
    refresh_pending: bool,
    _subscriptions: Vec<Subscription>,
}
impl Workspace {
    pub fn new(store: Store, window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self::with_attachment(store, crate::host::api_client(), window, cx)
    }
    fn with_attachment(
        mut store: Store,
        attachment: anyhow::Result<Option<(ngertiin_client::ApiClient, Option<Uuid>)>>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        let retained_answers = store.interaction_answers();
        let mut error = String::new();
        let mut selected = store.selected();
        let (reads, writes) = match attachment {
            Ok(Some((client, thread))) => {
                if selected.is_none() {
                    selected = thread;
                }
                match (ApiWorker::new(client.clone()), ApiWorker::new(client)) {
                    (Ok(reads), Ok(writes)) => (Some(reads), Some(writes)),
                    _ => {
                        error =
                            "Native connection workers could not start. Relaunch the application."
                                .into();
                        (None, None)
                    }
                }
            }
            Ok(None) => {
                error = crate::host::status_message();
                (None, None)
            }
            Err(e) => {
                error = e.to_string();
                (None, None)
            }
        };
        cx.bind_keys([
            KeyBinding::new("cmd-b", ToggleSidebar, Some("NativeWorkspace")),
            KeyBinding::new("cmd-i", ToggleDetails, Some("NativeWorkspace")),
        ]);
        if store.appearance() == "system" {
            let dark = matches!(
                window.appearance(),
                WindowAppearance::Dark | WindowAppearance::VibrantDark
            );
            let _ = store.set_appearance("system", dark);
        }
        crate::ui::theme::apply(store.dark(), None, cx);
        let search = cx.new(|cx| InputState::new(window, cx).placeholder("Who’s on your mind?"));
        let group_name = cx.new(|cx| InputState::new(window, cx).placeholder("Group name"));
        let composer = cx.new(|cx| Composer::new(vec![], window, cx));
        let computer = cx.new(|cx| computer::Computer::new(window, cx));
        let sleep_weak = cx.entity().downgrade();
        let wake_weak = sleep_weak.clone();
        let subscriptions = vec![
            cx.on_system_sleep(move |cx| {
                let _ = sleep_weak.update(cx, |this, cx| {
                    this.was_active = false;
                    if let Some(feed) = &this.feed {
                        feed.set_visible(false);
                    }
                    this.computer
                        .update(cx, |computer, cx| computer.suspend(true, cx));
                });
            }),
            cx.on_system_wake(move |cx| {
                let _ = wake_weak.update(cx, |this, cx| {
                    this.was_active = false;
                    this.computer
                        .update(cx, |computer, cx| computer.suspend(false, cx));
                    cx.notify();
                });
            }),
            cx.observe(&computer, |_, _, cx| cx.notify()),
            cx.observe_window_bounds(window, |_, window, _| {
                crate::host::lifecycle::save_bounds(window)
            }),
            cx.observe_window_visibility(window, |this, _, window, cx| {
                let visible = window.is_visible();
                if std::env::var_os("NGERTIIN_RS_DIAGNOSTICS").is_some()
                    && let Ok(home) = crate::host::profile_root()
                {
                    let _ = crate::host::write_diagnostic(
                        &home.join("visibility.json"),
                        &serde_json::json!({
                            "visible":visible,
                            "active":window.is_window_active(),
                            "avatar_images_delivered":this.animator.read(cx).presented,
                            "captured_at":chrono::Utc::now().to_rfc3339(),
                        }),
                    );
                }
                crate::host::views::visibility(visible);
                this.computer
                    .update(cx, |computer, cx| computer.suspend(!visible, cx));
                if let Some(feed) = &this.feed {
                    feed.set_visible(visible);
                }
            }),
            cx.observe_window_appearance(window, |this, window, cx| {
                if this.store.appearance() == "system" {
                    let dark = matches!(
                        window.appearance(),
                        WindowAppearance::Dark | WindowAppearance::VibrantDark
                    );
                    let _ = this.store.set_appearance("system", dark);
                    crate::ui::theme::apply(dark, None, cx);
                    cx.notify();
                }
            }),
            cx.subscribe_in(
                &composer,
                window,
                |this, _, event: &ComposerEvent, window, cx| match event {
                    ComposerEvent::Submit(_) => this.send(window, cx),
                    ComposerEvent::Files(entries) => this.stage_entries(entries.clone(), cx),
                    ComposerEvent::Changed(draft) => {
                        if !this.restoring
                            && this.editing.is_none()
                            && let Some(thread) = this.selected
                            && let Err(error) = this.store.save_draft(thread, draft.text.clone())
                        {
                            this.error = error.to_string();
                        }
                        cx.notify();
                    }
                },
            ),
            cx.observe(&search, |_, _, cx| cx.notify()),
        ];
        if let Some(id) = selected {
            let _ = store.select(id);
        }
        let weak = cx.entity().downgrade();
        App::on_action(cx, move |_: &crate::shell::ToggleTheme, cx| {
            let _ = weak.update(cx, |this, cx| {
                let dark = !this.store.dark();
                if let Err(e) = this.store.theme(dark) {
                    this.error = e.to_string();
                }
                crate::ui::theme::apply(dark, None, cx);
                cx.notify();
            });
        });
        window.on_window_should_close(cx, |_, cx| {
            crate::host::views::visibility(false);
            cx.hide();
            false
        });
        let mut this = Self {
            computer,
            context_work: context::ContextWork::new(cx),
            store,
            reads,
            writes,
            bound: false,
            checked: false,
            selected,
            recipient: None,
            agents: vec![],
            threads: vec![],
            connections: vec![],
            previews: BTreeMap::new(),
            activities: vec![],
            projection: None,
            opening: Value::Null,
            native: BTreeMap::new(),
            interaction_views: BTreeMap::new(),
            answers: retained_answers,
            question_steps: BTreeMap::new(),
            source_expanded: Default::default(),
            timeline_expanded: Default::default(),
            wrapped_code: Default::default(),
            composer,
            composer_height: px(72.),
            search,
            group_name,
            group_members: vec![],
            editing: None,
            scroller: cx.new(|cx| MessageScrollerState::new(0, cx)),
            transcript: vec![],
            order: vec![],
            parts: BTreeMap::new(),
            history_before: None,
            history_loaded: false,
            animator: cx.new(|cx| AvatarAnimator::new(window, cx)),
            avatar_activity: BTreeMap::new(),
            portraits: BTreeMap::new(),
            portrait_observers: BTreeMap::new(),
            ready_portraits: std::collections::BTreeSet::new(),
            search_open: false,
            panel: None,
            context_tab_focus: std::array::from_fn(|_| cx.focus_handle()),
            sidebar: true,
            error,
            loading: false,
            busy: false,
            restoring: false,
            scope: 0,
            ticks: 0,
            was_active: true,
            read_task: None,
            command_task: None,
            staging_task: None,
            timer: None,
            feed: None,
            feed_task: None,
            refresh_pending: false,
            _subscriptions: subscriptions,
        };
        this.recipient = this.selected.and_then(|id| this.store.recipient(id));
        this.composer.update(cx, |composer, cx| {
            composer.embedded("Pesan…".into(), window, cx)
        });
        this.lock_composer(cx);
        this.restore_draft(window, cx);
        this.refresh(true, window, cx);
        this.timer = Some(cx.spawn_in(window, async move |view, cx| {
            loop {
                cx.background_executor()
                    .timer(std::time::Duration::from_millis(1000))
                    .await;
                if view
                    .update_in(cx, |this, window, cx| {
                        let active = window.is_window_active() && window.is_visible();
                        let first_visible = this.scroller.read(cx).logical_scroll_top().item_ix;
                        let conversation_computer =
                            this.transcript.iter().skip(first_visible).any(|row| {
                                matches!(&row.kind, transcript::RowKind::Computer(run)
                                    if matches!(ngertiin_client::text(run, "status"),
                                        "running" | "dispatching" | "cancel_requested"))
                            });
                        let computer_present = (this.panel == Some(Panel::Computer)
                            || conversation_computer)
                            && !this.is_viewing()
                            && this.panel != Some(Panel::Settings);
                        let computer_suspended = !window.is_visible()
                            || window.has_active_dialog(cx)
                            || window.has_active_sheet(cx);
                        this.computer.update(cx, |computer, cx| {
                            computer.present(computer_present, cx);
                            computer.suspend(computer_suspended, cx);
                        });
                        if this.reads.is_none() && this.ticks.is_multiple_of(3) {
                            this.reconnect(window, cx);
                        }

                        let resumed = active && !this.was_active;
                        this.was_active = active;
                        if let Some(feed) = &this.feed {
                            feed.set_visible(active);
                        }
                        this.ticks += 1;
                        if active {
                            this.refresh(resumed || this.ticks.is_multiple_of(30), window, cx);
                        }
                    })
                    .is_err()
                {
                    break;
                }
            }
        }));
        this
    }
    fn value(&self) -> &Value {
        self.projection
            .as_ref()
            .map(Conversation::value)
            .unwrap_or(&Value::Null)
    }
    fn lock_composer(&mut self, cx: &mut Context<Self>) {
        let locked = self.busy
            || self.composer_response_locked(cx)
            || !self.checked
            || self.projection.is_none()
            || self
                .selected
                .is_some_and(|id| self.store.pending(&format!("message:{id}")).is_some());
        self.composer
            .update(cx, |composer, cx| composer.readonly(locked, cx));
    }
    fn restore_draft(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.restoring = true;
        let text = self
            .selected
            .map(|id| {
                let draft = self.store.draft(id);
                if draft.is_empty() {
                    self.store
                        .pending(&format!("message:{id}"))
                        .and_then(|operation| operation.authored)
                        .unwrap_or(draft)
                } else {
                    draft
                }
            })
            .unwrap_or_default();
        self.composer.update(cx, |composer, cx| {
            composer.restore(
                Snapshot {
                    selection: text.len()..text.len(),
                    draft: Draft {
                        text,
                        tokens: vec![],
                    },
                    reversed: false,
                },
                window,
                cx,
            )
        });
        self.restoring = false;
    }
    fn select(&mut self, id: Uuid, window: &mut Window, cx: &mut Context<Self>) {
        if self.selected == Some(id) && self.projection.is_some() {
            return;
        }
        if let Err(e) = self.store.select(id) {
            self.error = e.to_string();
            return;
        }
        self.computer
            .update(cx, |computer, cx| computer.present(false, cx));
        self.read_task = None;
        self.context_work = context::ContextWork::new(cx);
        self.scope += 1;
        self.selected = Some(id);
        self.recipient = self.store.recipient(id);
        self.projection = None;
        self.lock_composer(cx);
        self.native.clear();
        self.interaction_views.clear();
        self.answers = self.store.interaction_answers();
        self.question_steps.clear();
        self.source_expanded.clear();
        self.timeline_expanded.clear();
        self.wrapped_code.clear();
        self.transcript.clear();
        self.editing = None;
        self.panel = None;
        window.close_sheet(cx);
        self.parts.clear();
        self.order.clear();
        self.history_before = None;
        self.history_loaded = false;
        self.scroller.update(cx, |state, cx| state.reset(0, cx));
        self.restore_draft(window, cx);
        self.refresh(true, window, cx);
        cx.notify();
    }
}
