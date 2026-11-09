//! Native fixtures prove retained UI ownership separately from backend execution.
use super::{
    Workspace,
    tests::{fixture, init, workspace},
};
use gpui_kit::test::TestWindowExt;
use gpui_kit::{
    AppContext, Bounds, Context, ListOffset, TestAppContext, Window, WindowBounds, WindowOptions,
    px, size,
};
use ngertiin_client::{Conversation, rows, text};
use serde_json::{Value, json};
use uuid::Uuid;

fn for_thread(id: Uuid) -> Value {
    let mut value = fixture("dm");
    let previous = text(&value["thread"], "id").to_owned();
    fn replace(value: &mut Value, old: &str, new: &str) {
        match value {
            Value::String(s) if s == old => *s = new.to_owned(),
            Value::Object(fields) => fields.values_mut().for_each(|v| replace(v, old, new)),
            Value::Array(values) => values.iter_mut().for_each(|v| replace(v, old, new)),
            _ => {}
        }
    }
    replace(&mut value, &previous, &id.to_string());
    value["runs"] = json!([]);
    value["human_requests"] = json!([]);
    value
}
fn hydrate(view: &mut Workspace, value: Value, window: &mut Window, cx: &mut Context<Workspace>) {
    let id = view.selected.unwrap();
    assert_eq!(value["thread"]["id"], id.to_string());
    view.conversation.projection = Some(Conversation::new(value, id).unwrap());
    view.checked = true;
    view.bound = true;
    view.conversation.reconciling = false;
    view.error.clear();
    for part in rows(&view.value()["timeline"], "parts").to_vec() {
        view.conversation
            .parts
            .insert(text(&part, "id").into(), part);
    }
    view.sync_interactions(window, cx);
    view.rebuild_transcript(window, cx);
    view.restore_reading_position(window, cx);
    view.lock_composer(cx);
}
fn options() -> WindowOptions {
    WindowOptions {
        window_bounds: Some(WindowBounds::Windowed(Bounds::new(
            Default::default(),
            size(px(1280.), px(900.)),
        ))),
        ..Default::default()
    }
}

#[gpui_kit::test]
fn switching_threads_preserves_composer_identity_references_selection_and_undo(
    cx: &mut TestAppContext,
) {
    init(cx);
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| {
                let mut view = workspace(for_thread(a), window, cx);
                view.threads.push(for_thread(b)["thread"].clone());
                view.prepare_portraits(cx);
                // Avatar preparation has its own compositor evidence. This
                // navigation fixture starts with its catalogue rows ready.
                for thread in &view.threads {
                    for agent in rows(thread, "member_agent_ids") {
                        view.ready_portraits.insert(format!(
                            "nav:{}:{}",
                            text(thread, "id"),
                            agent.as_str().unwrap()
                        ));
                    }
                }
                view
            })
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| window.render_frame(cx))
        .unwrap();
    cx.run_until_parked();
    let (composer, scroller, snapshot) = cx
        .update_window(handle, |_, window, cx| {
            window.render_frame(cx);
            view.update(cx, |view, cx| {
                let composer = view.conversation.composer.clone();
                composer.update(cx, |composer, cx| {
                    composer.insert_reference(
                        crate::models::composer::Reference {
                            kind: crate::models::composer::ReferenceKind::Agent,
                            id: "agent-one".into(),
                            label: "@Aster".into(),
                            source: None,
                            agent_id: None,
                            version: None,
                        },
                        window,
                        cx,
                    )
                });
            });
            window.input(" tail", cx);
            let composer = view.read(cx).conversation.composer.clone();
            let input = composer.read(cx).input.clone();
            let len = composer.read(cx).snapshot(cx).draft.text.len();
            input.update(cx, |input, cx| {
                input.set_selected_range_with_direction(len - 4..len, true, cx)
            });
            let snapshot = composer.read(cx).snapshot(cx);
            let scroller = view.read(cx).conversation.scroller.clone();
            window.click(gpui_kit::SharedString::from(format!("thread:{b}")), cx);
            assert_eq!(view.read(cx).selected, Some(b));
            assert!(view.read(cx).conversation.reconciling);
            view.update(cx, |view, cx| hydrate(view, for_thread(b), window, cx));
            window.input("B only", cx);
            window.render_frame(cx);
            window.click(gpui_kit::SharedString::from(format!("thread:{a}")), cx);
            (composer, scroller, snapshot)
        })
        .unwrap();
    cx.update_window(handle, |_, window, cx| {
        assert_eq!(
            view.read(cx).conversation.composer.entity_id(),
            composer.entity_id()
        );
        assert_eq!(
            view.read(cx).conversation.scroller.entity_id(),
            scroller.entity_id()
        );
        assert_eq!(composer.read(cx).snapshot(cx), snapshot);
        assert_eq!(snapshot.draft.tokens.len(), 1);
        window.render_frame(cx);
        window.click("send-message", cx);
        assert!(view.read(cx).store.unresolved().is_empty());
        view.update(cx, |view, cx| hydrate(view, for_thread(a), window, cx));
        window.press("cmd-z", cx);
        assert_ne!(
            composer.read(cx).snapshot(cx).draft.text,
            snapshot.draft.text
        );
        assert!(view.read(cx).store.unresolved().is_empty());
        assert_eq!(view.read(cx).store.draft(b), "B only");
    })
    .unwrap();
}

