//! Headless UI integration tests operate the actual workspace and interaction views.
use super::{Panel, Store, Workspace};
use gpui_kit::test::{TestQueryExt, TestWindowExt};
use gpui_kit::{
    AppContext, Bounds, Context, TestAppContext, Window, WindowBounds, WindowOptions, px, size,
};
use ngertiin_client::{Conversation, text};
use serde_json::Value;
use std::{borrow::Cow, path::PathBuf};

fn fixture(name: &str) -> Value {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join(format!("../../verification/nma-071/{name}.json"));
    serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap()
}
fn workspace(value: Value, window: &mut Window, cx: &mut Context<Workspace>) -> Workspace {
    let root = std::env::temp_dir().join(format!("ngertiin-native-ui-{}", uuid::Uuid::new_v4()));
    let store = Store::open(root).unwrap();
    let mut view = Workspace::with_attachment(store, Ok(None), window, cx);
    let id = text(&value["thread"], "id").parse().unwrap();
    view.selected = Some(id);
    view.agents = value["agents"].as_array().unwrap().clone();
    view.threads = vec![value["thread"].clone()];
    view.projection = Some(Conversation::new(value, id).unwrap());
    view.error.clear();
    view.loading = false;
    view.checked = true;
    view.bound = true;
    view.lock_composer(cx);
    for part in ngertiin_client::rows(&view.value()["timeline"], "parts").to_vec() {
        view.parts.insert(text(&part, "id").into(), part);
    }
    for run in ngertiin_client::rows(view.value(), "runs").to_vec() {
        if !ngertiin_client::rows(&run, "native_interactions").is_empty() {
            view.native.insert(
                text(&run, "id").into(),
                serde_json::json!({"records":run["native_interactions"]}),
            );
        }
    }
    view.sync_interactions(window, cx);
    view.rebuild_transcript(window, cx);
    view
}

#[gpui_kit::test]
fn native_question_keeps_back_navigation_and_submits_one_complete_answer(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    Default::default(),
                    size(px(900.), px(800.)),
                ))),
                ..Default::default()
            },
            cx,
            |window, cx| cx.new(|cx| workspace(fixture("native-question"), window, cx)),
        )
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.within("interaction-options").click(0_usize, cx);
        window.render_frame(cx);
        window.click("interaction-answer", cx);
    })
    .unwrap();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.find_all("interaction-answer").is_empty());
        assert_ne!(window.find("question-back").disabled(), Some(true));
        assert!(view.read(cx).store.unresolved().is_empty());
        window.click("question-back", cx);
    })
    .unwrap();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let first = view.read(cx).interaction_views.values().find(|bound| matches!(&bound.binding, super::interactions::Binding::Question {question,..} if question == "format")).unwrap().view.clone();
        assert_eq!(first.read(cx).draft(cx).choices, vec!["Summary"]);
        window.click("interaction-answer", cx);
    }).unwrap();
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            view.store
                .save_draft(view.selected.unwrap(), "A retained native note.".into())
                .unwrap();
            view.restore_draft(window, cx);
        });
        window.render_frame(cx);
        window.click("send-message", cx);
    })
    .unwrap();
    cx.update_window(handle, |_, _, cx| {
        let operations = view.read(cx).store.unresolved();
        assert_eq!(operations.len(), 1);
        let operation = &operations[0].1;
        assert!(operation.request.path.ends_with("/interactions"));
        assert_eq!(
            operation.request.body["answers"],
            serde_json::json!([
                {"questionId":"format","selectedLabel":"Summary"},
                {"questionId":"context","freeText":"A retained native note."}
            ])
        );
    })
    .unwrap();
}
fn init(cx: &mut TestAppContext) {
    cx.update(|cx| {
        gpui_kit::init(cx);
        cx.set_reduce_motion(true);
        let font = crate::platform::assets::root().join("fonts/Geist.ttf");
        cx.text_system()
            .add_fonts(vec![Cow::Owned(std::fs::read(font).unwrap())])
            .unwrap();
    });
}

