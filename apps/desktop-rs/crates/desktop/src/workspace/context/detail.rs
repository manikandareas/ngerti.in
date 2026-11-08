use super::*;
use crate::storage::Operation;
use gpui_kit::component::input::{Input, Textarea};

impl Workspace {
    pub(in crate::workspace) fn context_nested(&self) -> bool {
        self.context_work.location != Location::Overview
    }
    pub(in crate::workspace) fn context_title(&self) -> String {
        match &self.context_work.location {
            Location::Files => "Working files".into(),
            Location::Apps => "Apps".into(),
            Location::Profile => "Agent settings".into(),
            Location::Skills => "Skills".into(),
            Location::Member(id) => self
                .agents
                .iter()
                .find(|a| a["id"] == *id)
                .map(|a| text(a, "name"))
                .unwrap_or("Member")
                .into(),
            Location::Goal(_) => "Goal".into(),
            Location::Routine(_) => "Routine".into(),
            Location::Artifact(_) => "Info file".into(),
            _ => String::new(),
        }
    }
    pub(in crate::workspace) fn context_body(&self, cx: &mut Context<Self>) -> AnyElement {
        match &self.context_work.location {
            Location::Files => self.working_files(cx),
            Location::Apps => self.apps_view(cx),
            Location::Skills => self.skills_view(cx),
            Location::Artifact(id) => self.artifact_info(id, cx),
            Location::Goal(id) => self.responsibility_view("goals", id, cx),
            Location::Routine(id) => self.responsibility_view("routines", id, cx),
            Location::Profile => self.profile_form(cx),
            Location::Member(id) => {
                let p = Palette::new(self.store.dark());
                let member = self.agents.iter().find(|a| a["id"] == *id);
                div().flex().flex_col().gap(ui(16.))
                    .child(caption(member.map(|a|text(a,"soul")).unwrap_or("Member unavailable").to_owned(),p))
                    .child(caption("This is a group profile. Direct-message history, memory, and files stay private.",p)).into_any_element()
            }
            _ if self.panel == Some(Panel::Library) => self.library_view(cx),
            _ if self.panel == Some(Panel::Computer) => self.computer.clone().into_any_element(),
            _ => self.detail_overview(cx),
        }
    }
    fn detail_overview(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut content = div().flex().flex_col().gap(ui(28.));
        for (field, title, empty) in [
            (
                "goals",
                "Goals",
                "No goals yet. Tell your agent what you want to work on.",
            ),
            (
                "routines",
                "Routine",
                "No routines yet. Ask your agent to schedule a task.",
            ),
        ] {
            let mut section = div().flex().flex_col().gap(ui(12.)).child(
                div()
                    .text_size(ui(16.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child(title),
            );
            if rows(self.value(), field).is_empty() {
                section = section.child(caption(empty, p));
            }
            for value in rows(self.value(), field) {
                let id = text(value, "id").to_owned();
                let name = value["title"]
                    .as_str()
                    .or(value["name"].as_str())
                    .or(value["instruction"].as_str())
                    .unwrap_or(title)
                    .to_owned();
                let hint = if field == "goals" {
                    text(value, "progress").to_owned()
                } else {
                    format!("{} · {}", text(value, "state"), text(value, "timezone"))
                };
                let goal = field == "goals";
                section = section.child(
                    button(
                        SharedString::from(format!("responsibility:{id}")),
                        "",
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .accessibility_label(name.clone())
                    .w_full()
                    .h_auto()
                    .justify_start()
                    .p(ui(12.))
                    .rounded(ui_px(12., cx))
                    .gap(ui(12.))
                    .child(glyph(
                        if goal { "Target02Icon" } else { "Clock01Icon" },
                        20.,
                        p,
                    ))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .text_left()
                            .child(div().child(name))
                            .child(caption(hint, p)),
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.locate_context(
                            if goal {
                                Location::Goal(id.clone())
                            } else {
                                Location::Routine(id.clone())
                            },
                            window,
                            cx,
                        )
                    })),
                );
            }
            content = content.child(section);
        }
        let thread = &self.value()["thread"];
        if thread["type"] == "group" {
            let mut members = div().flex().flex_col().gap(ui(10.)).child(
                div()
                    .text_size(ui(16.))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child("Members"),
            );
            for agent in self
                .agents
                .iter()
                .filter(|a| rows(thread, "member_agent_ids").contains(&a["id"]))
            {
                let id = text(agent, "id").to_owned();
                members = members.child(
                    button(
                        SharedString::from(format!("member:{id}")),
                        text(agent, "name").to_owned(),
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .w_full()
                    .justify_start()
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.locate_context(Location::Member(id.clone()), window, cx)
                    })),
                );
            }
            content = content.child(members).child(self.group_configuration(cx));
        } else {
            content = content.child(
                button("agent-settings", "Agent settings", ButtonKind::Ghost, p, cx)
                    .w_full()
                    .justify_start()
                    .on_click(cx.listener(|this, _, window, cx| this.open_profile(window, cx))),
            );
        }
        content
            .child(
                button("context-apps", "Apps", ButtonKind::Ghost, p, cx)
                    .w_full()
                    .justify_start()
                    .on_click(cx.listener(|this, _, window, cx| this.open_apps(window, cx))),
            )
            .into_any_element()
    }
    fn responsibility_view(&self, field: &str, id: &str, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let Some(value) = rows(self.value(), field).iter().find(|v| v["id"] == id) else {
            return caption("This responsibility is no longer available.", p).into_any_element();
        };
        let goal = field == "goals";
        let title = value["title"]
            .as_str()
            .or(value["name"].as_str())
            .unwrap_or("Routine");
        let mut content = div().flex().flex_col().gap(ui(20.)).child(
            div()
                .text_size(ui(20.))
                .font_weight(FontWeight::SEMIBOLD)
                .child(title.to_owned()),
        );
        for key in if goal {
            vec!["objective", "progress", "state", "work_state"]
        } else {
            vec!["instruction", "state", "timezone", "next_run_at"]
        } {
            if !text(value, key).is_empty() {
                content = content.child(caption(text(value, key).to_owned(), p));
            }
        }
        let mut controls = div().flex().gap(ui(8.)).flex_wrap();
        if !matches!(text(value, "state"), "stopped" | "completed") {
            for (state, label) in if value["state"] == "active" {
                vec![("paused", "Pause"), ("stopped", "Stop responsibility")]
            } else {
                vec![("active", "Resume"), ("stopped", "Stop responsibility")]
            } {
                let value = value.clone();
                let field = field.to_owned();
                controls = controls.child(
                    button(
                        SharedString::from(format!("responsibility-{state}")),
                        label,
                        ButtonKind::Outline,
                        p,
                        cx,
                    )
                    .disabled_state(self.busy, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let id = text(&value, "id");
                        let body = if goal {
                            json!({"state":state})
                        } else {
                            json!({"state":state,"expected_revision":value["revision"]})
                        };
                        this.dispatch(
                            format!("{state}:{id}"),
                            Operation::command(
                                format!("/v1/{field}/{id}/control"),
                                body,
                                this.selected,
                            ),
                            window,
                            cx,
                        );
                    })),
                );
            }
        }
        content=content.child(controls).child(caption("Stopping a responsibility also stops its continuation. Stop run leaves future work intact.",p));
        if goal && value["scope"] == "group" {
            let mut assignment = div().flex().flex_col().gap(ui(8.)).child("Coordinator");
            for agent in self
                .agents
                .iter()
                .filter(|a| rows(&self.value()["thread"], "member_agent_ids").contains(&a["id"]))
            {
                let value = value.clone();
                let agent = agent.clone();
                assignment = assignment.child(
                    button(
                        SharedString::from(format!("assign:{}", text(&agent, "id"))),
                        text(&agent, "name").to_owned(), ButtonKind::Ghost, p, cx,
                    ).disabled_state(self.busy || value["coordinator_agent_id"] == agent["id"], p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let id = text(&value, "id");
                        this.dispatch(
                            format!("assign:{id}"),
                            Operation::command(
                                format!("/v1/goals/{id}/assignment"),
                                json!({"expected_revision": value["revision"], "agent_id": agent["id"]}),
                                this.selected,
                            ),
                            window, cx,
                        );
                    })),
                );
            }
            content = content.child(assignment);
        }
        content = content.child(
            div()
                .text_size(ui(16.))
                .font_weight(FontWeight::SEMIBOLD)
                .child(if goal { "Activity" } else { "Run history" }),
        );
        for run in rows(self.value(), "runs")
            .iter()
            .filter(|r| r[if goal { "goal_id" } else { "routine_id" }] == id)
        {
            content = content.child(caption(
                format!("{} · {}", text(run, "status"), text(run, "created_at")),
                p,
            ));
        }
        for artifact in rows(self.value(), "artifacts")
            .iter()
            .filter(|a| rows(value, "evidence_artifact_ids").contains(&a["id"]))
        {
            let artifact = artifact.clone();
            content = content.child(
                button(
                    SharedString::from(format!("evidence:{}", text(&artifact, "id"))),
                    text(&artifact, "name").to_owned(),
                    ButtonKind::Ghost,
                    p,
                    cx,
                )
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.open_artifact(artifact.clone(), window, cx)
                })),
            );
        }
        content.into_any_element()
    }
    fn open_profile(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(agent) = self.selected_agent().cloned() else {
            return;
        };
        self.context_work.form = Some(("agent".into(), agent.clone()));
        for key in ["name", "soul", "instructions"] {
            if key == "name" {
                self.set_context_field(key, text(&agent, key), window, cx);
            } else {
                self.set_context_textarea(key, text(&agent, key), window, cx);
            }
        }
        self.locate_context(Location::Profile, window, cx);
    }
    pub(in crate::workspace) fn set_context_field(
        &mut self,
        key: &str,
        value: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let value = value.to_owned();
        let input = cx.new(|cx| InputState::new(window, cx).default_value(value));
        let observer = cx.observe(&input, |_, _, cx| cx.notify());
        self.context_work
            .field_observers
            .insert(key.into(), observer);
        self.context_work.fields.insert(key.into(), input);
    }
    fn profile_form(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut content = div().flex().flex_col().gap(ui(16.));
        for (key, label) in [
            ("name", "Name"),
            ("soul", "Profile"),
            ("instructions", "Instructions"),
        ] {
            if let Some(input) = self.context_work.textareas.get(key) {
                content = content.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(ui(8.))
                        .child(label)
                        .child(Textarea::new(input).aria_label(label)),
                );
            } else if let Some(input) = self.context_work.fields.get(key) {
                content = content.child(
                    div()
                        .flex()
                        .flex_col()
                        .gap(ui(8.))
                        .child(label)
                        .child(Input::new(input).aria_label(label)),
                );
            }
        }
        content = content.child(
            button("save-profile", "Save", ButtonKind::Primary, p, cx)
                .disabled_state(self.busy, p)
                .on_click(cx.listener(|this, _, window, cx| {
                    let Some((_, agent)) = this.context_work.form.clone() else {
                        return;
                    };
                    let mut changes = json!({});
                    for key in ["name", "soul", "instructions"] {
                        changes[key] = json!(this.context_field_value(key, cx));
                    }
                    let id = text(&agent, "id");
                    this.dispatch(
                        format!("profile:{id}"),
                        Operation::command(
                            format!("/v1/agents/{id}/configuration"),
                            json!({"expected_revision":agent["revision"],"changes":changes}),
                            this.selected,
                        ),
                        window,
                        cx,
                    );
                })),
        );
        content
            .child(
                self.selected_agent()
                    .map(|agent| self.contained_model_picker(agent, cx))
                    .unwrap_or_else(|| div().into_any_element()),
            )
            .into_any_element()
    }
    fn group_configuration(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let thread = self.value()["thread"].clone();
        let mut content = div()
            .flex()
            .flex_col()
            .gap(ui(8.))
            .child(caption(text(&thread, "shared_instructions").to_owned(), p));
        content = content.child(
            button(
                "edit-group",
                "Edit shared directions…",
                ButtonKind::Ghost,
                p,
                cx,
            )
            .on_click(cx.listener(|this, _, window, cx| {
                let thread = this.value()["thread"].clone();
                this.set_context_textarea(
                    "shared_instructions",
                    text(&thread, "shared_instructions"),
                    window,
                    cx,
                );
                this.group_members = rows(&thread, "member_agent_ids")
                    .iter()
                    .filter_map(Value::as_str)
                    .filter_map(|id| id.parse().ok())
                    .collect();
                this.context_work.form = Some(("group".into(), thread));
                cx.notify();
            })),
        );
        if let Some((kind, revision)) = &self.context_work.form
            && kind == "group"
        {
            let revision = revision.clone();
            if let Some(input) = self.context_work.textareas.get("shared_instructions") {
                content = content.child(Textarea::new(input).aria_label("Shared directions"))
                    .child(
                        button("save-directions", "Save directions", ButtonKind::Primary, p, cx)
                            .disabled_state(self.busy, p)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let Some(input) = this.context_work.textareas.get("shared_instructions") else { return; };
                                let id = text(&revision, "id");
                                this.dispatch(
                                    format!("group-config:{id}"),
                                    Operation::command(
                                        format!("/v1/groups/{id}/configuration"),
                                        json!({
                                            "expected_revision": revision["revision"],
                                            "changes": {"shared_instructions": input.read(cx).value().to_string()}
                                        }),
                                        this.selected,
                                    ),
                                    window, cx,
                                );
                            })),
                    );
            }
        }
        if let Some((kind, revision)) = &self.context_work.form
            && kind == "group"
        {
            for agent in &self.agents {
                let Some(id) = text(agent, "id").parse::<Uuid>().ok() else {
                    continue;
                };
                content = content.child(
                    gpui_kit::component::checkbox::Checkbox::new(SharedString::from(format!(
                        "membership:{id}"
                    )))
                    .label(text(agent, "name").to_owned())
                    .checked(self.group_members.contains(&id))
                    .on_click(cx.listener(move |this, checked, _, cx| {
                        this.group_members.retain(|value| *value != id);
                        if *checked {
                            this.group_members.push(id);
                        }
                        cx.notify();
                    })),
                );
            }
            let revision = revision.clone();
            content = content.child(
                button("save-members", "Save members", ButtonKind::Outline, p, cx)
                    .disabled_state(self.busy || self.group_members.is_empty(), p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let id = text(&revision, "id");
                        this.dispatch(
                            format!("membership:{id}"),
                            Operation::command(
                                format!("/v1/groups/{id}/membership"),
                                json!({"expected_revision": revision["revision"], "member_agent_ids": this.group_members}),
                                this.selected,
                            ),
                            window, cx,
                        );
                    })),
            );
        }
        content.into_any_element()
    }
}