#[gpui_kit::test]
fn thread_switch_and_cold_restore_keep_an_exact_reading_anchor(cx: &mut TestAppContext) {
    init(cx);
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let mut value = for_thread(a);
    let content =
        "A retained paragraph with enough text to wrap across the native viewport. ".repeat(500);
    value["messages"][1]["text"] = content.clone().into();
    value["timeline"]["messages"][1]["text"] = content.into();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(value.clone(), window, cx))
        })
        .unwrap()
    });
    let position = cx
        .update_window(handle, |_, window, cx| {
            window.render_frame(cx);
            view.update(cx, |view, cx| {
                view.conversation.scroller.update(cx, |scroll, cx| {
                    scroll.scroll_to(
                        ListOffset {
                            item_ix: 1,
                            offset_in_item: px(93.),
                        },
                        cx,
                    )
                });
            });
            window.render_frame(cx);
            let position = view
                .read(cx)
                .conversation
                .scroller
                .read(cx)
                .logical_scroll_top();
            assert!(
                !view
                    .read(cx)
                    .conversation
                    .scroller
                    .read(cx)
                    .is_following_tail()
            );
            view.update(cx, |view, cx| {
                view.select(b, window, cx);
                hydrate(view, for_thread(b), window, cx);
                view.select(a, window, cx);
            });
            window.render_frame(cx);
            let restored = view
                .read(cx)
                .conversation
                .scroller
                .read(cx)
                .logical_scroll_top();
            assert_eq!(restored.item_ix, position.item_ix);
            assert!((restored.offset_in_item - position.offset_in_item).abs() < px(1.));
            view.update(cx, |view, cx| {
                view.save_thread_presentation(window, cx).unwrap();
                let saved = view.store.reading_position(a).unwrap();
                assert!(saved.sequence.is_some());
                let fresh = Workspace::new_thread_state(window, cx);
                view.conversation = fresh;
                view.conversation.restore_reading = Some(saved);
                hydrate(view, value.clone(), window, cx);
            });
            position
        })
        .unwrap();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let restored = view
            .read(cx)
            .conversation
            .scroller
            .read(cx)
            .logical_scroll_top();
        assert_eq!(restored.item_ix, position.item_ix);
        assert!((restored.offset_in_item - position.offset_in_item).abs() < px(1.));
    })
    .unwrap();
}

#[gpui_kit::test]
fn retained_question_choices_survive_switching_without_submitting(cx: &mut TestAppContext) {
    init(cx);
    let value = fixture("native-question");
    let a = text(&value["thread"], "id").parse::<Uuid>().unwrap();
    let b = Uuid::new_v4();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(value.clone(), window, cx))
        })
        .unwrap()
    });
    let question=cx.update_window(handle,|_,window,cx| {
        window.render_frame(cx);
        window.within("interaction-options").click(0_usize,cx);
        let question=view.read(cx).conversation.interaction_views.values()
            .find(|bound| matches!(&bound.binding,super::interactions::Binding::Question {question,..} if question=="format"))
            .unwrap().view.clone();
        view.update(cx,|view,cx| {
            view.select(b,window,cx); hydrate(view,for_thread(b),window,cx);
            view.select(a,window,cx); hydrate(view,value.clone(),window,cx);
        });
        question
    }).unwrap();
    cx.update(|cx| {
        assert_eq!(question.read(cx).draft(cx).choices, vec!["Summary"]);
        let state = view.read(cx);
        assert!(
            state
                .conversation
                .interaction_views
                .values()
                .any(|bound| bound.view.entity_id() == question.entity_id())
        );
        assert!(state.store.unresolved().is_empty());
    });
}