#[gpui_kit::test]
fn settled_native_questions_keep_the_request_order(cx: &mut TestAppContext) {
    init(cx);
    let (_, view) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            let value = fixture("native-question-settled");
            cx.new(|cx| workspace(value, window, cx))
        })
        .unwrap()
    });
    cx.update(|cx| {
        let questions = view
            .read(cx)
            .transcript
            .iter()
            .filter_map(|row| {
                if let super::transcript::RowKind::Interaction { key, .. } = &row.kind {
                    key.rsplit(':').next()
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        assert_eq!(questions, ["format", "context"]);
    });
}

#[gpui_kit::test]
fn context_tabs_align_and_keyboard_navigation_returns_to_the_composer(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    Default::default(),
                    size(px(1280.), px(900.)),
                ))),
                ..Default::default()
            },
            cx,
            |window, cx| cx.new(|cx| workspace(fixture("dm"), window, cx)),
        )
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.click("conversation-identity", cx);
        window.render_frame(cx);
        let tabs: Vec<_> = (0_usize..3)
            .map(|index| window.find(("context-tab", index)).bounds())
            .collect();
        assert!(tabs.iter().all(|bounds| bounds.size.width > px(70.)));
        assert_eq!(tabs[0].origin.y, tabs[1].origin.y);
        assert_eq!(tabs[1].origin.y, tabs[2].origin.y);
        assert!((tabs[0].size.width - tabs[2].size.width).abs() < px(1.));
        window.click(("context-tab", 1_usize), cx);
        assert!(view.read(cx).panel == Some(Panel::Library));
        let focus = view.read(cx).context_tab_focus[1].clone();
        focus.focus(window, cx);
        window.press("right", cx);
        assert!(view.read(cx).panel == Some(Panel::Computer));
        window.press("escape", cx);
        assert!(view.read(cx).panel.is_none());
    })
    .unwrap();
}

#[gpui_kit::test]
fn question_choice_changes_selection_and_settled_history_has_no_submit_action(
    cx: &mut TestAppContext,
) {
    init(cx);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    Default::default(),
                    size(px(900.), px(800.)),
                ))),
                ..Default::default()
            },
            cx,
            |window, cx| cx.new(|cx| workspace(fixture("02-single-choice"), window, cx)),
        )
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let interaction = view
            .read(cx)
            .interaction_views
            .values()
            .next()
            .unwrap()
            .view
            .clone();
        assert_eq!(window.find("interaction-answer").disabled(), Some(true));
        window.within("interaction-options").click(0_usize, cx);
        window.render_frame(cx);
        assert_eq!(interaction.read(cx).draft(cx).choices, vec!["short"]);
        assert_ne!(window.find("interaction-answer").disabled(), Some(true));
        interaction.update(cx, |view, cx| {
            view.value.state =
                crate::models::message::InteractionState::Resolved(Default::default());
            cx.notify();
        });
        window.render_frame(cx);
        assert!(window.find_all("interaction-answer").is_empty());
        assert!(window.find_all("interaction-options").is_empty());
    })
    .unwrap();
}

#[gpui_kit::test]
fn compact_navigation_sheet_keeps_actions_inside_its_surface(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    Default::default(),
                    size(px(720.), px(500.)),
                ))),
                ..Default::default()
            },
            cx,
            |window, cx| cx.new(|cx| workspace(fixture("dm"), window, cx)),
        )
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, _| {
            let template = view.threads[0].clone();
            for index in 1..32 {
                let mut thread = template.clone();
                thread["id"] = uuid::Uuid::from_u128(index).to_string().into();
                thread["name"] = format!("A long retained conversation title {index}").into();
                view.threads.push(thread);
            }
        });
        window.render_frame(cx);
        window.click("toggle-sidebar", cx);
        window.render_frame(cx);
        let sheet = window.find("sheet-content").bounds();
        let search = window.find("search-conversations").bounds();
        let create = window.find("create-contact").bounds();
        let settings = window.find("workspace-settings").bounds();
        let apps = window.find("app-connections").bounds();
        assert!(sheet.origin.y + sheet.size.height <= window.viewport_size().height + px(1.));
        for bounds in [search, create, settings, apps] {
            assert!(bounds.origin.x >= sheet.origin.x);
            assert!(
                bounds.origin.x + bounds.size.width <= sheet.origin.x + sheet.size.width + px(1.)
            );
            assert!(
                bounds.origin.y + bounds.size.height <= sheet.origin.y + sheet.size.height + px(1.)
            );
            assert!(bounds.origin.y + bounds.size.height <= window.viewport_size().height + px(1.));
        }
        assert!(settings.origin.x + settings.size.width < apps.origin.x);
        assert!(search.origin.x + search.size.width < create.origin.x);
        window.press("escape", cx);
        assert!(window.find_all("sheet-content").is_empty());
        window.render_frame(cx);
        window.click("toggle-sidebar", cx);
        window.render_frame(cx);
        window.click("app-connections", cx);
        window.render_frame(cx);
        assert!(window.find_all("sheet-content").is_empty());
        assert!(view.read(cx).panel == Some(Panel::Detail));
        assert_eq!(view.read(cx).context_title(), "Apps");
        assert!(!window.find_all("connected-apps").is_empty());
        view.update(cx, |view, cx| view.close_context(window, cx));
        window.render_frame(cx);
        window.click("toggle-sidebar", cx);
        window.render_frame(cx);
        window.click("workspace-settings", cx);
        window.render_frame(cx);
        assert!(window.find_all("sheet-content").is_empty());
        assert!(view.read(cx).panel == Some(Panel::Settings));
    })
    .unwrap();
}

