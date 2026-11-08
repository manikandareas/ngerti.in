//! Revision-bound editing and presentation; the caller owns dispatch/reconciliation.
use crate::{
    models::message::*,
    ui::{controls::*, theme::Palette},
};
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
    expanded: bool,
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
            expanded: false,
        }
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
}
impl Render for InteractionView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        if self.compact_history
            && !self.expanded
            && matches!(
                self.value.state,
                InteractionState::Resolved(_) | InteractionState::Submitted(_)
            )
        {
            return button("resolved-question", "", ButtonKind::Ghost, p, cx)
                .accessibility_label(self.value.question.clone())
                .child(
                    div()
                        .w_full()
                        .text_left()
                        .text_size(super::theme::ui(15.))
                        .child(self.value.question.clone()),
                )
                .w_full()
                .max_w(super::theme::ui(460.))
                .h_auto()
                .p(super::theme::ui(18.))
                .rounded(super::theme::ui_px(14., cx))
                .bg(p.color("card"))
                .justify_start()
                .text_size(super::theme::ui(15.))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.expanded = true;
                    cx.notify();
                }))
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
        let mut view = card(p)
            .id("native-interaction")
            .role(Role::Group)
            .aria_label(self.value.question.clone())
            .child(
                div()
                    .font_weight(FontWeight::MEDIUM)
                    .child(self.value.question.clone()),
            );
        if self.compact_history {
            view = view.max_w(super::theme::ui(460.)).bg(p.color("card"));
        }
        if self.value.multiple
            && let Some(maximum) = self.value.rules.maximum
        {
            view = view.child(caption(format!("Choose up to {maximum} answers"), p));
        }
        if !self.value.multiple && !self.value.choices.is_empty() {
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
        } else {
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
                view = view.child(caption(
                    format!(
                        "{length} / {} characters",
                        self.value.rules.text_limit_utf16
                    ),
                    p,
                ));
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
        if available {
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
                button(
                    "interaction-answer",
                    if self.value.approval {
                        "Confirm choice"
                    } else {
                        "Submit answer"
                    },
                    ButtonKind::Primary,
                    p,
                    cx,
                )
                .disabled_state(!valid, p)
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.reply(&request_id, revision, window, cx, false)
                })),
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
