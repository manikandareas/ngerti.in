use super::*;
use futures_util::StreamExt;
use ngertiin_client::{ClientError, EventPage, rows, text};

struct Refresh {
    catalog: Option<(Vec<Value>, Vec<Value>, Vec<Value>)>,
    snapshot: Option<Value>,
    events: Option<EventPage>,
    opening: Option<Value>,
    native: BTreeMap<String, Value>,
    history: Value,
    previews: Option<Value>,
    activities: Value,
}
impl Workspace {
    fn start_feed(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.feed.is_some() {
            return;
        }
        let Some(projection) = &self.projection else {
            return;
        };
        let Some(worker) = &self.reads else {
            return;
        };
        let Ok((feed, mut receiver)) = worker.event_feed(projection.cursor()) else {
            return;
        };
        self.feed = Some(feed);
        self.feed_task = Some(cx.spawn_in(window, async move |view, cx| {
            while receiver.next().await.is_some() {
                cx.background_executor()
                    .timer(std::time::Duration::from_millis(40))
                    .await;
                if view
                    .update_in(cx, |this, window, cx| {
                        if window.is_visible() && window.is_window_active() {
                            this.refresh(false, window, cx);
                        }
                    })
                    .is_err()
                {
                    break;
                }
            }
        }));
    }

