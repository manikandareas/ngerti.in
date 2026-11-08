//! API conversation feature. Transport, durable intent, and presentation have
//! separate owners; the server remains the only admission/lifecycle authority.
mod chrome;
mod commands;
mod composer_view;
mod interactions;
mod navigation;
mod panels;
mod sync;
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
    store: Store,
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
    models_open: bool,
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
    pub fn new(mut store: Store, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let attachment = crate::host::api_client();
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
                error="Select a local backend using the private attachment.json configuration, then relaunch.".into();
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
        crate::ui::theme::apply(store.dark(), None, cx);
        let search = cx.new(|cx| InputState::new(window, cx).placeholder("Who’s on your mind?"));
        let group_name = cx.new(|cx| InputState::new(window, cx).placeholder("Group name"));
        let composer = cx.new(|cx| Composer::new(vec![], window, cx));
        let subscriptions = vec![
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
        let mut this = Self {
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
            answers: BTreeMap::new(),
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
            models_open: false,
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
        self.read_task = None;
        self.scope += 1;
        self.selected = Some(id);
        self.recipient = self.store.recipient(id);
        self.projection = None;
        self.lock_composer(cx);
        self.native.clear();
        self.interaction_views.clear();
        self.answers.clear();
        self.transcript.clear();
        self.editing = None;
        self.panel = None;
        self.models_open = false;
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