#[gpui_kit::test]
fn inline_tables_sort_filter_and_retain_state_across_transcript_updates(cx: &mut TestAppContext) {
    init(cx);
    for (group, width) in [(false, 720.), (true, 720.), (false, 1280.), (true, 1280.)] {
        let (handle, view) = cx.update(|cx| {
            gpui_kit::open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        Default::default(), size(px(width), px(1000.)),
                    ))),
                    ..Default::default()
                }, cx, |window, cx| {
                    let mut value = fixture("dm");
                    if group { value["thread"]["type"] = "group".into(); }
                    let content = "| Name | Value |\n| --- | ---: |\n| **Alpha** | 42 |\n| Beta | 7 |\n| Gamma | 11 |\n| Delta | 12 |\n| Epsilon | 13 |\n| Zeta | 14 |\n| Eta | 15 |\n| Theta | 16 |\n| Iota | 17 |";
                    value["messages"][1]["text"] = content.into();
                    value["timeline"]["messages"][1]["text"] = content.into();
                    cx.new(|cx| workspace(value, window, cx))
                },
            ).unwrap()
        });
        cx.update_window(handle, |_, window, cx| window.render_frame(cx))
            .unwrap();
        cx.run_until_parked();
        let table = cx
            .update_window(handle, |_, window, cx| {
                window.render_frame(cx);
                assert_eq!(window.find_all("inline-rich-table").len(), 1);
                let bounds = window.find("inline-rich-table").bounds();
                assert!(bounds.size.width >= px(360.));
                assert!(bounds.size.width < px(400.));
                let painted = gpui_kit::base::test_support::texts(window);
                let cells = painted
                    .iter()
                    .filter(|text| bounds.contains(&text.bounds().center()))
                    .collect::<Vec<_>>();
                assert!(
                    cells.iter().any(|text| text.text() == "Alpha"),
                    "Actual native cell text: {cells:?}"
                );
                assert!(
                    cells
                        .iter()
                        .all(|text| !text.text().trim().starts_with('|')),
                    "Raw Markdown delimiters reached painting: {cells:?}"
                );
                let table = view
                    .read(cx)
                    .transcript
                    .iter()
                    .find_map(|row| match &row.kind {
                        super::transcript::RowKind::Message { tables, .. } => {
                            tables.values().next().cloned()
                        }
                        _ => None,
                    })
                    .unwrap();
                window.click(("sort-column", 1_usize), cx);
                assert!(
                    table
                        .read(cx)
                        .csv_snapshot()
                        .starts_with("Name,Value\r\nBeta,7\r\nGamma,11"),
                    "{}",
                    table.read(cx).csv_snapshot()
                );
                window.click(("sort-column", 1_usize), cx);
                assert!(
                    table
                        .read(cx)
                        .csv_snapshot()
                        .starts_with("Name,Value\r\nAlpha,42")
                );
                window.click(("sort-column", 1_usize), cx);
                assert!(
                    table
                        .read(cx)
                        .csv_snapshot()
                        .starts_with("Name,Value\r\nAlpha,42\r\nBeta,7")
                );
                window.click("inline-table-filter", cx);
                window.input("Beta", cx);
                table
            })
            .unwrap();
        cx.update_window(handle, |_, window, cx| {
            window.render_frame(cx);
            assert_eq!(table.read(cx).csv_snapshot(), "Name,Value\r\nBeta,7");
            view.update(cx, |view, cx| view.rebuild_transcript(window, cx));
            window.render_frame(cx);
            let retained = view
                .read(cx)
                .transcript
                .iter()
                .find_map(|row| match &row.kind {
                    super::transcript::RowKind::Message { tables, .. } => {
                        tables.values().next().cloned()
                    }
                    _ => None,
                })
                .unwrap();
            assert_eq!(retained.entity_id(), table.entity_id());
            assert_eq!(retained.read(cx).csv_snapshot(), "Name,Value\r\nBeta,7");
            window.hover("inline-rich-table", cx);
            window.click("copy-table", cx);
            assert_eq!(
                cx.read_from_clipboard().unwrap().text().as_deref(),
                Some("Name,Value\r\nBeta,7")
            );
            window.click(("inline-cell", 3_usize), cx);
            window.press("cmd-c", cx);
            assert_eq!(
                cx.read_from_clipboard().unwrap().text().as_deref(),
                Some("7")
            );
            window.press("cmd-a", cx);
            window.press("cmd-c", cx);
            assert_eq!(
                cx.read_from_clipboard().unwrap().text().as_deref(),
                Some("Beta\t7")
            );
        })
        .unwrap();
    }
}