    pub(super) fn refresh(&mut self, full: bool, window: &mut Window, cx: &mut Context<Self>) {
        if self.read_task.is_some() {
            self.refresh_pending = true;
            return;
        }
        let Some(worker) = &self.reads else {
            return;
        };
        let scope = self.scope;
        let selected = self.selected;
        let cursor = self.projection.as_ref().map(Conversation::cursor);
        let mut retained = self
            .projection
            .as_ref()
            .map(Conversation::retained_messages)
            .unwrap_or_default();
        let check = !self.checked || full;
        let catalog_requested = full || self.threads.is_empty();
        let active: Vec<_> = rows(self.value(), "runs")
            .iter()
            .filter(|run| {
                matches!(
                    text(run, "status"),
                    "running" | "dispatching" | "cancel_requested"
                )
            })
            .map(|r| text(r, "id").to_owned())
            .collect();
        let result = worker.submit(false, move |api| {
            if check {
                api.check()?;
            }
            let catalog = if catalog_requested {
                Some((
                    api.get("/v1/entities/agent")?
                        .as_array()
                        .ok_or(ClientError::ShapeMismatch)?
                        .clone(),
                    api.get("/v1/entities/thread")?
                        .as_array()
                        .ok_or(ClientError::ShapeMismatch)?
                        .clone(),
                    api.get("/v1/entities/connection")?
                        .as_array()
                        .ok_or(ClientError::ShapeMismatch)?
                        .clone(),
                ))
            } else {
                None
            };
            let mut result = Refresh {
                catalog,
                snapshot: None,
                events: None,
                opening: None,
                native: BTreeMap::new(),
                history: Value::Null,
                previews: None,
                activities: api.get("/v1/agents/activity")?,
            };
            if let Some(thread) = selected {
                let mut dirty = full || cursor.is_none();
                if let Some(mut cursor) = cursor {
                    loop {
                        let page: EventPage = serde_json::from_value(
                            api.get(&format!("/v1/events?after={cursor}&limit=1000"))?,
                        )
                        .map_err(|_| ClientError::ShapeMismatch)?;
                        dirty |= page.events.iter().any(|e| {
                            e["conversation_thread_id"] == thread.to_string()
                                || e["data"]["thread_id"] == thread.to_string()
                                || matches!(text(e, "entity_kind"), "agent" | "thread")
                        });
                        if page.events.iter().any(|event| {
                            matches!(
                                text(event, "entity_kind"),
                                "agent" | "thread" | "connection"
                            )
                        }) && result.catalog.is_none()
                        {
                            result.catalog = Some((
                                api.get("/v1/entities/agent")?
                                    .as_array()
                                    .ok_or(ClientError::ShapeMismatch)?
                                    .clone(),
                                api.get("/v1/entities/thread")?
                                    .as_array()
                                    .ok_or(ClientError::ShapeMismatch)?
                                    .clone(),
                                api.get("/v1/entities/connection")?
                                    .as_array()
                                    .ok_or(ClientError::ShapeMismatch)?
                                    .clone(),
                            ));
                        }
                        if page
                            .events
                            .iter()
                            .any(|event| matches!(text(event, "entity_kind"), "message" | "thread"))
                        {
                            result.previews = Some(api.get("/v1/conversations/previews")?);
                        }
                        for event in &page.events {
                            if text(event, "entity_kind") == "message"
                                && event["data"]["thread_id"] == thread.to_string()
                                && let Some(old) = retained.get_mut(text(event, "entity_id"))
                                && old["revision"].as_u64() < event["revision"].as_u64()
                            {
                                *old = event["data"].clone();
                            }
                        }
                        if page.next_cursor < cursor
                            || page.events.len() == 1000 && page.next_cursor == cursor
                        {
                            return Err(ClientError::ShapeMismatch);
                        }
                        cursor = page.next_cursor;
                        let complete = page.events.len() < 1000;
                        // Only one event page and the already-loaded history are retained.
                        result.events = Some(page);
                        if complete {
                            break;
                        }
                    }
                }
                result.history =
                    serde_json::json!({"messages":retained.into_values().collect::<Vec<_>>()});
                if dirty {
                    result.snapshot = Some(api.get(&format!("/v1/threads/{thread}/snapshot"))?);
                    if result
                        .snapshot
                        .as_ref()
                        .is_some_and(|s| !s["thread"]["creation_operation_id"].is_null())
                    {
                        result.opening = Some(api.get(&format!("/v1/threads/{thread}/opening"))?);
                    }
                }
                if let Some(snapshot) = &result.snapshot {
                    for run in rows(snapshot, "runs") {
                        if !rows(run, "native_interactions").is_empty() {
                            result.native.insert(
                                text(run, "id").into(),
                                serde_json::json!({"records":run["native_interactions"]}),
                            );
                        }
                    }
                }
                let runs = result
                    .snapshot
                    .as_ref()
                    .map(|s| {
                        rows(s, "runs")
                            .iter()
                            .filter(|r| {
                                matches!(
                                    text(r, "status"),
                                    "running" | "dispatching" | "cancel_requested"
                                )
                            })
                            .map(|r| text(r, "id").to_owned())
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or(active);
                for id in runs {
                    // Native capability failures must not hide a useful transcript.
                    if let Ok(history) = api.get(&format!("/v1/runs/{id}/interactions/history")) {
                        result.native.insert(id.clone(), history);
                    }
                    if let Ok(pending) = api.get(&format!("/v1/runs/{id}/interactions")) {
                        result.native.insert(format!("pending:{id}"), pending);
                    }
                }
            }
            if catalog_requested {
                result.previews = Some(api.get("/v1/conversations/previews")?);
            }
            Ok(result)
        });
        let receiver = match result {
            Ok(v) => v,
            Err(e) => {
                self.error = e.to_string();
                cx.notify();
                return;
            }
        };
        self.loading = self.projection.is_none();
        self.read_task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = receiver.await.unwrap_or(Err(ClientError::Unavailable));
            let _ = view.update_in(cx, |this, window, cx| {
                if this.scope != scope {
                    return;
                }
                this.read_task = None;
                this.loading = false;
                match result {
                    Ok(result) => {
                        this.checked = true;
                        if let Err(e) = this.install_refresh(result, window, cx) {
                            this.error = e.to_string();
                            this.checked = false;
                        } else {
                            this.error.clear();
                        }
                    }
                    Err(e) => {
                        this.error = e.to_string();
                        this.checked = false;
                    }
                }
                this.lock_composer(cx);
                if this.checked {
                    this.start_feed(window, cx);
                }
                if this.refresh_pending {
                    this.refresh_pending = false;
                    this.refresh(false, window, cx);
                }
                cx.notify();
            });
        }));
        cx.notify();
    }
    fn install_refresh(
        &mut self,
        result: Refresh,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> anyhow::Result<()> {
        let changed = self.activities.as_slice() != rows(&result.activities, "items")
            || result.catalog.is_some()
            || result.snapshot.is_some()
            || result
                .native
                .iter()
                .any(|(key, value)| self.native.get(key) != Some(value));
        self.activities = rows(&result.activities, "items").to_vec();
        if let Some(previews) = result.previews {
            self.previews = rows(&previews, "items")
                .iter()
                .map(|item| {
                    (
                        text(item, "thread_id").to_owned(),
                        item["latest_message"].clone(),
                    )
                })
                .collect();
        }
        if let Some((agents, threads, connections)) = result.catalog {
            if let Some(owner) = threads
                .first()
                .or_else(|| agents.first())
                .map(|v| text(v, "owner_id"))
            {
                self.bound = false;
                self.store
                    .bind(self.reads.as_ref().unwrap().origin(), owner)?;
                self.bound = true;
            }
            self.computer
                .update(cx, |computer, cx| computer.set_agents(&agents, cx));
            self.agents = agents;
            self.threads = threads
                .into_iter()
                .filter(|t| t["purpose"] == "conversation")
                .collect();
            self.connections = connections;
            if self.selected.is_none() {
                let tobi = self
                    .agents
                    .iter()
                    .find(|a| a["system_role"] == "tobi")
                    .map(|a| a["id"].clone());
                let first = self
                    .threads
                    .iter()
                    .find(|t| {
                        t["type"] == "dm"
                            && tobi
                                .as_ref()
                                .is_some_and(|id| rows(t, "member_agent_ids").contains(id))
                    })
                    .or_else(|| self.threads.first());
                if let Some(id) = first.and_then(|t| text(t, "id").parse().ok()) {
                    self.select(id, window, cx);
                    return Ok(());
                }
            }
        }
        if let Some(value) = result.snapshot {
            self.bound = false;
            self.store.bind(
                self.reads.as_ref().unwrap().origin(),
                text(&value["thread"], "owner_id"),
            )?;
            self.bound = true;
            let first = self.projection.is_none();
            let mut projection =
                Conversation::new(value, self.selected.context("No selected conversation")?)?;
            if let Some(previous) = &self.projection {
                projection.merge_history(previous.value());
            }
            projection.merge_history(&result.history);
            for part in rows(&projection.value()["timeline"], "parts") {
                self.parts.insert(text(part, "id").into(), part.clone());
            }
            if !self.history_loaded {
                self.history_before = projection.value()["timeline"]["next_before"].as_u64();
            }
            self.projection = Some(projection);
            if first {
                self.scroller
                    .update(cx, |state, cx| state.scroll_to_end(cx));
            }
        } else if let (Some(page), Some(projection)) = (result.events, &mut self.projection) {
            projection.apply(page)?;
        }
        if let Some(opening) = result.opening {
            self.opening = opening;
        }
        for (id, value) in result.native {
            self.native.insert(id, value);
        }
        if changed {
            self.sync_interactions(window, cx);
            self.rebuild_transcript(cx);
            self.prepare_portraits(cx);
            self.refresh_context_resources(cx);
            let name = self
                .selected_agent()
                .map(|agent| text(agent, "name").to_owned())
                .unwrap_or_default();
            self.composer.update(cx, |composer, cx| {
                composer.embedded(
                    format!(
                        "Pesan{}…",
                        if name.is_empty() {
                            String::new()
                        } else {
                            format!(" untuk {name}")
                        }
                    ),
                    window,
                    cx,
                )
            });
            let references = self
                .agents
                .iter()
                .filter(|a| rows(&self.value()["thread"], "member_agent_ids").contains(&a["id"]))
                .map(|agent| crate::models::composer::Reference {
                    kind: crate::models::composer::ReferenceKind::Agent,
                    id: text(agent, "id").into(),
                    label: format!("@{}", text(agent, "name")),
                    source: None,
                    agent_id: None,
                    version: None,
                })
                .chain(rows(self.value(), "artifacts").iter().map(|file| {
                    crate::models::composer::Reference {
                        kind: crate::models::composer::ReferenceKind::File,
                        id: text(file, "id").into(),
                        label: text(file, "name").into(),
                        source: None,
                        agent_id: None,
                        version: None,
                    }
                }))
                .collect();
            self.composer
                .update(cx, |composer, cx| composer.set_catalog(references, cx));
        }
        Ok(())
    }
    pub(super) fn earlier(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.read_task.is_some() {
            return;
        }
        let (Some(thread), Some(before), Some(worker)) =
            (self.selected, self.history_before, &self.reads)
        else {
            return;
        };
        let scope = self.scope;
        let Ok(receiver) = worker.submit(false, move |api| {
            api.get(&format!(
                "/v1/threads/{thread}/timeline?before={before}&limit=100"
            ))
        }) else {
            return;
        };
        self.read_task = Some(cx.spawn_in(window, async move |view, cx| {
            let result = receiver.await.unwrap_or(Err(ClientError::Unavailable));
            let _ = view.update_in(cx, |this, window, cx| {
                if this.scope != scope {
                    return;
                }
                this.read_task = None;
                match result {
                    Ok(history) => {
                        this.history_loaded = true;
                        this.history_before = history["next_before"].as_u64();
                        if let Some(projection) = &mut this.projection {
                            projection.merge_history(&history);
                        }
                        for part in rows(&history, "parts") {
                            this.parts.insert(text(part, "id").into(), part.clone());
                        }
                        this.sync_interactions(window, cx);
                        this.rebuild_transcript(cx);
                        this.prepare_portraits(cx);
                    }
                    Err(e) => this.error = e.to_string(),
                }
                cx.notify();
            });
        }));
    }
}
use anyhow::Context as _;
