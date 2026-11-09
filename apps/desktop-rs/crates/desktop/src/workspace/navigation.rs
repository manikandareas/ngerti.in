use super::*;
use crate::ui::{
    controls::{ButtonKind, ProductButtonStyle, button, caption},
    theme::{Palette, ui, ui_px},
    workspace::{action, glyph},
};
use gpui_kit::{
    component::{input::Input, menu::DropdownMenu, skeleton::Skeleton},
    prelude::FluentBuilder as _,
};
use ngertiin_client::{rows, text};

impl Workspace {
    pub(super) fn label(&self, thread: &Value) -> String {
        thread["name"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| {
                rows(thread, "member_agent_ids")
                    .first()
                    .and_then(|id| self.agents.iter().find(|a| a["id"] == *id))
                    .map(|a| text(a, "name").into())
            })
            .unwrap_or_else(|| "Percakapan".into())
    }
    fn conversation_subtitle(&self, thread: &Value) -> String {
        let priority = |activity: &Value| {
            if activity["waiting_for_user"] == true {
                4
            } else {
                match text(activity, "status") {
                    "running" | "dispatching" | "cancel_requested" => 3,
                    "unknown" => 2,
                    "queued" => 1,
                    _ => 0,
                }
            }
        };
        let live = self
            .activities
            .iter()
            .filter(|item| {
                crate::models::activity::in_thread(item, thread, text(item, "agent_id"))
                    && rows(thread, "member_agent_ids").contains(&item["agent_id"])
                    && priority(item) > 0
            })
            .max_by_key(|item| priority(item));
        let (label, agent) = if let Some(live) = live {
            let label = if live["waiting_for_user"] == true {
                "Waiting for your answer"
            } else {
                match text(live, "status") {
                    "queued" => "Queued",
                    "unknown" => "Checking the result…",
                    "cancel_requested" => "Stopping…",
                    _ => match text(live, "activity") {
                        "reading" => "Reading…",
                        "searching" => "Searching…",
                        "working" => "Working…",
                        _ => "Thinking…",
                    },
                }
            };
            (label.to_owned(), text(live, "agent_id"))
        } else {
            let Some(message) = self.previews.get(text(thread, "id")) else {
                return "Belum ada pesan".into();
            };
            let content = text(message, "text");
            let content = if content.is_empty() {
                if message["has_attachments"] == true {
                    "Lampiran"
                } else {
                    "Belum ada pesan"
                }
            } else {
                content
            };
            if message["author"] == "user" {
                return format!("Kamu: {content}");
            }
            (content.to_owned(), text(message, "author_agent_id"))
        };
        if thread["type"] == "group"
            && let Some(agent) = self.agents.iter().find(|item| item["id"] == agent)
        {
            format!("{}: {label}", text(agent, "name"))
        } else {
            label
        }
    }
    pub(super) fn sidebar_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let query = self.search.read(cx).value().to_lowercase();
        let search = if self.search_open || !query.is_empty() {
            div()
                .flex_1()
                .min_w_0()
                .child(
                    Input::new(&self.search)
                        .appearance(false)
                        .bordered(false)
                        .h(ui(32.))
                        .text_size(ui(13.))
                        .prefix(glyph("Search01Icon", 16., p))
                        .aria_label("Search conversations"),
                )
                .into_any_element()
        } else {
            action(
                "search-conversations",
                "Search conversations",
                "Search01Icon",
                p,
                cx,
            )
            .bg(p.color("secondary"))
            .on_click(cx.listener(|this, _, window, cx| {
                this.search_open = true;
                this.search.update(cx, |input, cx| input.focus(window, cx));
                cx.notify();
            }))
            .into_any_element()
        };
        let busy = self.busy;
        let heading = div()
            .flex()
            .items_center()
            .justify_end()
            .gap(ui(8.))
            .h(ui(36.))
            .mb(ui(8.))
            .child(search)
            .child(
                action("create-contact", "Buat baru", "Add01Icon", p, cx)
                    .bg(p.color("secondary"))
                    .disabled_state(busy, p)
                    .dropdown_menu(move |menu, _, _| {
                        menu.menu_with_disabled("Create agent", Box::new(CreateAgent), busy)
                            .menu_with_disabled("Create group…", Box::new(CreateGroup), busy)
                    }),
            );
        let mut list = div()
            .id("conversation-navigation")
            .role(Role::List)
            .aria_label("Percakapan")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll();
        if self.loading && self.threads.is_empty() {
            for _ in 0..6 {
                list = list.child(contact_skeleton(p));
            }
        }
        for thread in &self.threads {
            let label = self.label(thread);
            if !label.to_lowercase().contains(&query) {
                continue;
            }
            let Ok(id) = text(thread, "id").parse::<Uuid>() else {
                continue;
            };
            let members: Vec<_> = rows(thread, "member_agent_ids")
                .iter()
                .filter_map(Value::as_str)
                .take(2)
                .collect();
            let ready = members
                .iter()
                .all(|agent| self.ready_portraits.contains(&format!("nav:{id}:{agent}")));
            let preview = self.conversation_subtitle(thread);
            let selected = self.selected == Some(id);
            let contact = button(
                SharedString::from(format!("thread:{id}")),
                "",
                ButtonKind::Ghost,
                p,
                cx,
            )
            .accessibility_label(format!("{label} {preview}"))
            .w_full()
            .h_auto()
            .min_h(ui(60.))
            .px(ui(8.))
            .py(ui(8.))
            .rounded(ui_px(10., cx))
            .gap(ui(12.))
            .justify_start()
            .when(selected, |b| b.bg(p.color("secondary")))
            .child(
                div()
                    .w_full()
                    .flex()
                    .items_center()
                    .gap(ui(12.))
                    .child(self.thread_portrait(thread, "nav", cx))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .text_left()
                            .child(
                                div()
                                    .text_size(ui(14.))
                                    .line_height(ui(20.))
                                    .font_weight(FontWeight::MEDIUM)
                                    .truncate()
                                    .child(label),
                            )
                            .child(
                                div()
                                    .mt(ui(2.))
                                    .font_weight(FontWeight::NORMAL)
                                    .text_size(ui(13.))
                                    .line_height(ui(18.))
                                    .text_color(p.color("muted-foreground"))
                                    .truncate()
                                    .child(preview),
                            ),
                    ),
            )
            .disabled_state(!ready, p)
            .on_click(cx.listener(move |this, _, window, cx| this.select(id, window, cx)));
            list = list.child(
                div()
                    .relative()
                    .my(ui(2.))
                    .child(div().when(!ready, |v| v.opacity(0.01)).child(contact))
                    .when(!ready, |v| {
                        v.child(div().absolute().inset_0().child(contact_skeleton(p)))
                    }),
            );
        }
        if self.checked && self.threads.is_empty() {
            list = list.child(caption("Belum ada percakapan", p)).child(
                button(
                    "setup-workspace",
                    "Mulai bersama Tobi",
                    ButtonKind::Default,
                    p,
                    cx,
                )
                .on_click(cx.listener(|this, _, window, cx| {
                    this.dispatch(
                        "setup".into(),
                        crate::storage::Operation::command(
                            "/v1/setup".into(),
                            serde_json::json!({}),
                            None,
                        ),
                        window,
                        cx,
                    )
                })),
            );
        }
        let footer = div()
            .flex()
            .items_center()
            .gap(ui(8.))
            .pt(ui(16.))
            .pb(ui(4.))
            .child(
                action("workspace-settings", "Pengaturan", "UserIcon", p, cx)
                    .size(ui(36.))
                    .rounded_full()
                    .bg(p.color("card"))
                    .on_click(cx.listener(|this, _, window, cx| {
                        window.close_sheet(cx);
                        this.open_settings(window, cx);
                    })),
            )
            .child(
                button("app-connections", "", ButtonKind::Ghost, p, cx)
                    .accessibility_label("Hubungkan aplikasi")
                    .h(ui(36.))
                    .flex_1()
                    .min_w_0()
                    .rounded_full()
                    .bg(p.color("card"))
                    .gap(ui(8.))
                    .text_size(ui(13.))
                    .child(
                        div()
                            .w_full()
                            .min_w_0()
                            .flex()
                            .items_center()
                            .justify_center()
                            .gap(ui(8.))
                            .child(glyph("Plug01Icon", 16., p))
                            .child(
                                div()
                                    .min_w_0()
                                    .truncate()
                                    .text_size(ui(13.))
                                    .child("Hubungkan aplikasi"),
                            ),
                    )
                    .on_click(cx.listener(|this, _, window, cx| {
                        window.close_sheet(cx);
                        this.open_apps(window, cx);
                    })),
            );
        div()
            .w_full()
            .min_w_0()
            .h_full()
            .min_h_0()
            .overflow_hidden()
            .flex_shrink_0()
            .p(ui(12.))
            .flex()
            .flex_col()
            .child(heading)
            .child(list)
            .child(footer)
            .into_any_element()
    }
    pub(super) fn thread_portrait(&self, thread: &Value, role: &str, cx: &App) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let id = text(thread, "id");
        let group = thread["type"] == "group";
        let nav = role == "nav";
        let size = if nav {
            44.
        } else if role == "route" {
            32.
        } else {
            24.
        };
        let members: Vec<_> = rows(thread, "member_agent_ids")
            .iter()
            .filter_map(Value::as_str)
            .take(2)
            .collect();
        let mut view = div()
            .relative()
            .size(ui(size))
            .flex_shrink_0()
            .flex()
            .items_center()
            .justify_center();
        if group {
            for (ix, agent) in members.iter().enumerate() {
                if let Some((_, portrait)) = self.portraits.get(&format!("{role}:{id}:{agent}")) {
                    view = view.child(
                        div()
                            .absolute()
                            .left(ui(if ix == 0 {
                                0.
                            } else {
                                if nav { 20. } else { 10. }
                            }))
                            .child(portrait.clone()),
                    );
                }
            }
            let count = rows(thread, "member_agent_ids").len();
            if nav && count > 2 {
                view = view.child(
                    div()
                        .absolute()
                        .right(ui(-4.))
                        .bottom(ui(4.))
                        .size(ui(16.))
                        .rounded_full()
                        .bg(p.color("secondary"))
                        .text_size(ui(9.))
                        .flex()
                        .items_center()
                        .justify_center()
                        .child(format!("+{}", count - 2)),
                );
            }
        } else if let Some(agent) = members.first()
            && let Some((_, portrait)) = self.portraits.get(&format!("{role}:{id}:{agent}"))
        {
            view = view.child(portrait.clone());
        }
        let _ = cx;
        view.into_any_element()
    }
}
fn contact_skeleton(p: Palette) -> AnyElement {
    div()
        .h(ui(60.))
        .px(ui(8.))
        .py(ui(8.))
        .flex()
        .items_center()
        .gap(ui(12.))
        .child(Skeleton::new().size(ui(44.)).rounded_full())
        .child(
            div()
                .flex_1()
                .flex()
                .flex_col()
                .gap(ui(6.))
                .child(Skeleton::new().h(ui(14.)).w(ui(94.)))
                .child(Skeleton::new().h(ui(13.)).w_full()),
        )
        .bg(p.color("frame"))
        .into_any_element()
}