#[gpui_kit::test]
fn group_routing_uses_a_compact_attributed_status_bubble(cx: &mut TestAppContext) {
    init(cx);
    let (handle, _) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(fixture("group-routing"), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let bubble = window.find("group-routing-status");
        assert_eq!(bubble.role(), Some(gpui_kit::Role::Status));
        assert!(bubble.bounds().size.width <= px(448.));
        assert!(bubble.bounds().size.height < px(90.));
        assert!(
            bubble
                .label()
                .unwrap()
                .starts_with("NMA071 Native journey: ")
        );
    })
    .unwrap();
}

#[gpui_kit::test]
fn rich_reply_keeps_prose_table_and_code_in_one_message_bubble(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(fixture("dm"), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        let replies = view
            .read(cx)
            .transcript
            .iter()
            .filter_map(|row| match &row.kind {
                super::transcript::RowKind::Message {
                    message,
                    content,
                    tables,
                    ..
                } if message["author"] == "agent" => Some((content, tables)),
                _ => None,
            })
            .collect::<Vec<_>>();
        assert_eq!(replies.len(), 1);
        assert!(replies[0].0.contains("# Review"));
        assert!(replies[0].0.contains("| Alpha | 42 |"));
        assert!(replies[0].0.contains("export const ready = true;"));
        assert_eq!(replies[0].1.len(), 1);
        window.render_frame(cx);
        assert_eq!(window.find_all("inline-rich-table").len(), 1);
    })
    .unwrap();
}

