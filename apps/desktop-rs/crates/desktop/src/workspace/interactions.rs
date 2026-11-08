use super::*;
use crate::{
    models::message::*,
    storage::{Operation, OperationState},
    ui::interaction::{AnswerIntent, InteractionView},
};
use ngertiin_client::{ClientError, rows, text};
use serde_json::json;

#[derive(Clone)]
pub(super) enum Binding {
    Human(Value),
    Approval {
        run: String,
        request: Value,
        slot: String,
    },
    Question {
        run: String,
        request: Value,
        question: String,
        slot: String,
    },
}
pub(super) struct BoundInteraction {
    pub view: Entity<InteractionView>,
    pub binding: Binding,
    pub at: String,
    signature: Value,
    _subscription: Subscription,
}
fn answer_value(answer: &Value) -> AnswerValue {
    AnswerValue {
        choices: answer["selectedLabels"]
            .as_array()
            .map(|v| {
                v.iter()
                    .filter_map(|v| v.as_str().map(str::to_owned))
                    .collect()
            })
            .or_else(|| answer["selectedLabel"].as_str().map(|s| vec![s.into()]))
            .unwrap_or_default(),
        text: answer["freeText"].as_str().map(str::to_owned),
    }
}
impl Workspace {
    pub(super) fn sync_interactions(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let mut desired = Vec::new();
        for request in rows(self.value(), "human_requests") {
            let message = rows(self.value(), "messages")
                .iter()
                .find(|m| m["id"] == request["message_id"]);
            let approval = request["purpose"] == "approval";
            let choices = if approval {
                vec![
                    Choice {
                        id: "approve".into(),
                        label: "Approve".into(),
                        description: None,
                    },
                    Choice {
                        id: "reject".into(),
                        label: "Reject".into(),
                        description: None,
                    },
                ]
            } else {
                rows(&request["options"], "choices")
                    .iter()
                    .map(|c| Choice {
                        id: text(c, "id").into(),
                        label: text(c, "label").into(),
                        description: None,
                    })
                    .collect()
            };
            let state = if request["state"] == "pending" {
                InteractionState::Current
            } else if request["state"] == "answered" {
                InteractionState::Resolved(AnswerValue {
                    choices: request["decision"]
                        .as_str()
                        .map(|s| vec![s.into()])
                        .unwrap_or_default(),
                    text: rows(self.value(), "messages")
                        .iter()
                        .find(|m| m["id"] == request["response_message_id"])
                        .map(|m| text(m, "text").into()),
                })
            } else {
                InteractionState::Expired
            };
            desired.push((
                format!("human:{}", text(request, "id")),
                Interaction {
                    request_id: text(request, "id").into(),
                    revision: request["revision"].as_u64().unwrap_or(1),
                    question: message
                        .map(|m| text(m, "text"))
                        .unwrap_or("Your input is needed")
                        .into(),
                    approval,
                    multiple: request["options"]["max"].as_u64().unwrap_or(1) > 1,
                    rules: AnswerRules {
                        minimum: request["options"]["min"].as_u64().unwrap_or(1) as usize,
                        maximum: Some(request["options"]["max"].as_u64().unwrap_or(1) as usize),
                        custom: if !approval
                            && (request["options"].is_null()
                                || request["options"]["allow_custom"] == true)
                        {
                            CustomAnswer::Alternative
                        } else {
                            CustomAnswer::Disabled
                        },
                        text_limit_utf16: 16000,
                    },
                    choices,
                    state,
                },
                Binding::Human(request.clone()),
                text(request, "created_at").to_owned(),
                json!([request["id"], request["revision"]]),
            ));
        }
        let native = self.native.clone();
        for (run_id, history) in &native {
            if run_id.starts_with("pending:") {
                continue;
            }
            let run = rows(self.value(), "runs")
                .iter()
                .find(|r| r["id"] == *run_id)
                .cloned();
            for record in rows(history, "records") {
                let request = &record["request"];
                let approval = record["type"] == "approval";
                let slot = format!(
                    "native:{run_id}:{}:{}",
                    text(record, "request_id"),
                    record["source_index"]
                );
                let submission = &record["submission"];
                let current = record["observed_state"] == "pending"
                    && run
                        .as_ref()
                        .is_some_and(|r| matches!(text(r, "status"), "running" | "dispatching"));
                let unresolved = self.store.pending(&slot).is_some();
                if unresolved && matches!(text(submission, "state"), "submitted" | "not_dispatched")
                {
                    let key = self.store.pending(&slot).unwrap().request.key;
                    let result = if submission["state"] == "submitted" {
                        Ok(json!({"status":"submitted"}))
                    } else {
                        Err(ClientError::Rejected {
                            code: "INVALID_REQUEST".into(),
                            message: "The answer was not dispatched. Review the current request."
                                .into(),
                        })
                    };
                    if let Err(e) = self.store.finish(&slot, key, &result) {
                        self.error = e.to_string();
                    }
                }
                let retained = self.store.operation(&slot);
                let state = match text(submission, "state") {
                    "submitting" => InteractionState::Checking,
                    "unknown" => InteractionState::Uncertain,
                    "submitted" => {
                        if current {
                            InteractionState::Submitted(AnswerValue::default())
                        } else {
                            InteractionState::Resolved(AnswerValue::default())
                        }
                    }
                    "not_dispatched" if current => InteractionState::Failed,
                    _ if retained.is_some_and(|op| op.unresolved()) => InteractionState::Uncertain,
                    _ if retained.is_some_and(|op| op.state == OperationState::Acknowledged) => {
                        InteractionState::Submitted(AnswerValue::default())
                    }
                    _ if current => InteractionState::Current,
                    _ => InteractionState::Expired,
                };
                let at = text(record, "observed_at").to_owned();
                if approval {
                    let choices = rows(request, "availableChoices")
                        .iter()
                        .map(|choice| Choice {
                            id: text(choice, "choiceId").into(),
                            label: choice["label"]
                                .as_str()
                                .unwrap_or(text(choice, "decision"))
                                .into(),
                            description: choice["rulePreview"].as_str().map(str::to_owned),
                        })
                        .collect();
                    let question = format!(
                        "{}\n{}",
                        request["toolName"].as_str().unwrap_or("Approval requested"),
                        request["subject"]["command"]
                            .as_str()
                            .or_else(|| request["subject"]["path"].as_str())
                            .unwrap_or("Review this action before choosing.")
                    );
                    let mut state = state;
                    if matches!(
                        state,
                        InteractionState::Submitted(_) | InteractionState::Resolved(_)
                    ) {
                        let answer = AnswerValue {
                            choices: submission["answer"]["choice_id"]
                                .as_str()
                                .map(|s| vec![s.into()])
                                .unwrap_or_default(),
                            text: None,
                        };
                        state = if current {
                            InteractionState::Submitted(answer)
                        } else {
                            InteractionState::Resolved(answer)
                        };
                    }
                    desired.push((
                        slot.clone(),
                        Interaction {
                            request_id: text(record, "request_id").into(),
                            revision: 1,
                            question,
                            approval: true,
                            multiple: false,
                            rules: AnswerRules::default(),
                            choices,
                            state,
                        },
                        Binding::Approval {
                            run: run_id.clone(),
                            request: request.clone(),
                            slot: slot.clone(),
                        },
                        at,
                        json!([request, record["source_index"]]),
                    ));
                } else {
                    for question in rows(request, "questions") {
                        let id = text(question, "id");
                        let mut question_state = state.clone();
                        if matches!(
                            state,
                            InteractionState::Submitted(_) | InteractionState::Resolved(_)
                        ) {
                            let answer = rows(&submission["answer"], "answers")
                                .iter()
                                .find(|a| a["questionId"] == id)
                                .map(answer_value)
                                .unwrap_or_default();
                            question_state = if current {
                                InteractionState::Submitted(answer)
                            } else {
                                InteractionState::Resolved(answer)
                            };
                        }
                        let multiple = question["selection"]["mode"] == "multiple";
                        desired.push((
                            format!("{slot}:{id}"),
                            Interaction {
                                request_id: id.into(),
                                revision: 1,
                                question: text(question, "question").into(),
                                approval: false,
                                multiple,
                                rules: AnswerRules {
                                    minimum: question["selection"]["min"].as_u64().unwrap_or(1)
                                        as usize,
                                    maximum: question["selection"]["max"]
                                        .as_u64()
                                        .map(|n| n as usize)
                                        .or(if multiple { None } else { Some(1) }),
                                    custom: if multiple {
                                        CustomAnswer::Additional
                                    } else {
                                        CustomAnswer::Alternative
                                    },
                                    text_limit_utf16: 500,
                                },
                                choices: rows(question, "options")
                                    .iter()
                                    .map(|option| Choice {
                                        id: text(option, "label").into(),
                                        label: text(option, "label").into(),
                                        description: option["description"]
                                            .as_str()
                                            .map(str::to_owned),
                                    })
                                    .collect(),
                                state: question_state,
                            },
                            Binding::Question {
                                run: run_id.clone(),
                                request: request.clone(),
                                question: id.into(),
                                slot: slot.clone(),
                            },
                            at.clone(),
                            question.clone(),
                        ));
                    }
                }
            }
        }
        let ids: std::collections::BTreeSet<_> = desired
            .iter()
            .map(|(key, _, _, _, _)| key.clone())
            .collect();
        self.interaction_views.retain(|key, _| ids.contains(key));
        for (key, value, binding, at, signature) in desired {
            if let Some(existing) = self
                .interaction_views
                .get_mut(&key)
                .filter(|old| old.signature == signature)
            {
                existing.view.update(cx, |view, cx| {
                    if view.value.state != value.state {
                        view.value.state = value.state;
                        cx.notify();
                    }
                });
                continue;
            }
            let Ok(time) = PublicationTime::local(&at) else {
                continue;
            };
            let view = cx.new(|_| InteractionView::new(value, time).compact_history());
            let id = key.clone();
            let subscription = cx.subscribe_in(
                &view,
                window,
                move |this, _, intent: &AnswerIntent, window, cx| match intent {
                    AnswerIntent::Check { .. } => {
                        this.read_task = None;
                        this.refresh(true, window, cx);
                    }
                    AnswerIntent::Reply(reply) => this.answer(&id, reply.clone(), window, cx),
                },
            );
            self.interaction_views.insert(
                key,
                BoundInteraction {
                    view,
                    binding,
                    at,
                    signature,
                    _subscription: subscription,
                },
            );
        }
    }
    fn answer(
        &mut self,
        key: &str,
        reply: InteractionReply,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(bound) = self.interaction_views.get(key) else {
            return;
        };
        if bound
            .view
            .read(cx)
            .value
            .reply_at(
                &reply.request_id,
                reply.revision,
                reply.choices.clone(),
                reply.text.as_deref(),
            )
            .is_err()
        {
            return;
        }
        let (slot, mut operation) = match bound.binding.clone() {
            Binding::Human(request) => {
                let id = text(&request, "id");
                (
                    format!("human:{id}"),
                    Operation::command(
                        format!("/v1/human-requests/{id}/reply"),
                        json!({"expected_revision":request["revision"],"text":reply.text.unwrap_or_default(),"selected_ids":if request["purpose"]=="approval"{vec![]}else{reply.choices.clone()},"decision":if request["purpose"]=="approval"{reply.choices.first().map(String::as_str)}else{None}}),
                        self.selected,
                    ),
                )
            }
            Binding::Approval { run, request, slot } => {
                let Some(choice) = reply.choices.first() else {
                    return;
                };
                (
                    slot,
                    Operation::command(
                        format!("/v1/runs/{run}/interactions"),
                        json!({"type":"approval","request_id":request["approvalId"],"source_index":request["currentRequirementId"]["sourceIndex"],"choice_id":choice}),
                        self.selected,
                    ),
                )
            }
            Binding::Question {
                run,
                request,
                question,
                slot,
            } => {
                let mut answer = json!({"questionId":question});
                if let Some(text) = reply.text {
                    answer["freeText"] = json!(text);
                }
                if !reply.choices.is_empty() {
                    answer["selectedLabels"] = json!(reply.choices);
                }
                self.answers.insert(format!("{slot}:{question}"), answer);
                let answers: Option<Vec<_>> = rows(&request, "questions")
                    .iter()
                    .map(|q| {
                        self.answers
                            .get(&format!("{slot}:{}", text(q, "id")))
                            .cloned()
                    })
                    .collect();
                let Some(answers) = answers else {
                    cx.notify();
                    return;
                };
                (
                    slot,
                    Operation::command(
                        format!("/v1/runs/{run}/interactions"),
                        json!({"type":"user_input","request_id":request["userInputId"],"answers":answers}),
                        self.selected,
                    ),
                )
            }
        };
        operation.replayable = matches!(bound.binding, Binding::Human(_));
        self.dispatch(slot, operation, window, cx);
    }
}