#[gpui_kit::test]
fn eviction_releases_idle_views_and_protects_unknown_operations(cx: &mut TestAppContext) {
    init(cx);
    let a = Uuid::new_v4();
    let protected = Uuid::new_v4();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(for_thread(a), window, cx))
        })
        .unwrap()
    });
    let (idle_composer, protected_composer) = cx
        .update_window(handle, |_, window, cx| {
            view.update(cx, |view, cx| {
                let idle = view.conversation.composer.entity_id();
                view.select(protected, window, cx);
                hydrate(view, for_thread(protected), window, cx);
                let protected_composer = view.conversation.composer.entity_id();
                let op = crate::storage::Operation::command(
                    "/v1/runs".into(),
                    json!({}),
                    Some(protected),
                );
                view.store.prepare("uncertain-native-test", op).unwrap();
                for _ in 0..12 {
                    let next = Uuid::new_v4();
                    view.select(next, window, cx);
                    hydrate(view, for_thread(next), window, cx);
                }
                view.select(protected, window, cx);
                assert_eq!(view.conversation.composer.entity_id(), protected_composer);
                hydrate(view, for_thread(protected), window, cx);
                view.select(a, window, cx);
                assert_ne!(view.conversation.composer.entity_id(), idle);
                (idle, protected_composer)
            })
        })
        .unwrap();
    assert_ne!(idle_composer, protected_composer);
}

#[gpui_kit::test]
fn inactive_threads_receive_revisioned_events_and_become_evictable_when_work_finishes(
    cx: &mut TestAppContext,
) {
    init(cx);
    let mut value = fixture("dm");
    let a = text(&value["thread"], "id").parse::<Uuid>().unwrap();
    let b = Uuid::new_v4();
    let mut completed = value["runs"][0].clone();
    let revision = completed["revision"].as_u64().unwrap() + 1;
    completed["revision"] = revision.into();
    completed["status"] = "succeeded".into();
    value["runs"][0]["status"] = "running".into();
    let cursor = value["cursor"].as_u64().unwrap();
    let event = json!({"conversation_thread_id":a,"schema_version":1,"cursor":cursor+1,
        "owner_id":value["thread"]["owner_id"],"type":"run.updated","entity_kind":"run",
        "entity_id":completed["id"],"revision":revision,"created_at":completed["updated_at"],"data":completed});
    let page: ngertiin_client::EventPage =
        serde_json::from_value(json!({"events":[event],"next_cursor":cursor+1})).unwrap();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(value.clone(), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            let original = view.conversation.composer.entity_id();
            view.select(b, window, cx);
            hydrate(view, for_thread(b), window, cx);
            assert_eq!(view.retained_threads.oldest_cursor(), Some(cursor));
            view.retained_threads.apply_events(&page).unwrap();
            view.retained_threads.apply_events(&page).unwrap();
            assert_eq!(view.retained_threads.oldest_cursor(), Some(cursor + 1));
            for _ in 0..12 {
                let id = Uuid::new_v4();
                view.select(id, window, cx);
                hydrate(view, for_thread(id), window, cx);
            }
            view.select(a, window, cx);
            assert_ne!(view.conversation.composer.entity_id(), original);
        })
    })
    .unwrap();
}