#[gpui_kit::test]
fn streamed_tables_install_the_native_renderer_when_the_header_arrives(cx: &mut TestAppContext) {
    init(cx);
    let prefix = "# Streaming reply\n\nReady.\n\n";
    let (handle, view) = cx.update(|cx| {
        let mut value = fixture("dm");
        value["messages"][1]["text"] = prefix.into();
        value["timeline"]["messages"][1]["text"] = prefix.into();
        value["messages"][1]["state"] = "partial".into();
        value["timeline"]["messages"][1]["state"] = "partial".into();
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(value, window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| window.render_frame(cx))
        .unwrap();
    for (suffix, table_expected) in [
        ("| Name | Value |", false),
        ("| Name | Value |\n| --- | ---: |\n", true),
        ("| Name | Value |\n| --- | ---: |\n| Alpha | 42 |\n", true),
        (
            "| Name | Value |\n| --- | ---: |\n| Alpha | 42 |\n| Beta | 7 |\n\n```text\n日本語 café",
            true,
        ),
        (
            "| Name | Value |\n| --- | ---: |\n| Alpha | 42 |\n| Beta | 7 |\n\n```text\n日本語 café\n```\n\nComplete.",
            true,
        ),
    ] {
        cx.update_window(handle, |_, window, cx| {
            view.update(cx, |view, cx| {
                let content = format!("{prefix}{suffix}");
                let mut value = view.value().clone();
                value["messages"][1]["text"] = content.clone().into();
                value["timeline"]["messages"][1]["text"] = content.into();
                if suffix.ends_with("Complete.") {
                    value["messages"][1]["state"] = "complete".into();
                    value["timeline"]["messages"][1]["state"] = "complete".into();
                }
                view.projection = Some(Conversation::new(value, view.selected.unwrap()).unwrap());
                view.rebuild_transcript(window, cx);
            });
            window.render_frame(cx);
        })
        .unwrap();
        cx.run_until_parked();
        cx.update_window(handle, |_, window, cx| {
            window.render_frame(cx);
            assert_eq!(
                window.find_all("inline-rich-table").len(),
                usize::from(table_expected)
            );
            if table_expected {
                assert!(window.find("inline-rich-table").bounds().size.width >= px(384.));
            }
            if suffix.ends_with("Complete.") {
                let painted = gpui_kit::base::test_support::texts(window);
                assert!(
                    painted.iter().any(|text| text.text().contains("Complete.")),
                    "Trailing final paragraph missing: {painted:?}"
                );
                assert!(
                    painted
                        .iter()
                        .any(|text| text.text().contains("日本語 café")),
                    "Final code text missing: {painted:?}"
                );
            }
        })
        .unwrap();
    }
}

#[gpui_kit::test]
fn conversation_and_composer_follow_the_header_width_on_wide_windows(cx: &mut TestAppContext) {
    init(cx);
    let (handle, user_id) = cx.update(|cx| {
        let mut value = fixture("dm");
        let user_id = text(&value["messages"][0], "id").to_owned();
        let long =
            "A longer native sentence should use the available conversation width. ".repeat(40);
        value["messages"][0]["text"] = long.clone().into();
        value["timeline"]["messages"][0]["text"] = long.into();
        let (handle, _) = gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    Default::default(),
                    size(px(1920.), px(1080.)),
                ))),
                ..Default::default()
            },
            cx,
            |window, cx| cx.new(|cx| workspace(value, window, cx)),
        )
        .unwrap();
        (handle, user_id)
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let header = window.find("conversation-header").bounds();
        let composer = window.find("composer-content").bounds();
        let row = window
            .find(gpui_kit::SharedString::from(format!("message:{user_id}:0")))
            .bounds();
        let bubble = window
            .find(gpui_kit::SharedString::from(format!(
                "bubble:message:{user_id}:0"
            )))
            .bounds();
        assert!(header.size.width > px(1500.));
        assert!((composer.size.width - (header.size.width - px(40.))).abs() < px(1.));
        assert!((composer.origin.x - (header.origin.x + px(20.))).abs() < px(1.));
        assert!((row.size.width - header.size.width).abs() < px(1.));
        assert!(bubble.size.width > px(700.));
        assert!(bubble.right() <= header.right());
    })
    .unwrap();
}

#[gpui_kit::test]
fn short_one_and_two_column_tables_keep_their_minimum_width_inside_the_bubble(
    cx: &mut TestAppContext,
) {
    init(cx);
    for columns in [1, 2] {
        let (handle, _) = cx.update(|cx| {
            let mut value = fixture("dm");
            let text = if columns == 1 {
                "| Item |\n| --- |\n| A |"
            } else {
                "| Item | Value |\n| --- | ---: |\n| A | 1 |"
            };
            value["messages"][1]["text"] = text.into();
            value["timeline"]["messages"][1]["text"] = text.into();
            gpui_kit::open_window(
                WindowOptions {
                    window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                        Default::default(),
                        size(px(720.), px(900.)),
                    ))),
                    ..Default::default()
                },
                cx,
                |window, cx| cx.new(|cx| workspace(value, window, cx)),
            )
            .unwrap()
        });
        cx.update_window(handle, |_, window, cx| {
            window.render_frame(cx);
        })
        .unwrap();
        cx.run_until_parked();
        cx.update_window(handle, |_, window, cx| {
            window.render_frame(cx);
            let bounds = window.find("inline-rich-table").bounds();
            assert!(bounds.size.width >= px(384.));
            assert!(bounds.right() <= window.viewport_size().width);
        })
        .unwrap();
    }
}

