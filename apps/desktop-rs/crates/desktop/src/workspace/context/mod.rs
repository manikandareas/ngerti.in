//! Contextual workflows retain their own navigation, reads and native content.
mod apps;
mod detail;
mod files;
mod focus;
mod library;
mod settings;
mod skills;
mod state;
pub(in crate::workspace) use files::file_icon;

use super::*;
use crate::ui::{
    controls::*,
    theme::{Palette, ui, ui_px},
    workspace::{action, glyph},
};
use gpui_kit::{component::input::InputState, prelude::FluentBuilder};
use ngertiin_client::{ClientError, rows, text};
use serde_json::json;
use state::{Location, Tree};

pub(super) struct ContextWork {
    location: Location,
    history: Vec<(Location, Option<FocusHandle>, Point<Pixels>)>,
    scroll: ScrollHandle,
    tree_scroll: UniformListScrollHandle,
    focus: FocusHandle,
    tree_focus: FocusHandle,
    tree_focus_observers: Vec<Subscription>,
    viewer_return_focus: Vec<Option<FocusHandle>>,
    return_focus: Option<FocusHandle>,
    settings_return: Option<Panel>,
    section: String,
    provider: String,
    resources: BTreeMap<String, Value>,
    errors: BTreeMap<String, String>,
    tasks: BTreeMap<String, Task<()>>,
    fields: BTreeMap<String, Entity<InputState>>,
    field_observers: BTreeMap<String, Subscription>,
    textareas: BTreeMap<String, Entity<gpui_kit::component::input::TextareaState>>,
    form: Option<(String, Value)>,
    tree: Tree,
    viewer: Vec<focus::Document>,
    context: Option<focus::Target>,
    file_task: Option<Task<()>>,
    file_error: String,
    read_target: Option<focus::Target>,
    generation: u64,
    staged_context: Option<(String, Uuid)>,
    secret_operation: Uuid,
    secret_pending: Option<Value>,
    grant_agent: String,
    grant_tools: std::collections::BTreeSet<String>,
    resource_cursor: Option<u64>,
    operation_error: String,
}
impl ContextWork {
    pub(in crate::workspace) fn new(cx: &mut App) -> Self {
        Self {
            location: Location::Overview,
            history: vec![],
            scroll: ScrollHandle::new(),
            tree_scroll: UniformListScrollHandle::new(),
            focus: cx.focus_handle().tab_stop(true),
            tree_focus: cx.focus_handle().tab_stop(true),
            tree_focus_observers: vec![],
            viewer_return_focus: vec![],
            return_focus: None,
            settings_return: None,
            section: "general".into(),
            provider: "codex".into(),
            resources: BTreeMap::new(),
            errors: BTreeMap::new(),
            tasks: BTreeMap::new(),
            fields: BTreeMap::new(),
            field_observers: BTreeMap::new(),
            textareas: BTreeMap::new(),
            form: None,
            tree: Tree::default(),
            viewer: vec![],
            context: None,
            file_task: None,
            file_error: String::new(),
            read_target: None,
            generation: 0,
            staged_context: None,
            secret_operation: Uuid::new_v4(),
            secret_pending: None,
            grant_agent: String::new(),
            grant_tools: std::collections::BTreeSet::new(),
            resource_cursor: None,
            operation_error: String::new(),
        }
    }
}
impl Workspace {
    pub(in crate::workspace) fn context_failure(&mut self, error: String) {
        self.context_work.operation_error = error;
    }
    pub(in crate::workspace) fn clear_context_error(&mut self) {
        self.context_work.operation_error.clear();
    }
    pub(in crate::workspace) fn context_notice(&self) -> Option<AnyElement> {
        if self.context_work.operation_error.is_empty() {
            return None;
        }
        let p = Palette::new(self.store.dark());
        Some(
            div()
                .id("context-operation-error")
                .role(Role::Alert)
                .aria_label(self.context_work.operation_error.clone())
                .text_color(p.color("destructive"))
                .child(self.context_work.operation_error.clone())
                .into_any_element(),
        )
    }
    pub(in crate::workspace) fn refresh_context_resources(&mut self, cx: &mut Context<Self>) {
        let cursor = self.projection.as_ref().map(Conversation::cursor);
        if cursor == self.context_work.resource_cursor {
            return;
        }
        self.context_work.resource_cursor = cursor;
        if self.panel == Some(Panel::Library) {
            self.load_library(cx);
        }
        if self.context_work.location == Location::Apps {
            self.context_read("apps", "/v1/apps/connections".into(), cx);
        }
    }
    pub(in crate::workspace) fn context_focus(&self) -> FocusHandle {
        self.context_work.focus.clone()
    }
    pub(in crate::workspace) fn toggle_context(
        &mut self,
        panel: Panel,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.panel.is_some() {
            self.close_context(window, cx);
        } else {
            self.context_work.return_focus = window.focused(cx);
            self.panel = Some(panel);
            self.context_work.focus.focus(window, cx);
            cx.notify();
        }
    }
    pub(in crate::workspace) fn context_scroll(&self) -> ScrollHandle {
        if self.context_work.location == Location::Files {
            self.context_work.tree_scroll.0.borrow().base_handle.clone()
        } else {
            self.context_work.scroll.clone()
        }
    }
    pub(in crate::workspace) fn context_toolbar(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut toolbar = div().flex_1().flex().items_center().gap(ui(8.));
        if self.context_nested() {
            toolbar = toolbar
                .child(
                    action("panel-back", "Back", "ArrowLeft01Icon", p, cx)
                        .on_click(cx.listener(|this, _, window, cx| this.context_back(window, cx))),
                )
                .child(div().flex_1().truncate().child(self.context_title()));
        }
        if self.context_work.location == Location::Files {
            toolbar = toolbar.child(
                action(
                    "refresh-files",
                    "Refresh working files",
                    "RefreshIcon",
                    p,
                    cx,
                )
                .on_click(cx.listener(|this, _, _, cx| this.refresh_files(cx))),
            );
        } else {
            toolbar = toolbar.child(div().flex_1()).child(
                action("working-files", "Working files", "Folder01Icon", p, cx).on_click(
                    cx.listener(|this, _, window, cx| this.open_working_files(window, cx)),
                ),
            );
        }
        toolbar.into_any_element()
    }
    pub(in crate::workspace) fn context_command_confirmed(
        &mut self,
        operation: &crate::storage::Operation,
        result: &Value,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if operation.request.path.starts_with("/v1/learning/") {
            self.context_work.form = None;
            if let Some(context) = self.learning_context() {
                self.context_read(
                    "memories",
                    format!(
                        "/v1/learning/memories?agent_id={}&thread_id={}",
                        text(&context, "agent_id"),
                        text(&context, "thread_id")
                    ),
                    cx,
                );
                self.context_read(
                    "skills",
                    format!(
                        "/v1/learning/skills?agent_id={}&thread_id={}",
                        text(&context, "agent_id"),
                        text(&context, "thread_id")
                    ),
                    cx,
                );
            }
        }
        if operation.request.path.ends_with("/configuration")
            || operation.request.path.ends_with("/membership")
        {
            self.context_work.form = Some((
                if operation.request.path.starts_with("/v1/groups/") {
                    "group"
                } else {
                    "agent"
                }
                .into(),
                result.clone(),
            ));
        }
        if operation.request.path.starts_with("/v1/apps/") {
            self.context_work.form = None;
            self.context_read("apps", "/v1/apps/connections".into(), cx);
        }
        if operation.request.path == "/v1/connections"
            && let Some(id) = result["id"].as_str()
        {
            self.provider_operation(
                format!("/v1/connections/{id}/login"),
                json!({}),
                None,
                window,
                cx,
            );
        }
    }
    pub(in crate::workspace) fn context_read(
        &mut self,
        key: &str,
        path: String,
        cx: &mut Context<Self>,
    ) {
        if self.context_work.tasks.contains_key(key) {
            return;
        }
        let Some(worker) = &self.reads else {
            return;
        };
        let append = path.contains("&after=") || path.contains("&cursor=");
        let reply = worker.submit(false, move |api| api.get(&path));
        let Ok(reply) = reply else {
            return;
        };
        let scope = self.scope;
        let key = key.to_owned();
        let identity = key.clone();
        self.context_work.errors.remove(&key);
        let task = cx.spawn(async move |view, cx| {
            let result = reply.await.unwrap_or(Err(ClientError::Unavailable));
            let _ = view.update(cx, |this, cx| {
                if this.scope != scope {
                    return;
                }
                this.context_work.tasks.remove(&identity);
                match result {
                    Ok(mut value) => {
                        if append && let Some(previous) = this.context_work.resources.get(&identity)
                        {
                            let field = if identity == "memories" {
                                "memories"
                            } else {
                                "items"
                            };
                            if let (Some(old), Some(next)) =
                                (previous[field].as_array(), value[field].as_array())
                            {
                                let mut combined = old.clone();
                                for item in next {
                                    if !combined.iter().any(|v| {
                                        if field == "memories" {
                                            v["id"] == item["id"]
                                        } else {
                                            v["slug"] == item["slug"]
                                        }
                                    }) {
                                        combined.push(item.clone());
                                    }
                                }
                                value[field] = Value::Array(combined);
                            }
                        }
                        this.context_work.resources.insert(identity, value);
                    }
                    Err(e) => {
                        this.context_work.errors.insert(identity, e.to_string());
                    }
                }
                cx.notify();
            });
        });
        self.context_work.tasks.insert(key, task);
    }
    fn locate_context(&mut self, location: Location, window: &mut Window, cx: &mut Context<Self>) {
        self.context_work.history.push((
            self.context_work.location.clone(),
            window.focused(cx),
            self.context_work.scroll.offset(),
        ));
        self.context_work.location = location;
        self.context_work.scroll.set_offset(point(px(0.), px(0.)));
        self.context_work.focus.focus(window, cx);
        cx.notify();
    }
    pub(in crate::workspace) fn close_context(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.computer
            .update(cx, |computer, cx| computer.present(false, cx));
        if self.panel == Some(Panel::Settings) {
            self.panel = self.context_work.settings_return.take();
        } else {
            self.panel = None;
        }
        if let Some(focus) = self.context_work.return_focus.take() {
            focus.focus(window, cx);
        } else {
            self.composer
                .read(cx)
                .input
                .clone()
                .update(cx, |input, cx| input.focus(window, cx));
        }
        cx.notify();
    }
    pub(in crate::workspace) fn context_back(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.context_work.viewer.is_empty() {
            self.focus_back(window, cx);
            return;
        }
        if self.panel == Some(Panel::Settings) {
            self.close_context(window, cx);
            return;
        }
        if let Some((location, focus, scroll)) = self.context_work.history.pop() {
            self.context_work.location = location;
            self.context_work.scroll.set_offset(scroll);
            if let Some(focus) = focus {
                focus.focus(window, cx);
            } else {
                self.context_work.focus.focus(window, cx);
            }
            cx.notify();
        } else {
            self.close_context(window, cx);
        }
    }
    pub(in crate::workspace) fn open_settings(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.panel != Some(Panel::Settings) {
            self.context_work.settings_return = self.panel;
            self.context_work.return_focus = window.focused(cx);
        }
        self.panel = Some(Panel::Settings);
        if !self.context_work.fields.contains_key("settings-search") {
            self.set_context_field("settings-search", "", window, cx);
        }
        self.context_work.focus.focus(window, cx);
        cx.notify();
    }
    fn learning_context(&self) -> Option<Value> {
        let thread = &self.value()["thread"];
        let agent = rows(thread, "member_agent_ids").first()?;
        Some(json!({"agent_id":agent,"thread_id":thread["id"]}))
    }
    fn resource_status(&self, key: &str, _cx: &mut Context<Self>) -> Option<AnyElement> {
        let p = Palette::new(self.store.dark());
        if let Some(error) = self.context_work.errors.get(key) {
            return Some(
                div()
                    .id("context-read-error")
                    .role(Role::Alert)
                    .child(caption(error.clone(), p))
                    .into_any_element(),
            );
        }
        (!self.context_work.resources.contains_key(key))
            .then(|| caption("Loading…", p).into_any_element())
    }
}