#[gpui_kit::test]
fn late_acknowledgement_clears_only_the_originating_cached_composer(cx: &mut TestAppContext) {
    init(cx);
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(for_thread(a), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            view.store.save_draft(a, "Send A once".into()).unwrap();
            view.restore_draft(window, cx);
            let operation = view
                .store
                .submission(a, Some(Uuid::new_v4()), false, "Send A once".into())
                .unwrap();
            let slot = format!("message:{a}");
            let operation = view.store.prepare(&slot, operation).unwrap();
            let scope = view.scope;
            view.select(b, window, cx);
            hydrate(view, for_thread(b), window, cx);
            view.store.save_draft(b, "Unsent B".into()).unwrap();
            view.restore_draft(window, cx);
            view.finish_command(&slot, &operation, scope, Ok(json!({})), window, cx);
            assert_eq!(
                view.conversation.composer.read(cx).snapshot(cx).draft.text,
                "Unsent B"
            );
            view.select(a, window, cx);
            assert!(
                view.conversation
                    .composer
                    .read(cx)
                    .snapshot(cx)
                    .draft
                    .text
                    .is_empty()
            );
            assert!(view.store.pending(&slot).is_none());
            assert_eq!(view.store.draft(b), "Unsent B");
        })
    })
    .unwrap();
}

#[gpui_kit::test]
fn cold_restore_waits_for_contiguous_history_and_cancels_on_user_scroll(cx: &mut TestAppContext) {
    init(cx);
    let id = Uuid::new_v4();
    let mut value = for_thread(id);
    for part in value["timeline"]["parts"].as_array_mut().unwrap() {
        part["sequence"] = (part["sequence"].as_u64().unwrap() + 100).into();
    }
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(value.clone(), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            let position = crate::storage::ReadingPosition {
                row: "message:older:0".into(),
                sequence: Some(50),
                offset: 3.,
                following: false,
            };
            view.conversation.history_before = Some(101);
            view.conversation.restore_reading = Some(position.clone());
            view.restore_reading_position(window, cx);
            assert_eq!(view.conversation.restore_reading, Some(position));
            // A real native scroll notification takes ownership from cold restore;
            // later pages may merge but can no longer move the user's viewport.
            view.conversation
                .scroller
                .update(cx, |_, cx| cx.emit(super::scroll::ScrollChanged));
        })
    })
    .unwrap();
    cx.update(|cx| assert!(view.read(cx).conversation.restore_reading.is_none()));
}

#[gpui_kit::test]
fn an_edit_acknowledged_while_hidden_restores_the_ordinary_draft(cx: &mut TestAppContext) {
    init(cx);
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(for_thread(a), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            view.store.save_draft(a, "Ordinary draft".into()).unwrap();
            view.restore_draft(window, cx);
            let mut message = view.value()["messages"][0].clone();
            message["text"] = "Edited queued input".into();
            view.edit(message.clone(), window, cx);
            let operation = crate::storage::Operation::command(
                format!("/v1/messages/{}/edit", text(&message, "id")),
                json!({"expected_revision":message["revision"],"text":message["text"]}),
                Some(a),
            );
            let slot = "edit:retained";
            let operation = view.store.prepare(slot, operation).unwrap();
            let scope = view.scope;
            view.select(b, window, cx);
            hydrate(view, for_thread(b), window, cx);
            view.finish_command(slot, &operation, scope, Ok(json!({})), window, cx);
            view.select(a, window, cx);
            assert!(view.conversation.editing.is_none());
            assert_eq!(
                view.conversation.composer.read(cx).snapshot(cx).draft.text,
                "Ordinary draft"
            );
            assert_eq!(view.store.draft(a), "Ordinary draft");
        })
    })
    .unwrap();
}