fn human_fixture(options: Value, approval: bool) -> Value {
    let mut value = fixture("dm");
    let request = serde_json::json!({
        "id":uuid::Uuid::new_v4(),"revision":1,"state":"pending",
        "thread_id":value["thread"]["id"],"agent_id":value["agents"][0]["id"],
        "source_run_id":value["runs"][0]["id"],"message_id":value["messages"][1]["id"],
        "created_at":value["messages"][1]["created_at"],
        "updated_at":value["messages"][1]["created_at"],"owner_id":value["thread"]["owner_id"],
        "kind":"human_request","task_id":null,"response_message_id":null,"continuation_run_id":null,
        "action_fingerprint":null,"decision":null,"decision_evidence":null,"decision_source":null,"effect_command_id":null,
        "purpose":if approval {"approval"}else{"input"},"options":options,
        "action":if approval {serde_json::json!({"tool_name":"ngertiin.create_file","arguments":{"path":"review.md","base64":"IyBSZXZpZXcK","command_id":"internal-identity"}})}else{Value::Null}
    });
    value["human_requests"] = serde_json::json!([request]);
    value["messages"][1]["text"] = "Review this decision?".into();
    value["timeline"]["messages"][1]["text"] = "Review this decision?".into();
    value
}

#[gpui_kit::test]
fn comprehensive_uncertain_question_locks_send_and_exposes_status_check(cx: &mut TestAppContext) {
    use crate::models::message::InteractionState;
    init(cx);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(human_fixture(Value::Null, false), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        let card = view
            .read(cx)
            .interaction_views
            .values()
            .next()
            .unwrap()
            .view
            .clone();
        card.update(cx, |card, cx| {
            card.value.state = InteractionState::Uncertain;
            cx.notify();
        });
        view.update(cx, |view, cx| {
            view.store
                .save_draft(view.selected.unwrap(), "Retained answer".into())
                .unwrap();
            view.restore_draft(window, cx);
            view.lock_composer(cx);
        });
        window.render_frame(cx);
        assert_eq!(window.find("send-message").disabled(), Some(true));
        window.click("send-message", cx);
        view.update(cx, |view, cx| view.send(window, cx));
        assert!(view.read(cx).store.unresolved().is_empty());
        window.click("interaction-check", cx);
        assert_eq!(card.read(cx).value.state, InteractionState::Checking);
        assert_eq!(
            view.read(cx).store.draft(view.read(cx).selected.unwrap()),
            "Retained answer"
        );
    })
    .unwrap();
}

#[gpui_kit::test]
fn comprehensive_approval_exposes_readable_decision_data_without_internal_ids(
    cx: &mut TestAppContext,
) {
    init(cx);
    let (handle, _) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(human_fixture(Value::Null, true), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| window.render_frame(cx))
        .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let text = window
            .elements()
            .iter()
            .filter_map(|element| element.label().map(str::to_owned))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(
            text.contains("review.md") && text.contains("# Review"),
            "Decision data: {text}"
        );
        assert!(!text.contains("internal-identity") && !text.contains("IyBSZXZpZXcK"));
        assert!(window.find_all("approval-details").is_empty());
        assert_ne!(
            window
                .find(gpui_kit::SharedString::from("approval:approve"))
                .disabled(),
            Some(true)
        );
    })
    .unwrap();
}

#[gpui_kit::test]
fn comprehensive_multiple_choice_keeps_custom_text_as_an_additional_answer(
    cx: &mut TestAppContext,
) {
    use crate::models::message::CustomAnswer;
    init(cx);
    let options = serde_json::json!({"choices":[{"id":"a","label":"Header"}],"min":2,"max":2,"allow_custom":true});
    let (_, view) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(human_fixture(options, false), window, cx))
        })
        .unwrap()
    });
    cx.update(|cx| {
        let card = view
            .read(cx)
            .interaction_views
            .values()
            .next()
            .unwrap()
            .view
            .read(cx);
        assert_eq!(card.value.rules.custom, CustomAnswer::Additional);
        assert!(
            card.value
                .reply(vec!["a".into()], Some("Check Unicode"))
                .is_ok()
        );
        assert!(card.value.reply(vec![], Some("Check Unicode")).is_err());
    });
}

