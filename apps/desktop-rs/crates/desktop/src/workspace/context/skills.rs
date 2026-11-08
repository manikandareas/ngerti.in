use super::*;
use crate::storage::Operation;
use gpui_kit::component::input::{Input, Textarea, TextareaState};
impl Workspace {
    pub(super) fn set_context_textarea(
        &mut self,
        key: &str,
        value: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let value = value.to_owned();
        let input = cx.new(|cx| TextareaState::new(window, cx).default_value(value).rows(5));
        self.context_work.textareas.insert(key.into(), input);
    }
    pub(super) fn context_field_value(&self, key: &str, cx: &App) -> String {
        if let Some(input) = self.context_work.textareas.get(key) {
            input.read(cx).value().to_string()
        } else {
            self.context_work
                .fields
                .get(key)
                .map(|input| input.read(cx).value().to_string())
                .unwrap_or_default()
        }
    }
    pub(in crate::workspace) fn skills_view(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let mut view = div().flex().flex_col().gap(ui(16.));
        if let Some(state) = self.resource_status("skills", cx) {
            view = view.child(state);
        }
        let value = self
            .context_work
            .resources
            .get("skills")
            .unwrap_or(&Value::Null);
        for (field, title) in [
            ("harness", "Inherited skills"),
            ("native_catalog", "Native catalog"),
            ("application", "App-owned skills"),
        ] {
            view = view.child(div().font_weight(FontWeight::SEMIBOLD).child(title));
            for skill in rows(value, field) {
                view = view.child(caption(
                    format!("{} · {}", text(skill, "name"), text(skill, "description")),
                    p,
                ));
                if field == "application" {
                    let read = skill.clone();
                    let assignment = skill.clone();
                    view = view
                        .child(
                            button(
                                SharedString::from(format!("read-skill:{}", text(skill, "id"))),
                                "View package…",
                                ButtonKind::Outline,
                                p,
                                cx,
                            )
                            .on_click(cx.listener(
                                move |this, _, window, cx| {
                                    this.provider_operation(
                                        "/v1/learning/skills/read".into(),
                                        json!({
                                            "skill_id": read["id"],
                                            "version": read["revision"],
                                            "context": this.learning_context()
                                        }),
                                        None,
                                        window,
                                        cx,
                                    );
                                },
                            )),
                        )
                        .child(
                            button(
                                SharedString::from(format!("toggle-skill:{}", text(skill, "id"))),
                                if skill["assignment"]["enabled"] == true {
                                    "Disable skill"
                                } else {
                                    "Enable skill"
                                },
                                ButtonKind::Ghost,
                                p,
                                cx,
                            )
                            .disabled_state(self.busy, p)
                            .on_click(cx.listener(
                                move |this, _, window, cx| {
                                    let version = assignment["assignment"]["version"]
                                        .as_u64()
                                        .or(assignment["revision"].as_u64())
                                        .unwrap_or(1);
                                    this.assign_skill(
                                        &assignment,
                                        version,
                                        assignment["assignment"]["enabled"] != true,
                                        window,
                                        cx,
                                    );
                                },
                            )),
                        );
                }
            }
            if rows(value, field).is_empty() {
                view = view.child(caption("No skills available in this context.", p));
            }
        }
        view = view.child(caption(
            format!(
                "Folder discovery: {} · Native discovery: {}",
                text(value, "harness_state"),
                text(value, "native_state")
            ),
            p,
        ));
        view = view.child(
            button(
                "create-app-skill",
                "Create app-owned skill…",
                ButtonKind::Outline,
                p,
                cx,
            )
            .on_click(cx.listener(|this, _, window, cx| {
                this.context_work.form = Some(("skill-new".into(), json!({})));
                this.set_context_field("skill-name", "", window, cx);
                this.set_context_field("skill-description", "", window, cx);
                this.set_context_textarea("skill-instructions", "", window, cx);
                cx.notify();
            })),
        );
        if let Some((kind, skill)) = &self.context_work.form
            && kind.starts_with("skill-")
        {
            let mut editor = div().flex().flex_col().gap(ui(12.));
            if let Some(input) = self.context_work.fields.get("skill-name") {
                editor = editor
                    .child("Name")
                    .child(Input::new(input).aria_label("Skill name"));
            }
            if let Some(input) = self.context_work.fields.get("skill-description") {
                editor = editor
                    .child("Description")
                    .child(Input::new(input).aria_label("Skill description"));
            }
            if let Some(input) = self.context_work.textareas.get("skill-instructions") {
                editor = editor
                    .child("Instructions")
                    .child(Textarea::new(input).aria_label("Skill instructions"));
            }
            let skill = skill.clone();
            let new = kind == "skill-new";
            editor = editor.child(
                button("save-skill", "Save package", ButtonKind::Primary, p, cx)
                    .disabled_state(self.busy, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let description = this.context_field_value("skill-description", cx);
                        let instructions = this.context_field_value("skill-instructions", cx);
                        let assets = this.context_work.resources.get("skill-revision")
                            .and_then(|v| v["revision"]["package"]["assets"].as_array())
                            .cloned().unwrap_or_default();
                        let package = json!({
                            "description": description,
                            "instructions": instructions,
                            "assets": assets
                        });
                        let (route, body) = if new {
                            ("create", json!({
                                "name": this.context_field_value("skill-name", cx),
                                "visibility": if this.value()["thread"]["type"] == "group" { "group" } else { "dm_private" },
                                "package": package,
                                "context": this.learning_context()
                            }))
                        } else {
                            ("revise", json!({
                                "skill_id": skill["id"],
                                "expected_revision": skill["revision"],
                                "package": package,
                                "context": this.learning_context()
                            }))
                        };
                        this.dispatch(
                            "skill-package".into(),
                            Operation::command(format!("/v1/learning/skills/{route}"), body, this.selected),
                            window, cx,
                        );
                    })),
            );
            if !new {
                if let Some(input) = self.context_work.fields.get("skill-version") {
                    editor = editor
                        .child("Pinned version")
                        .child(Input::new(input).aria_label("Skill version"));
                }
                let saved = self.context_work.form.as_ref().unwrap().1.clone();
                editor = editor.child(
                    button(
                        "pin-skill-version",
                        "Use this version",
                        ButtonKind::Outline,
                        p,
                        cx,
                    )
                    .disabled_state(self.busy, p)
                    .on_click(cx.listener(move |this, _, window, cx| {
                        if let Ok(version) =
                            this.context_field_value("skill-version", cx).parse::<u64>()
                        {
                            this.assign_skill(&saved, version, true, window, cx);
                        }
                    })),
                );
            }
            view = view.child(editor);
        }
        view.child(caption("Inherited packages stay readonly. Disabling or pinning an earlier app-owned version retains its provenance and history.",p)).into_any_element()
    }
    fn assign_skill(
        &mut self,
        skill: &Value,
        version: u64,
        enabled: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let inventory = self
            .context_work
            .resources
            .get("skills")
            .unwrap_or(&Value::Null);
        let current = rows(inventory, "application")
            .iter()
            .find(|v| v["id"] == skill["id"])
            .unwrap_or(skill);
        let revision = current["assignment"]["revision"].as_u64().unwrap_or(0);
        self.dispatch(
            format!("skill-assign:{}", text(skill, "id")),
            Operation::command(
                "/v1/learning/skills/assign".into(),
                json!({
                    "skill_id": skill["id"], "version": version,
                    "expected_revision": revision, "enabled": enabled,
                    "context": self.learning_context()
                }),
                self.selected,
            ),
            window,
            cx,
        );
    }
}
