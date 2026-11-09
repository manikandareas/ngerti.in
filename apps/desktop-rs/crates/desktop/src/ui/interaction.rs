//! Revision-bound editing and presentation; the caller owns dispatch/reconciliation.
mod details;
use crate::{
    models::message::*,
    ui::{
        controls::*,
        theme::{Palette, ui},
    },
};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::{
    component::{
        ActiveTheme, Disableable,
        checkbox::Checkbox,
        input::{InputEvent, Textarea, TextareaState},
        radio::{Radio, RadioGroup},
    },
    *,
};

#[derive(Clone)]
pub enum AnswerIntent {
    Reply(InteractionReply),
    Check { request_id: String, revision: u64 },
    Previous,
}
pub struct InteractionView {
    pub value: Interaction,
    pub time: PublicationTime,
    selected: Vec<String>,
    custom_selected: bool,
    custom: Option<Entity<TextareaState>>,
    subscription: Option<Subscription>,
    error: Option<String>,
    compact_history: bool,
    details: Option<serde_json::Value>,
    page: Option<(usize, usize)>,
}
impl EventEmitter<AnswerIntent> for InteractionView {}
impl InteractionView {
    pub fn new(value: Interaction, time: PublicationTime) -> Self {
        Self {
            value,
            time,
            selected: vec![],
            custom_selected: false,
            custom: None,
            subscription: None,
            error: None,
            compact_history: false,
            details: None,
            page: None,
        }
    }
    pub fn details(mut self, details: Option<serde_json::Value>) -> Self {
        self.details = details;
        self
    }
    pub fn page(mut self, page: Option<(usize, usize)>) -> Self {
        self.page = page;
        self
    }
    pub fn restore_answer(
        &mut self,
        answer: &AnswerValue,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.selected = answer.choices.clone();
        self.custom_selected = answer.text.is_some();
        self.prepare_input(window, cx);
        if let Some(input) = &self.custom {
            input.update(cx, |input, cx| {
                input.set_value(answer.text.clone().unwrap_or_default(), window, cx)
            });
        }
        cx.notify();
    }
    pub fn compact_history(mut self) -> Self {
        self.compact_history = true;
        self
    }
    pub fn reset(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        self.value.state = InteractionState::Current;
        self.selected.clear();
        self.custom_selected = self.value.choices.is_empty();
        self.error = None;
        if let Some(input) = &self.custom {
            input.update(cx, |input, cx| input.set_value("", window, cx));
        }
        cx.notify();
    }
    fn available(&self) -> bool {
        matches!(
            self.value.state,
            InteractionState::Current | InteractionState::Failed
        )
    }
    pub fn draft(&self, cx: &App) -> AnswerValue {
        AnswerValue {
            choices: self.selected.clone(),
            text: self
                .custom_selected
                .then(|| {
                    self.custom
                        .as_ref()
                        .map(|input| input.read(cx).value().to_string())
                })
                .flatten(),
        }
    }
    fn prepare_input(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.custom.is_some() || self.value.rules.custom == CustomAnswer::Disabled {
            return;
        }
        let input = cx.new(|cx| {
            TextareaState::new(window, cx)
                .placeholder("Other answer…")
                .auto_grow(1, 4)
        });
        self.subscription = Some(cx.subscribe(&input, |this, input, event: &InputEvent, cx| {
            if !this.available() {
                return;
            }
            let has_text = !input.read(cx).value().is_empty();
            if matches!(event, InputEvent::Focus) || matches!(event, InputEvent::Change) && has_text
            {
                this.custom_selected = true;
                if !this.value.multiple || this.value.rules.custom == CustomAnswer::Alternative {
                    this.selected.clear();
                }
            }
            if matches!(event, InputEvent::Change | InputEvent::Focus) {
                this.error = None;
                cx.notify();
            }
        }));
        self.custom = Some(input);
        self.custom_selected = self.value.choices.is_empty();
    }
    fn reply(
        &mut self,
        request_id: &str,
        revision: u64,
        window: &mut Window,
        cx: &mut Context<Self>,
        skip: bool,
    ) {
        let answer = if skip {
            AnswerValue::default()
        } else {
            self.draft(cx)
        };
        if let Some(input) = &self.custom {
            let composing = input.update(cx, |input, cx| {
                input.marked_text_range(window, cx).is_some()
            });
            if composing {
                return;
            }
        }
        match self
            .value
            .reply_at(request_id, revision, answer.choices, answer.text.as_deref())
        {
            Ok(reply) => cx.emit(AnswerIntent::Reply(reply)),
            Err(error) => {
                self.error = Some(error.into());
                cx.notify();
            }
        }
    }
    fn choose(&mut self, id: String, checked: bool, window: &mut Window, cx: &mut Context<Self>) {
        if !self.available() {
            return;
        }
        if !self.value.multiple {
            self.selected = vec![id];
        } else if checked {
            if !self.selected.contains(&id) {
                self.selected.push(id);
            }
        } else {
            self.selected.retain(|value| *value != id);
        }
        if !self.value.multiple || self.value.rules.custom == CustomAnswer::Alternative {
            self.custom_selected = false;
            if let Some(input) = &self.custom {
                input.update(cx, |input, cx| input.set_value("", window, cx));
            }
        }
        self.error = None;
        cx.notify();
    }
    fn choose_custom(&mut self, checked: bool, window: &mut Window, cx: &mut Context<Self>) {
        if !self.available() {
            return;
        }
        self.custom_selected = checked;
        if checked && (!self.value.multiple || self.value.rules.custom == CustomAnswer::Alternative)
        {
            self.selected.clear();
        }
        if let Some(input) = &self.custom {
            input.update(cx, |input, cx| {
                if checked {
                    input.focus(window, cx);
                } else {
                    input.set_value("", window, cx);
                }
            });
        }
        self.error = None;
        cx.notify();
    }
    fn navigate_choice(
        &mut self,
        index: usize,
        event: &KeyDownEvent,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if !self.available() || self.value.multiple {
            return;
        }
        let count = self.value.choices.len()
            + usize::from(self.value.rules.custom != CustomAnswer::Disabled);
        if count == 0 || index >= count {
            return;
        }
        let next = match event.keystroke.key.as_str() {
            "down" | "right" => (index + 1) % count,
            "up" | "left" => (index + count - 1) % count,
            "home" => 0,
            "end" => count - 1,
            _ => return,
        };
        window.prevent_default();
        cx.stop_propagation();
        if let Some(choice) = self.value.choices.get(next) {
            self.choose(choice.id.clone(), true, window, cx);
            for _ in next..index {
                window.focus_prev(cx);
            }
            for _ in index..next {
                window.focus_next(cx);
            }
        } else {
            self.choose_custom(true, window, cx);
            // The custom editor follows its radio in the same tab sequence.
            window.focus_prev(cx);
        }
    }
    fn response_feedback(&self, p: Palette, cx: &mut Context<Self>) -> Option<AnyElement> {
        if self.value.state == InteractionState::Current {
            return None;
        }
        let status = match &self.value.state {
            InteractionState::Current => None,
            InteractionState::Submitting => Some(("Sending response…", false)),
            InteractionState::Submitted(_) => Some(("Response submitted", false)),
            InteractionState::Resolved(_) => Some(("Request resolved", false)),
            InteractionState::Uncertain => Some((
                "Response not confirmed. Check its status before trying again.",
                true,
            )),
            InteractionState::Checking => Some(("Checking response status…", false)),
            InteractionState::Failed => Some((
                "Could not send the response. Your answer is retained; try again.",
                true,
            )),
            InteractionState::Expired => Some(("This request has expired", false)),
        };
        let mut view = div().flex().flex_col().gap(ui(6.));
        if let Some((label, error)) = status {
            view = view.child(
                div()
                    .id("interaction-status")
                    .role(if error { Role::Alert } else { Role::Status })
                    .aria_label(label)
                    .child(caption(label, p)),
            );
        }
        if self.value.state == InteractionState::Uncertain {
            let request_id = self.value.request_id.clone();
            let revision = self.value.revision;
            view = view.child(
                button(
                    "interaction-check",
                    "Check response status",
                    ButtonKind::Default,
                    p,
                    cx,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    if this.value.request_id != request_id
                        || this.value.revision != revision
                        || this.value.state != InteractionState::Uncertain
                    {
                        return;
                    }
                    this.value.state = InteractionState::Checking;
                    cx.emit(AnswerIntent::Check {
                        request_id: this.value.request_id.clone(),
                        revision: this.value.revision,
                    });
                    cx.notify();
                })),
            );
        }
        Some(view.into_any_element())
    }
    fn question_navigation(&self, p: Palette, cx: &mut Context<Self>) -> Option<Div> {
        let (index, total) = self.page.filter(|(_, total)| *total > 1)?;
        Some(
            div()
                .flex()
                .items_center()
                .gap(ui(8.))
                .child(
                    button("question-back", "Back", ButtonKind::Ghost, p, cx)
                        .disabled_state(index == 0 || !self.available(), p)
                        .on_click(cx.listener(|_, _, _, cx| cx.emit(AnswerIntent::Previous))),
                )
                .child(caption(format!("{} of {total}", index + 1), p)),
        )
    }
}
impl Render for InteractionView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let settled_history = self.compact_history
            && matches!(
                self.value.state,
                InteractionState::Resolved(_)
                    | InteractionState::Submitted(_)
                    | InteractionState::Expired
            );
        let composer_question =
            self.compact_history && !self.value.approval && self.value.choices.is_empty();
        if settled_history || composer_question {
            let bubble = div()
                .id("conversation-question")
                .role(Role::Group)
                .aria_label(self.value.question.clone())
                .max_w(ui(460.))
                .px(ui(12.))
                .py(ui(7.))
                .rounded(ui(18.))
                .bg(p.color("card"))
                .text_size(ui(15.))
                .line_height(ui(22.))
                .child(self.value.question.clone())
                .child(
                    div()
                        .flex()
                        .justify_end()
                        .child(super::message::clock(&self.time, p)),
                )
                .into_any_element();
            return div()
                .flex()
                .flex_col()
                .items_start()
                .gap(ui(6.))
                .child(bubble)
                .when(composer_question && !settled_history, |view| {
                    view.children(self.response_feedback(p, cx))
                })
                .when(composer_question && self.available(), |view| {
                    view.when_some(self.question_navigation(p, cx), |view, footer| {
                        view.child(footer)
                    })
                })
                .into_any_element();
        }
        self.prepare_input(window, cx);
        let available = self.available();
        let settled = match &self.value.state {
            InteractionState::Submitted(answer) | InteractionState::Resolved(answer) => {
                Some(answer.clone())
            }
            _ => None,
        };
        let mut view = div()
            .flex()
            .flex_col()
            .gap(ui(12.))
            .px(ui(18.))
            .pt(ui(17.))
            .pb(ui(15.))
            .rounded(ui(16.))
            .bg(p.color("popover"))
            .text_size(ui(14.))
            .line_height(ui(21.))
            .id("native-interaction")
            .role(Role::Group)
            .aria_label(self.value.question.clone())
            .child(
                div()
                    .text_size(ui(15.))
                    .line_height(ui(22.))
                    .font_weight(FontWeight::MEDIUM)
                    .child(self.value.question.clone()),
            );
        if self.compact_history {
            view = view.w(ui(460.)).max_w_full();
        }
        if let Some(details) = &self.details {
            view = view.child(details::view(details, p));
        }
        if self.value.approval {
            let mut actions = div()
                .flex()
                .justify_end()
                .flex_wrap()
                .gap(ui(8.))
                .mt(ui(6.));
            let mut choices = self.value.choices.clone();
            let allows = |choice: &Choice| {
                let label = format!("{} {}", choice.id, choice.label).to_lowercase();
                label.contains("allow") || label.contains("approve") || label.contains("accept")
            };
            choices.sort_by_key(&allows);
            for choice in choices {
                let request_id = self.value.request_id.clone();
                let revision = self.value.revision;
                let id = choice.id.clone();
                let kind = if allows(&choice) {
                    ButtonKind::Primary
                } else {
                    ButtonKind::Outline
                };
                actions = actions.child(
                    button(
                        SharedString::from(format!("approval:{id}")),
                        choice.label,
                        kind,
                        p,
                        cx,
                    )
                    .rounded(super::theme::ui_px(22., cx))
                    .h(ui(34.))
                    .px(ui(15.))
                    .disabled_state(!available, p)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        if let Ok(reply) =
                            this.value
                                .reply_at(&request_id, revision, vec![id.clone()], None)
                        {
                            cx.emit(AnswerIntent::Reply(reply));
                        }
                    })),
                );
            }
            view = view.child(actions);
        }
        if self.value.multiple
            && let Some(maximum) = self.value.rules.maximum
        {
            view = view.child(caption(format!("Choose up to {maximum} answers"), p));
        }
        if !self.value.approval && !self.value.multiple && !self.value.choices.is_empty() {
            let selected = if let Some(answer) = &settled {
                if answer.text.is_some() {
                    Some(self.value.choices.len())
                } else {
                    self.value
                        .choices
                        .iter()
                        .position(|choice| answer.choices.contains(&choice.id))
                }
            } else if self.custom_selected {
                Some(self.value.choices.len())
            } else {
                self.value
                    .choices
                    .iter()
                    .position(|choice| self.selected.contains(&choice.id))
            };
            let mut group = RadioGroup::new("interaction-options")
                .selected_index(selected)
                .disabled(!available);
            for (index, choice) in self.value.choices.iter().enumerate() {
                let mut radio = Radio::new(("choice", index))
                    .label(choice.label.clone())
                    .on_key_down(cx.listener(move |this, event, window, cx| {
                        this.navigate_choice(index, event, window, cx)
                    }));
                if let Some(detail) = &choice.description {
                    radio = radio.child(caption(detail.clone(), p));
                }
                group = group.child(radio);
            }
            if self.value.rules.custom != CustomAnswer::Disabled {
                let index = self.value.choices.len();
                group = group.child(
                    Radio::new("custom-answer-choice")
                        .label("Other answer")
                        .on_key_down(cx.listener(move |this, event, window, cx| {
                            this.navigate_choice(index, event, window, cx)
                        })),
                );
            }
            view = view.child(
                group.on_change(cx.listener(|this, index: &usize, window, cx| {
                    if let Some(choice) = this.value.choices.get(*index) {
                        let id = choice.id.clone();
                        this.choose(id, true, window, cx);
                    } else {
                        this.choose_custom(true, window, cx);
                    }
                })),
            );
        } else if !self.value.approval {
            let count = self.selected.len()
                + usize::from(
                    self.custom_selected && self.value.rules.custom == CustomAnswer::Additional,
                );
            for (index, choice) in self.value.choices.iter().enumerate() {
                let selected = settled.as_ref().map_or_else(
                    || self.selected.contains(&choice.id),
                    |answer| answer.choices.contains(&choice.id),
                );
                let full = self
                    .value
                    .rules
                    .maximum
                    .is_some_and(|maximum| count >= maximum);
                let id = choice.id.clone();
                view = view.child(
                    Checkbox::new(("choice", index))
                        .label(choice.label.clone())
                        .checked(selected)
                        .disabled(!available || full && !selected)
                        .on_change(cx.listener(move |this, checked, window, cx| {
                            this.choose(id.clone(), *checked, window, cx)
                        })),
                );
                if let Some(detail) = &choice.description {
                    view = view.child(caption(detail.clone(), p));
                }
            }
        }
        if let Some(answer) = &settled {
            if let Some(text) = &answer.text {
                view = view.child(
                    div()
                        .id("settled-custom-answer")
                        .role(Role::Paragraph)
                        .aria_label(text.clone())
                        .child(text.clone()),
                );
            }
        } else if self.value.rules.custom != CustomAnswer::Disabled {
            if self.value.multiple && !self.value.choices.is_empty() {
                let full = self
                    .value
                    .rules
                    .maximum
                    .is_some_and(|maximum| self.selected.len() >= maximum);
                view = view.child(
                    Checkbox::new("custom-answer-choice")
                        .label("Other answer")
                        .checked(self.custom_selected)
                        .disabled(
                            !available
                                || self.value.rules.custom == CustomAnswer::Additional
                                    && full
                                    && !self.custom_selected,
                        )
                        .on_change(cx.listener(|this, checked, window, cx| {
                            this.choose_custom(*checked, window, cx)
                        })),
                );
            }
            if let Some(input) = &self.custom {
                let full = self.value.rules.custom == CustomAnswer::Additional
                    && self
                        .value
                        .rules
                        .maximum
                        .is_some_and(|maximum| self.selected.len() >= maximum)
                    && !self.custom_selected;
                let disabled = !available || full;
                let field = Textarea::new(input)
                    .appearance(false)
                    .bordered(false)
                    .aria_label("Other answer")
                    .disabled(disabled);
                view = if disabled {
                    view.child(crate::ui::field::disabled_field(
                        "disabled-other-answer",
                        "Other answer",
                        input.read(cx).value().to_string(),
                        Role::MultilineTextInput,
                        field.role(gpui_kit::component::RoleOverride::Presentational),
                    ))
                } else {
                    view.child(field)
                };
                let length = input.read(cx).value().encode_utf16().count();
                if length > self.value.rules.text_limit_utf16 {
                    view = view.child(
                        caption("Shorten this answer to continue.", p)
                            .id("answer-limit-error")
                            .role(Role::Alert)
                            .aria_label("Shorten this answer to continue.")
                            .text_color(p.color("destructive")),
                    );
                }
            }
        }
        if available && !self.value.approval {
            let request_id = self.value.request_id.clone();
            let revision = self.value.revision;
            let draft = self.draft(cx);
            let empty_custom = self.custom_selected
                && draft.text.as_ref().is_none_or(|text| {
                    text.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
                        .is_empty()
                });
            let valid = !empty_custom
                && self
                    .value
                    .reply(draft.choices, draft.text.as_deref())
                    .is_ok();
            view = view.child(
                div()
                    .flex()
                    .items_center()
                    .gap(ui(8.))
                    .when_some(self.question_navigation(p, cx), |view, footer| {
                        view.child(footer)
                    })
                    .child(div().flex_1())
                    .child(
                        button("interaction-answer", "Continue", ButtonKind::Primary, p, cx)
                            .rounded(super::theme::ui_px(22., cx))
                            .h(ui(34.))
                            .px(ui(15.))
                            .disabled_state(!valid, p)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.reply(&request_id, revision, window, cx, false)
                            })),
                    ),
            );
            if self.value.rules.minimum == 0 {
                let request_id = self.value.request_id.clone();
                view = view.child(
                    button(
                        "interaction-skip",
                        "Skip question",
                        ButtonKind::Ghost,
                        p,
                        cx,
                    )
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.reply(&request_id, revision, window, cx, true)
                    })),
                );
            }
        }
        view = view.children(self.response_feedback(p, cx));
        if let Some(error) = &self.error {
            view = view.child(
                div()
                    .id("interaction-error")
                    .role(Role::Alert)
                    .aria_label(error.clone())
                    .child(caption(error.clone(), p)),
            );
        }
        view.child(super::message::clock(&self.time, p))
            .into_any_element()
    }
}