#[gpui_kit::test]
fn comprehensive_blocked_activity_guides_the_owner_to_settings(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = cx.update(|cx| {
        let mut value = fixture("dm");
        value["runs"][0]["status"] = "queued".into();
        value["runs"][0]["publication"] = "immediate".into();
        value["runs"][0]["preparation"] = serde_json::json!({"state":"blocked","attempts":1,"next_attempt_at":null});
        value["runs"][0]["diagnostic"] =
            serde_json::json!({"code":"LOGIN_REQUIRED","category":"authentication","outcome":"not_dispatched"});
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(value, window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| window.render_frame(cx))
        .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let id = text(&view.read(cx).value()["runs"][0], "id").to_owned();
        assert_eq!(
            window.find("activity-guidance").label(),
            Some("Sign in to get started.")
        );
        window.click(
            gpui_kit::SharedString::from(format!("activity-settings:{id}")),
            cx,
        );
        assert!(view.read(cx).panel == Some(Panel::Settings));
    })
    .unwrap();
}

#[gpui_kit::test]
fn comprehensive_milestones_batch_without_hiding_actionable_events(cx: &mut TestAppContext) {
    init(cx);
    let (handle,view)=cx.update(|cx|{
        let mut value=fixture("dm");
        let at=value["messages"][0]["created_at"].clone();
        let mut parts=vec![value["timeline"]["parts"][0].clone()];
        for (index,kind) in ["goal_created","goal_created","goal_blocked","goal_blocked","routine_created","routine_created"].iter().enumerate() {
            parts.push(serde_json::json!({"id":format!("event-{index}"),"kind":kind,"name":"Review result","summary":"Keep the retained evidence.","actors":[],"sequence":index+2,"source_cursor":index+2,"thread_id":value["thread"]["id"],"message_id":null,"source_message_id":null,"created_at":at,"resource_id":null}));
        }
        value["timeline"]["parts"]=serde_json::json!(parts);
        gpui_kit::open_window(WindowOptions::default(),cx,|window,cx|cx.new(|cx|workspace(value,window,cx))).unwrap()
    });
    cx.update_window(handle,|_,window,cx|{
        window.render_frame(cx);
        let rows=&view.read(cx).transcript;
        assert_eq!(rows.iter().filter(|row|matches!(&row.kind,super::transcript::RowKind::Milestones(parts) if parts.len()==2)).count(),1);
        let trigger=gpui_kit::SharedString::from("milestone-batch:event-0");
        assert!(window.find_all(gpui_kit::SharedString::from("milestone:event-0")).is_empty());
        window.click(trigger,cx);
        window.render_frame(cx);
        assert!(!window.find_all(gpui_kit::SharedString::from("milestone:event-0")).is_empty());
        assert!(!window.find_all(gpui_kit::SharedString::from("milestone:event-2")).is_empty());
    }).unwrap();
}

#[gpui_kit::test]
fn comprehensive_composer_does_not_send_uncommitted_ime_text(cx: &mut TestAppContext) {
    use gpui_kit::EntityInputHandler;
    init(cx);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(fixture("dm"), window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        let input = view.read(cx).composer.read(cx).input.clone();
        input.update(cx, |input, cx| {
            input.focus(window, cx);
            input.replace_and_mark_text_in_range(None, "日本語", Some(3..3), window, cx);
        });
        window.render_frame(cx);
        window.click("send-message", cx);
        assert!(view.read(cx).store.unresolved().is_empty());
        input.update(cx, |input, cx| input.unmark_text(window, cx));
        window.render_frame(cx);
        window.click("send-message", cx);
        view.update(cx, |view, cx| view.send(window, cx));
        let unresolved = view.read(cx).store.unresolved();
        assert_eq!(unresolved.len(), 1);
        assert_eq!(unresolved[0].1.request.body["text"], "日本語");
    })
    .unwrap();
}
