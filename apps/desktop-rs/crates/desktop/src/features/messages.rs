use crate::{
    models::message::*,
    ui::{controls::*, message::*, theme::Palette},
};
use gpui_kit::{
    component::{ActiveTheme, text::TextViewState},
    *,
};
pub struct MessageGallery {
    messages: Vec<Message>,
    activities: Vec<ActivityRow>,
    question: Entity<InteractionView>,
    approval: Entity<InteractionView>,
    _subscriptions: Vec<Subscription>,
    status: String,
    grouped: bool,
    _animator: Entity<crate::ui::avatar_view::AvatarAnimator>,
}
impl MessageGallery {
    pub fn new(
        animator: Entity<crate::ui::avatar_view::AvatarAnimator>,
        cx: &mut Context<Self>,
    ) -> Self {
        let avatar = crate::ui::avatar_view::AvatarPortrait::create(
            &animator,
            ngertiin_avatar::AvatarConfig::default_agent("tobi", true).expect("Fixture recipe"),
            32.,
            cx,
        );
        let time = PublicationTime::new("2026-11-07T04:00:00Z", 8 * 3600).expect("Fixture time");
        let body=cx.new(|cx|TextViewState::markdown("## A useful answer\n\nThe result is **ready**.\n\n- [x] Read the source\n- [x] Preserve the original\n\n```rust\nlet result = 42;\n```\n\n| Item | Value |\n| --- | --- |\n| Native | Yes |",cx));
        let user = cx.new(|cx| TextViewState::markdown("Please review this file.", cx));
        let messages = vec![
            Message {
                id: "user".into(),
                author: "You".into(),
                user: true,
                group: false,
                avatar: None,
                user_fill: Some(rgb(0x70757c).into()),
                time: time.clone(),
                body: Some(user),
                files: vec![("report.csv".into(), "24 KB · CSV".into())],
                references: vec![],
            },
            Message {
                id: "assistant".into(),
                author: "Tobi".into(),
                user: false,
                group: true,
                avatar: Some(avatar),
                user_fill: None,
                time: time.clone(),
                body: Some(body),
                files: vec![],
                references: vec![(
                    "Source reference".into(),
                    "https://example.com/source".into(),
                )],
            },
            Message {
                id: "file-only".into(),
                author: "Tobi".into(),
                user: false,
                group: false,
                avatar: None,
                user_fill: Some(rgb(0x70757c).into()),
                time: time.clone(),
                body: None,
                files: vec![("summary.pdf".into(), "PDF document".into())],
                references: vec![],
            },
        ];
        let question = cx.new(|_| {
            InteractionView::new(
                Interaction {
                    request_id: "question-1".into(),
                    revision: 3,
                    question: "Which format would you like?".into(),
                    choices: vec![
                        Choice {
                            id: "csv".into(),
                            label: "CSV".into(),
                            description: Some("Keep the original table values.".into()),
                        },
                        Choice {
                            id: "pdf".into(),
                            label: "PDF".into(),
                            description: None,
                        },
                    ],
                    approval: false,
                    multiple: false,
                    rules: AnswerRules {
                        custom: CustomAnswer::Alternative,
                        ..Default::default()
                    },
                    state: InteractionState::Current,
                },
                time.clone(),
            )
        });
        let approval = cx.new(|_| {
            InteractionView::new(
                Interaction {
                    request_id: "approval-1".into(),
                    revision: 2,
                    question: "Approve this local fixture step?".into(),
                    choices: vec![
                        Choice {
                            id: "approve".into(),
                            label: "Approve once".into(),
                            description: None,
                        },
                        Choice {
                            id: "decline".into(),
                            label: "Decline".into(),
                            description: None,
                        },
                    ],
                    approval: true,
                    multiple: false,
                    rules: AnswerRules::default(),
                    state: InteractionState::Current,
                },
                time.clone(),
            )
        });
        let mut subscriptions = vec![];
        for view in [&question, &approval] {
            subscriptions.push(cx.subscribe(view, |this, view, event: &AnswerIntent, cx| {
                match event {
                    AnswerIntent::Previous => { this.status = "Previous question selected in the fixture.".into(); },
                    AnswerIntent::Reply(reply) => {
                        view.update(cx, |view, cx| {
                            if view.value.request_id == reply.request_id && view.value.revision == reply.revision
                                && view.value.reply(reply.choices.clone(), reply.text.as_deref()).is_ok() {
                                view.value.state = InteractionState::Submitted(AnswerValue { choices: reply.choices.clone(), text: reply.text.clone() });
                                cx.notify();
                            }
                        });
                        this.status = "Response intent retained with request/revision and original answer. No network request.".into();
                    }
                    AnswerIntent::Check { request_id, revision } => {
                        this.status = format!("Status-check intent for {request_id} revision {revision}. No response replay or network request.");
                    }
                }
                cx.notify();
            }));
        }
        let activities = [
            ActivityKind::Thinking,
            ActivityKind::Reading,
            ActivityKind::Searching,
            ActivityKind::Working,
            ActivityKind::Waiting,
            ActivityKind::Failed,
            ActivityKind::Settled,
        ]
        .into_iter()
        .enumerate()
        .map(|(i, kind)| {
            let avatar = crate::ui::avatar_view::AvatarPortrait::create(
                &animator,
                ngertiin_avatar::AvatarConfig::default_agent("tobi", true).expect("Fixture recipe"),
                32.,
                cx,
            );
            avatar.update(cx, |avatar, cx| {
                avatar.state(
                    match kind {
                        ActivityKind::Thinking | ActivityKind::Searching => {
                            ngertiin_avatar::State::Thinking
                        }
                        ActivityKind::Reading => ngertiin_avatar::State::Listening,
                        ActivityKind::Working => ngertiin_avatar::State::Working,
                        ActivityKind::Failed => ngertiin_avatar::State::Error,
                        _ => ngertiin_avatar::State::Idle,
                    },
                    cx,
                );
                avatar.loading(
                    matches!(
                        kind,
                        ActivityKind::Thinking
                            | ActivityKind::Searching
                            | ActivityKind::Reading
                            | ActivityKind::Working
                    ),
                    cx,
                );
            });
            ActivityRow {
                id: format!("activity-{i}"),
                author: "Tobi".into(),
                kind,
                time: time.clone(),
                group: i % 2 == 0,
                avatar,
            }
        })
        .collect();
        Self {
            messages,
            activities,
            question,
            approval,
            _subscriptions: subscriptions,
            status: String::new(),
            grouped: true,
            _animator: animator,
        }
    }
    pub fn retire(&self, window: &mut Window, cx: &mut App) {
        for activity in &self.activities {
            activity.avatar.update(cx, |a, cx| a.suspend(window, cx));
        }
        for message in &self.messages {
            if let Some(avatar) = &message.avatar {
                avatar.update(cx, |avatar, cx| avatar.suspend(window, cx));
            }
        }
    }
    fn cycle_request(view: &Entity<InteractionView>, window: &mut Window, cx: &mut App) {
        view.update(cx, |view, cx| {
            let mut answer = view.draft(cx);
            if answer.choices.is_empty()
                && answer
                    .text
                    .as_ref()
                    .is_none_or(|text| text.trim().is_empty())
            {
                answer.choices = view
                    .value
                    .choices
                    .first()
                    .map(|choice| vec![choice.id.clone()])
                    .unwrap_or_default();
            }
            view.value.state = match &view.value.state {
                InteractionState::Current => InteractionState::Submitting,
                InteractionState::Submitting => InteractionState::Uncertain,
                InteractionState::Uncertain | InteractionState::Checking => {
                    InteractionState::Failed
                }
                InteractionState::Failed => InteractionState::Submitted(answer),
                InteractionState::Submitted(answer) => InteractionState::Resolved(answer.clone()),
                InteractionState::Resolved(_) => InteractionState::Expired,
                InteractionState::Expired => {
                    view.reset(window, cx);
                    return;
                }
            };
            cx.notify();
        });
    }
}
impl Render for MessageGallery {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(cx.theme().mode.is_dark());
        let time = self.messages[0].time.clone();
        let mut view = div()
            .id("message-gallery")
            .size_full()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap_3()
            .child(
                row()
                    .child(
                        button(
                            "message-attribution",
                            if self.grouped {
                                "Group attribution"
                            } else {
                                "DM attribution"
                            },
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.grouped = !this.grouped;
                            for message in &mut this.messages {
                                if !message.user {
                                    message.group = this.grouped;
                                }
                            }
                            cx.notify();
                        })),
                    )
                    .child(
                        button(
                            "question-state",
                            "Question state",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| {
                            Self::cycle_request(&this.question, window, cx)
                        })),
                    )
                    .child(
                        button(
                            "approval-state",
                            "Approval state",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| {
                            Self::cycle_request(&this.approval, window, cx)
                        })),
                    )
                    .child(
                        button(
                            "question-multiple",
                            "Toggle multiple answers",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.question.update(cx, |question, cx| {
                                question.value.multiple = !question.value.multiple;
                                question.value.rules.maximum =
                                    Some(if question.value.multiple { 2 } else { 1 });
                                question.value.rules.custom = if question.value.multiple {
                                    CustomAnswer::Additional
                                } else {
                                    CustomAnswer::Alternative
                                };
                                question.value.rules.text_limit_utf16 =
                                    if question.value.multiple { 16000 } else { 500 };
                                question.reset(window, cx);
                            })
                        })),
                    )
                    .child(
                        button(
                            "question-optional",
                            "Toggle optional question",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.question.update(cx, |question, cx| {
                                question.value.rules.minimum =
                                    usize::from(question.value.rules.minimum == 0);
                                question.reset(window, cx);
                            })
                        })),
                    )
                    .child(
                        button(
                            "reset-interactions",
                            "Reset requests",
                            ButtonKind::Default,
                            p,
                            cx,
                        )
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.question.update(cx, |view, cx| view.reset(window, cx));
                            this.approval.update(cx, |view, cx| view.reset(window, cx));
                        })),
                    ),
            )
            .child(day_marker(&time.day_label, p));
        for message in &self.messages {
            let owner = cx.entity().downgrade();
            view = view.child(message.view(p, cx, move |intent, _, cx| {
                let _ = owner.update(cx, |this, cx| {
                    this.status = format!("Open intent: {intent:?}");
                    cx.notify();
                });
            }));
        }
        for activity in &self.activities {
            view = view.child(activity.view(p));
        }
        view.child(self.question.clone())
            .child(self.approval.clone())
            .child(error_retry(
                "message-retry",
                "Could not finish the response",
                "Check the connection and retry when the current request allows it.",
                p,
                cx,
                cx.listener(|this, _, _, cx| {
                    this.status =
                        "Retry intent emitted. No network submission in this gallery.".into();
                    cx.notify();
                }),
            ))
            .child(caption(self.status.clone(), p))
    }
}
