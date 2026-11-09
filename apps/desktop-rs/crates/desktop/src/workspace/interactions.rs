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
fn human_reply_matches(request: &Value, snapshot: &Value, body: &Value) -> bool {
    if request["state"] != "answered" {
        return false;
    }
    let expected = match body["decision"].as_str() {
        Some("approve") if request["decision"] == "approve" => "Approved.".to_owned(),
        Some("reject") if request["decision"] == "reject" => "Rejected.".to_owned(),
        Some(_) => return false,
        None if request["purpose"] != "approval" => rows(&request["options"], "choices")
            .iter()
            .filter(|choice| rows(body, "selected_ids").contains(&choice["id"]))
            .map(|choice| text(choice, "label"))
            .chain(
                body["text"]
                    .as_str()
                    .map(str::trim)
                    .filter(|text| !text.is_empty()),
            )
            .collect::<Vec<_>>()
            .join("\n"),
        None => return false,
    };
    rows(snapshot, "messages").iter().any(|message| {
        message["id"] == request["response_message_id"]
            && message["thread_id"] == request["thread_id"]
            && message["source_run_id"] == request["source_run_id"]
            && message["purpose"] == "human_reply"
            && message["author"] == "user"
            && message["text"] == expected
    })
}

impl Workspace {
    pub(super) fn sync_interactions(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let mut desired = Vec::new();
        for request in rows(self.value(), "human_requests").to_vec() {
            let request = &request;
            let slot = format!("human:{}", text(request, "id"));
            if !self.busy
                && request["state"] != "pending"
                && let Some(operation) = self.store.pending(&slot)
            {
                let matches = human_reply_matches(request, self.value(), &operation.request.body);
                let result = if matches {
                    Ok(request.clone())
                } else {
                    Err(ClientError::Rejected {
                        code: "CONFLICT".into(),
                        message: "This request was resolved with a different answer.".into(),
                    })
                };
                match self.store.finish(&slot, operation.request.key, &result) {
                    Ok(()) => {
                        if matches {
                            if let Err(error) = self.store.clear_sent(&operation) {
                                self.error = error.to_string();
                            }
                            if operation.authored.is_some() && operation.thread == self.selected {
                                self.restore_draft(window, cx);
                            }
                        }
                        self.clear_context_error();
                    }
                    Err(error) => self.error = error.to_string(),
                }
            }
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
                if let Some(operation) = self
                    .store
                    .pending(&format!("human:{}", text(request, "id")))
                {
                    if self.busy && operation.state == OperationState::Pending {
                        InteractionState::Submitting
                    } else {
                        InteractionState::Uncertain
                    }
                } else {
                    InteractionState::Current
                }
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
                            if request["options"]["max"].as_u64().unwrap_or(1) > 1 {
                                CustomAnswer::Additional
                            } else {
                                CustomAnswer::Alternative
                            }
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
                    let operation = self.store.pending(&slot).unwrap();
                    let result = if submission["state"] == "submitted"
                        && submission["answer"] == operation.request.body
                    {
                        Ok(json!({"status":"submitted"}))
                    } else {
                        Err(ClientError::Rejected {
                            code: "CONFLICT".into(),
                            message: "This answer was not confirmed. Review the current request."
                                .into(),
                        })
                    };
                    if let Err(e) = self.store.finish(&slot, operation.request.key, &result) {
                        self.error = e.to_string();
                    } else if result.is_ok() {
                        if let Err(error) = self.store.clear_sent(&operation) {
                            self.error = error.to_string();
                        }
                        if operation.authored.is_some() && operation.thread == self.selected {
                            self.restore_draft(window, cx);
                        }
                        self.clear_context_error();
                    }
                }
                if record["type"] != "approval" {
                    if text(submission, "state") == "submitted" || !current && !unresolved {
                        self.question_steps.remove(&slot);
                        self.answers
                            .retain(|key, _| !key.starts_with(&format!("{slot}:")));
                        if let Err(error) =
                            self.store.clear_interaction_answers(&format!("{slot}:"))
                        {
                            self.error = error.to_string();
                        }
                    } else {
                        let initial = rows(request, "questions")
                            .iter()
                            .position(|question| {
                                !self
                                    .answers
                                    .contains_key(&format!("{slot}:{}", text(question, "id")))
                            })
                            .unwrap_or(rows(request, "questions").len().saturating_sub(1));
                        self.question_steps.entry(slot.clone()).or_insert(initial);
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
                    let question = "Allow this action?".to_owned();
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
            let details = match &binding {
                Binding::Approval { request, .. } => Some(request["rawArgs"].clone()),
                Binding::Human(request) if request["action"].is_object() => {
                    Some(request["action"]["arguments"].clone())
                }
                _ => None,
            };
            let page = match &binding {
                Binding::Question {
                    request, question, ..
                } => rows(request, "questions")
                    .iter()
                    .position(|item| item["id"] == *question)
                    .map(|index| (index, rows(request, "questions").len())),
                _ => None,
            };
            let view = cx.new(|_| {
                InteractionView::new(value, time)
                    .details(details)
                    .page(page)
                    .compact_history()
            });
            if let Some(answer) = self.answers.get(&key) {
                let answer = answer_value(answer);
                view.update(cx, |view, cx| view.restore_answer(&answer, window, cx));
            }
            let id = key.clone();
            let subscription = cx.subscribe_in(
                &view,
                window,
                move |this, _, intent: &AnswerIntent, window, cx| match intent {
                    AnswerIntent::Check { .. } => {
                        this.read_task = None;
                        this.refresh(true, window, cx);
                    }
                    AnswerIntent::Reply(reply) => this.answer(&id, reply.clone(), None, window, cx),
                    AnswerIntent::Previous => this.previous_question(&id, window, cx),
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
    pub(super) fn interaction_visible(&self, key: &str) -> bool {
        let Some(bound) = self.interaction_views.get(key) else {
            return false;
        };
        match &bound.binding {
            Binding::Question {
                slot,
                question,
                request,
                ..
            } => self.question_steps.get(slot).is_none_or(|index| {
                rows(request, "questions")
                    .get(*index)
                    .is_some_and(|item| item["id"] == *question)
            }),
            _ => true,
        }
    }
    fn previous_question(&mut self, key: &str, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(BoundInteraction {
            binding: Binding::Question { slot, .. },
            ..
        }) = self.interaction_views.get(key)
        {
            let slot = slot.clone();
            if let Some(index) = self.question_steps.get_mut(&slot) {
                *index = index.saturating_sub(1);
            }
            self.rebuild_transcript(window, cx);
            self.prepare_portraits(cx);
            cx.notify();
        }
    }
    pub(super) fn composer_response_locked(&self, cx: &App) -> bool {
        self.interaction_views.iter().any(|(key, bound)| {
            let value = &bound.view.read(cx).value;
            self.interaction_visible(key)
                && !value.approval
                && value.choices.is_empty()
                && matches!(
                    value.state,
                    InteractionState::Submitting
                        | InteractionState::Uncertain
                        | InteractionState::Checking
                )
        })
    }
    pub(super) fn answer_from_composer(
        &mut self,
        text: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.composer_response_locked(cx) {
            return true;
        }
        let target = self
            .interaction_views
            .iter()
            .find(|(key, bound)| {
                self.interaction_visible(key)
                    && matches!(bound.binding, Binding::Question { .. } | Binding::Human(_))
                    && !bound.view.read(cx).value.approval
                    && bound.view.read(cx).value.choices.is_empty()
                    && matches!(
                        bound.view.read(cx).value.state,
                        InteractionState::Current | InteractionState::Failed
                    )
            })
            .map(|(key, bound)| {
                (
                    key.clone(),
                    bound.view.read(cx).value.request_id.clone(),
                    bound.view.read(cx).value.revision,
                )
            });
        let Some((key, request_id, revision)) = target else {
            return false;
        };
        if self
            .selected
            .is_some_and(|thread| !self.store.files(thread).is_empty())
        {
            self.error = "This question accepts text. Remove the attachment to answer it.".into();
            cx.notify();
            return true;
        }
        self.answer(
            &key,
            InteractionReply {
                request_id,
                revision,
                choices: vec![],
                text: Some(text.into()),
            },
            Some(text.into()),
            window,
            cx,
        );
        true
    }
    fn answer(
        &mut self,
        key: &str,
        reply: InteractionReply,
        authored: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.busy || !self.checked {
            return;
        }
        let Some(bound) = self.interaction_views.get(key) else {
            return;
        };
        let binding = bound.binding.clone();
        let view = bound.view.clone();
        if view
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
        let (slot, mut operation) = match binding.clone() {
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
                    if view.read(cx).value.multiple {
                        answer["selectedLabels"] = json!(reply.choices);
                    } else {
                        answer["selectedLabel"] = json!(reply.choices[0]);
                    }
                }
                let key = format!("{slot}:{question}");
                if let Err(error) = self
                    .store
                    .save_interaction_answer(key.clone(), answer.clone())
                {
                    self.error = error.to_string();
                    cx.notify();
                    return;
                }
                self.answers.insert(key, answer);
                let index = rows(&request, "questions")
                    .iter()
                    .position(|item| item["id"] == question)
                    .unwrap_or(0);
                if index + 1 < rows(&request, "questions").len() {
                    self.question_steps.insert(slot, index + 1);
                    if let (Some(authored), Some(thread)) = (&authored, self.selected)
                        && self.store.draft(thread) == *authored
                    {
                        let _ = self.store.save_draft(thread, String::new());
                        self.restore_draft(window, cx);
                    }
                    self.rebuild_transcript(window, cx);
                    self.prepare_portraits(cx);
                    cx.notify();
                    return;
                }
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
        operation.replayable = matches!(binding, Binding::Human(_));
        operation.authored = authored;
        view.update(cx, |view, cx| {
            view.value.state = InteractionState::Submitting;
            cx.notify();
        });
        self.dispatch(slot, operation, window, cx);
    }
}

#[cfg(test)]
mod recovery_tests {
    use super::human_reply_matches;
    use serde_json::json;

    #[test]
    fn lost_acknowledgement_requires_the_same_answer_and_exact_message_scope() {
        let request = json!({"state":"answered","purpose":"input","thread_id":"thread-a","source_run_id":"run-a","response_message_id":"reply","options":{"choices":[{"id":"short","label":"Short answer"}]}});
        let mut snapshot = json!({"messages":[{"id":"reply","thread_id":"thread-a","source_run_id":"run-a","purpose":"human_reply","author":"user","text":"Short answer"}]});
        assert!(human_reply_matches(
            &request,
            &snapshot,
            &json!({"selected_ids":["short"]})
        ));
        assert!(!human_reply_matches(
            &request,
            &snapshot,
            &json!({"text":"A different answer"})
        ));
        snapshot["messages"][0]["thread_id"] = json!("thread-b");
        assert!(!human_reply_matches(
            &request,
            &snapshot,
            &json!({"selected_ids":["short"]})
        ));
        let request = json!({"state":"answered","purpose":"approval","decision":"reject","thread_id":"thread-a","source_run_id":"run-a","response_message_id":"reply"});
        assert!(!human_reply_matches(
            &request,
            &snapshot,
            &json!({"decision":"approve"})
        ));
    }
}