impl Workspace {
    pub(super) fn prepare_portraits(&mut self, cx: &mut Context<Self>) {
        let mut targets = vec![];
        for thread in &self.threads {
            let id = text(thread, "id");
            let group = thread["type"] == "group";
            for (index, agent) in rows(thread, "member_agent_ids")
                .iter()
                .filter_map(Value::as_str)
                .take(3)
                .enumerate()
            {
                if index < 2 {
                    targets.push((
                        format!("nav:{id}:{agent}"),
                        agent.to_owned(),
                        if group { 32. } else { 44. },
                        false,
                    ));
                }
                if self
                    .selected
                    .is_some_and(|selected| selected.to_string() == id)
                {
                    if index < 2 {
                        if self
                            .transcript
                            .iter()
                            .any(|row| matches!(row.kind, super::transcript::RowKind::Route(_)))
                        {
                            targets.push((
                                format!("route:{id}:{agent}"),
                                agent.to_owned(),
                                22.,
                                false,
                            ));
                        }
                        targets.push((
                            format!("header:{id}:{agent}"),
                            agent.to_owned(),
                            if group { 14. } else { 24. },
                            true,
                        ));
                    }
                    targets.push((
                        format!("hero:{id}:{agent}"),
                        agent.to_owned(),
                        if group { 64. } else { 96. },
                        true,
                    ));
                }
            }
        }
        if self.value()["thread"]["type"] == "group" {
            for row in &self.transcript {
                let agent = match &row.kind {
                    super::transcript::RowKind::Message { message, .. }
                        if message["author"] != "user" =>
                    {
                        text(message, "author_agent_id")
                    }
                    super::transcript::RowKind::Interaction { agent, .. } => agent,
                    super::transcript::RowKind::Run(run)
                    | super::transcript::RowKind::Computer(run) => text(run, "agent_id"),
                    _ => continue,
                };
                targets.push((
                    format!("message:{}:{agent}", row.id),
                    agent.to_owned(),
                    32.,
                    true,
                ));
            }
        }
        let retained: std::collections::BTreeSet<_> =
            targets.iter().map(|(key, _, _, _)| key.clone()).collect();
        self.portraits.retain(|key, _| retained.contains(key));
        self.portrait_observers
            .retain(|key, _| retained.contains(key));
        self.ready_portraits.retain(|key| retained.contains(key));
        self.avatar_activity.retain(|key, _| retained.contains(key));
        for (key, id, size, follow) in targets {
            let Some(agent) = self.agents.iter().find(|agent| agent["id"] == id) else {
                continue;
            };
            let config = agent["avatar_config"].clone();
            let fresh = self
                .portraits
                .get(&key)
                .is_none_or(|(old, _)| old != &config);
            if fresh {
                let recipe = serde_json::from_value(config.clone()).ok().or_else(|| {
                    ngertiin_avatar::AvatarConfig::default_agent(
                        &id,
                        agent["system_role"] == "tobi",
                    )
                    .ok()
                });
                let Some(recipe) = recipe else {
                    continue;
                };
                let portrait = AvatarPortrait::create(&self.animator, recipe, size, cx);
                portrait.update(cx, |view, _| view.follow_pointer = follow);
                self.ready_portraits.remove(&key);
                let identity = key.clone();
                let observer = cx.observe(&portrait, move |this, portrait, cx| {
                    if portrait.read(cx).is_settled()
                        && this.ready_portraits.insert(identity.clone())
                    {
                        cx.notify();
                    }
                });
                self.portrait_observers.insert(key.clone(), observer);
                self.portraits.insert(key.clone(), (config, portrait));
            }
            let thread_id = key.split(':').nth(1).unwrap_or_default();
            let conversation_portrait = !key.starts_with("message:") && !key.starts_with("route:");
            let run = rows(self.value(), "runs").iter().find(|run| {
                run["agent_id"] == id
                    && if conversation_portrait {
                        run["thread_id"] == thread_id
                    } else {
                        key == format!("message:run:{}:{id}", text(run, "id"))
                    }
                    && matches!(
                        text(run, "status"),
                        "running" | "dispatching" | "cancel_requested"
                    )
            });
            let live = self.activities.iter().find(|activity| {
                activity["agent_id"] == id
                    && conversation_portrait
                    && activity["thread_id"] == thread_id
                    && (activity["waiting_for_user"] == true
                        || matches!(
                            text(activity, "status"),
                            "running" | "dispatching" | "cancel_requested"
                        ))
            });
            let busy = run.is_some() || live.is_some();
            let waiting = live.is_some_and(|activity| activity["waiting_for_user"] == true)
                || run.is_some_and(|run| crate::models::activity::waiting(run, self.value()));
            if fresh || self.avatar_activity.get(&key) != Some(&(busy, waiting)) {
                if let Some((_, portrait)) = self.portraits.get(&key) {
                    portrait.update(cx, |view, cx| {
                        view.loading(busy && !waiting, cx);
                        view.state(
                            if waiting {
                                ngertiin_avatar::State::Listening
                            } else if busy {
                                ngertiin_avatar::State::Thinking
                            } else {
                                ngertiin_avatar::State::Idle
                            },
                            cx,
                        );
                    });
                }
                self.avatar_activity.insert(key, (busy, waiting));
            }
        }
    }
}