#[gpui_kit::test]
fn retained_history_fills_disjoint_pages_without_skipping_the_older_frontier(
    cx: &mut TestAppContext,
) {
    init(cx);
    let a = Uuid::new_v4();
    let value = for_thread(a);
    let template = value["timeline"]["parts"][0].clone();
    let page = |sequences: &[u64], next: Option<u64>| {
        json!({
            "parts": sequences.iter().map(|sequence| {
                let mut part = template.clone();
                part["id"] = json!(format!("part-{sequence}"));
                part["sequence"] = json!(sequence);
                part
            }).collect::<Vec<_>>(),
            "next_before": next
        })
    };
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(value.clone(), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, _, cx| {
        view.update(cx, |view, _| {
            let state = &mut view.conversation;
            state.parts.clear();
            state.projection = None;
            state.retain_timeline(&page(&[100, 110], Some(100)));
            state.projection = Some(Conversation::new(value, a).unwrap());
            state.retain_timeline(&page(&[310, 320], Some(310)));
            assert_eq!(state.earlier_cursor(), Some(310));
            assert!(state.needs_history_recovery());
            state.retain_earlier(&page(&[210, 220], Some(210)));
            assert_eq!(state.earlier_cursor(), Some(210));
            assert_eq!(state.history_before, Some(100));

            // A switch can cancel recovery, then a later activation can find
            // another new block. Both missing intervals must remain reachable.
            state.retain_timeline(&page(&[510, 520], Some(510)));
            assert_eq!(state.earlier_cursor(), Some(510));
            state.retain_earlier(&page(&[310, 320, 410], Some(310)));
            assert_eq!(state.earlier_cursor(), Some(210));
            state.retain_earlier(&page(&[100, 110, 150], Some(100)));
            assert!(!state.needs_history_recovery());
            assert_eq!(state.earlier_cursor(), Some(100));
            assert_eq!(state.parts.len(), 10);

            state.retain_timeline(&page(&[520, 600], Some(520)));
            assert!(!state.needs_history_recovery());
            assert_eq!(state.earlier_cursor(), Some(100));
            state.retain_earlier(&page(&[20, 30], None));
            assert_eq!(state.earlier_cursor(), None);

            // A previously empty conversation must acquire its first older
            // frontier when its first burst exceeds the latest snapshot page.
            state.parts.clear();
            state.retain_timeline(&page(&[610, 620], Some(610)));
            assert_eq!(state.earlier_cursor(), Some(610));
        });
    })
    .unwrap();
}

#[gpui_kit::test]
fn late_failures_follow_the_originating_thread_across_reactivation(cx: &mut TestAppContext) {
    init(cx);
    let a = Uuid::new_v4();
    let b = Uuid::new_v4();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(for_thread(a), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            let operation = view
                .store
                .submission(a, Some(Uuid::new_v4()), false, "Unsent A".into())
                .unwrap();
            let slot = format!("message:{a}");
            let operation = view.store.prepare(&slot, operation).unwrap();
            let scope = view.scope;
            view.select(b, window, cx);
            hydrate(view, for_thread(b), window, cx);
            view.finish_command(
                &slot,
                &operation,
                scope,
                Err(ngertiin_client::ClientError::Unavailable),
                window,
                cx,
            );
            assert!(view.error.is_empty());
            view.select(a, window, cx);
            let expected = ngertiin_client::ClientError::Unavailable.to_string();
            assert_eq!(view.error, expected);
            hydrate(view, for_thread(a), window, cx);
            let scope = view.scope;
            view.select(b, window, cx);
            hydrate(view, for_thread(b), window, cx);
            view.select(a, window, cx);
            hydrate(view, for_thread(a), window, cx);
            assert_ne!(view.scope, scope);
            view.finish_command(
                &slot,
                &operation,
                scope,
                Err(ngertiin_client::ClientError::Unavailable),
                window,
                cx,
            );
            assert_eq!(view.error, expected);
            assert!(view.store.pending(&slot).is_some());
        });
    })
    .unwrap();
}

#[gpui_kit::test]
fn group_avatar_gutter_is_stable_before_portraits_are_prepared(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(fixture("07-quiet-group"), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let row = view.read(cx).conversation.transcript.iter().rev().find(|row| {
            matches!(&row.kind, super::transcript::RowKind::Message { message, .. } if message["author"] != "user")
        }).unwrap().id.clone();
        let copy = gpui_kit::SharedString::from(format!("copy:{row}"));
        let before = window.find(copy.clone()).bounds();
        view.update(cx, |view, cx| view.prepare_portraits(cx));
        window.render_frame(cx);
        let after = window.find(copy).bounds();
        assert_eq!(before.origin, after.origin, "Portrait preparation must not move an existing message.");
        assert_eq!(before.size, after.size);
    }).unwrap();
}

#[gpui_kit::test]
fn group_portraits_follow_retained_thread_lifetimes(cx: &mut TestAppContext) {
    init(cx);
    let value = fixture("07-quiet-group");
    let a = text(&value["thread"], "id").parse::<Uuid>().unwrap();
    let b = Uuid::new_v4();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| workspace(value, window, cx))
        })
        .unwrap()
    });
    let (key, original, released) = cx
        .update_window(handle, |_, window, cx| {
            view.update(cx, |view, cx| {
                view.prepare_portraits(cx);
                let row = view
                    .conversation
                    .transcript
                    .iter()
                    .rev()
                    .find(|row| {
                        matches!(&row.kind,
                super::transcript::RowKind::Message {message,..} if message["author"] != "user")
                    })
                    .unwrap();
                let agent = match &row.kind {
                    super::transcript::RowKind::Message { message, .. } => {
                        text(message, "author_agent_id")
                    }
                    _ => unreachable!(),
                };
                let key = format!("message:{}:{agent}", row.id);
                let portrait = view.portrait(&key).unwrap();
                let original = portrait.entity_id();
                let released = portrait.downgrade();
                view.select(b, window, cx);
                hydrate(view, for_thread(b), window, cx);
                view.prepare_portraits(cx);
                assert!(view.portrait(&key).is_none());
                assert!(released.upgrade().is_some());
                view.select(a, window, cx);
                assert_eq!(view.portrait(&key).unwrap().entity_id(), original);
                assert!(view.conversation.reconciling);
                (key, original, released)
            })
        })
        .unwrap();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(view.read(cx).portrait(&key).unwrap().entity_id(), original);
        view.update(cx, |view, cx| {
            for _ in 0..12 {
                let id = Uuid::new_v4();
                view.select(id, window, cx);
                hydrate(view, for_thread(id), window, cx);
                view.prepare_portraits(cx);
            }
        });
        window.render_frame(cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update(|_| {
        assert!(
            released.upgrade().is_none(),
            "Eviction must release the thread's avatar entities."
        )
    });
}

#[gpui_kit::test]
fn cold_thread_has_conversation_skeleton_and_a_stable_focused_composer(cx: &mut TestAppContext) {
    use gpui_kit::Focusable;
    init(cx);
    let value = fixture("dm");
    let a = text(&value["thread"], "id").parse::<Uuid>().unwrap();
    let b = Uuid::new_v4();
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(options(), cx, |window, cx| {
            cx.new(|cx| {
                let mut view = workspace(value, window, cx);
                view.threads.push(for_thread(b)["thread"].clone());
                view
            })
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| view.select(b, window, cx));
        window.render_frame(cx);
        assert_eq!(window.find_all("conversation-loading").len(), 1);
        let agent = window.find("loading-bubble:agent-short").bounds();
        let user = window.find("loading-bubble:user-short").bounds();
        let long = window.find("loading-bubble:agent-long").bounds();
        assert!(agent.origin.x < user.origin.x);
        assert!(agent.origin.y < user.origin.y && user.origin.y < long.origin.y);
        assert!(long.size.height > agent.size.height);
        let before = window.find("composer-content").bounds();
        assert!(long.bottom() < before.top());
        let input = view.read(cx).conversation.composer.read(cx).input.clone();
        assert!(input.focus_handle(cx).is_focused(window));
        view.update(cx, |view, cx| {
            hydrate(view, for_thread(b), window, cx);
            view.conversation.composer.update(cx, |composer, cx| composer.embedded("Pesan…".into(), window, cx));
        });
        window.render_frame(cx);
        assert!(window.find_all("conversation-loading").is_empty());
        assert_eq!(before, window.find("composer-content").bounds(), "The input's presentation must be embedded before its first focus, not after a snapshot.");
        view.update(cx, |view, cx| view.select(a, window, cx));
        window.render_frame(cx);
        assert!(view.read(cx).conversation.reconciling);
        assert!(window.find_all("conversation-loading").is_empty(), "Cached conversation content must remain visible during reconciliation.");
        view.update(cx, |view, cx| {
            view.select(Uuid::new_v4(), window, cx);
            view.error = "Offline".into();
        });
        window.render_frame(cx);
        assert!(window.find_all("conversation-loading").is_empty());
        assert_eq!(window.find_all("refresh-workspace").len(), 1);
    }).unwrap();
}
