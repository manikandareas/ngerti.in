//! Real native components, with fixture projections and no provider execution.
use super::tests::{fixture, init, workspace};
use super::{Workspace, transcript};
use gpui_kit::prelude::FluentBuilder as _;
use gpui_kit::test::TestWindowExt;
use gpui_kit::{
    AnyWindowHandle, AppContext, Bounds, Context, Entity, Focusable, ParentElement, Render, Styled,
    TestAppContext, Window, WindowBounds, WindowOptions, div, point, px, size,
};
use serde_json::json;
use std::{cell::Cell, rc::Rc};

fn window(cx: &mut TestAppContext) -> (AnyWindowHandle, Entity<Workspace>) {
    cx.update(|cx| {
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
    })
}

#[gpui_kit::test]
fn find_navigates_rendered_messages_updates_after_parse_and_restores_focus(
    cx: &mut TestAppContext,
) {
    init(cx);
    let (handle, view) = window(cx);
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.click("find-in-conversation", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.input("review", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(window.find("thread-find-count").label(), Some("1 / 2"));
        let bar = window.find("thread-find").bounds();
        let header = window.find("conversation-header").bounds();
        assert!((bar.size.width - header.size.width).abs() < px(1.));
        assert!((bar.right() - header.right()).abs() < px(1.));
        assert!(
            window.find("thread-find-query").bounds().top()
                >= window.find("conversation-header").bounds().bottom()
        );
        window.click("thread-find-next", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(window.find("thread-find-count").label(), Some("2 / 2"));
        view.update(cx, |view, cx| {
            let body = view
                .conversation
                .transcript
                .iter()
                .find_map(|row| match &row.kind {
                    transcript::RowKind::Message { message, body, .. }
                        if message["author"] == "agent" =>
                    {
                        Some(body.clone())
                    }
                    _ => None,
                })
                .unwrap();
            let source = body.read(cx).rendered_text().source().to_owned();
            body.update(cx, |body, cx| {
                body.set_text(&format!("{source}\n\nAnother review."), cx)
            });
        });
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(window.find("thread-find-count").label(), Some("2 / 3"));
        window.click("thread-find-close", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.try_find("thread-find-query").is_none());
        assert!(!view.read(cx).conversation.find.read(cx).open);
        assert!(view.read(cx).store.unresolved().is_empty());
    })
    .unwrap();
}

#[gpui_kit::test]
fn find_stays_inside_a_narrow_conversation_pane(cx: &mut TestAppContext) {
    init(cx);
    let (handle, _) = cx.update(|cx| {
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    Default::default(),
                    size(px(520.), px(700.)),
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
        window.click("find-in-conversation", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.input("review", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        let bar = window.find("thread-find").bounds();
        let header = window.find("conversation-header").bounds();
        assert!(bar.left() >= header.left());
        assert!(bar.right() <= header.right() + px(1.));
        assert!(window.find("thread-find-query").bounds().size.width > px(120.));
        assert!(window.find("thread-find-close").bounds().right() <= bar.right());
        let field = window.find("thread-find-field").bounds();
        assert!(field.bottom() <= bar.bottom());
        assert!(window.find("thread-find-next").bounds().right() <= field.right());
        assert!(
            (field.center().y - window.find("thread-find-close").bounds().center().y).abs()
                < px(1.)
        );
    })
    .unwrap();
}

struct SearchOverlapProbe {
    find: Entity<super::thread_search::ThreadSearch>,
    clicks: Rc<Cell<usize>>,
}
impl Render for SearchOverlapProbe {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl gpui_kit::IntoElement {
        use crate::ui::{
            controls::{ButtonKind, button},
            theme::Palette,
        };
        let clicks = self.clicks.clone();
        div()
            .size_full()
            .relative()
            .child(
                button(
                    "behind-search",
                    "Underlying action",
                    ButtonKind::Ghost,
                    Palette::new(false),
                    cx,
                )
                .absolute()
                .inset_0()
                .size_full()
                .on_click(move |_, _, _| clicks.set(clicks.get() + 1)),
            )
            .when(self.find.read(cx).open, |view| {
                view.child(self.find.clone())
            })
    }
}

#[gpui_kit::test]
fn search_blocks_clicks_to_actions_beneath_it_and_releases_them_when_closed(
    cx: &mut TestAppContext,
) {
    init(cx);
    let clicks = Rc::new(Cell::new(0));
    let (handle, probe) = cx.update(|cx| {
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    Default::default(),
                    size(px(800.), px(300.)),
                ))),
                ..Default::default()
            },
            cx,
            |window, cx| {
                let find = cx.new(|cx| super::thread_search::ThreadSearch::new(window, cx));
                find.update(cx, |find, cx| find.show(window, cx));
                cx.new(|_| SearchOverlapProbe {
                    find,
                    clicks: clicks.clone(),
                })
            },
        )
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.click_at("behind-search", point(px(10.), px(150.)), cx);
        assert_eq!(clicks.get(), 1);
        window.click("thread-find-query", cx);
        window.input("needle", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(window.find("thread-find-count").label(), Some("0 / 0"));
        assert_eq!(clicks.get(), 1);
        window.click_at("thread-find", point(px(4.), px(4.)), cx);
        assert_eq!(clicks.get(), 1);
        window.click("thread-find-next", cx);
        assert_eq!(clicks.get(), 1);
        window.click("thread-find-close", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(!probe.read(cx).find.read(cx).open);
        assert_eq!(clicks.get(), 1);
        window.click_at("behind-search", point(px(200.), px(28.)), cx);
        assert_eq!(clicks.get(), 2);
    })
    .unwrap();
}

#[gpui_kit::test]
fn search_header_toggles_and_preserves_the_query_and_keyboard_focus(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = window(cx);
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            view.conversation
                .composer
                .read(cx)
                .input
                .clone()
                .update(cx, |input, cx| input.focus(window, cx));
        });
        window.render_frame(cx);
        window.press("cmd-f", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.try_find("thread-find-count").is_none());
        assert!(window.try_find("thread-find-next").is_none());
        assert!(window.find("thread-find").bounds().size.height < px(60.));
        window.input("review", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(window.find("thread-find-count").label(), Some("1 / 2"));
        window.click("find-in-conversation", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.try_find("thread-find-query").is_none());
        assert!(
            view.read(cx)
                .conversation
                .composer
                .read(cx)
                .input
                .read(cx)
                .focus_handle(cx)
                .is_focused(window)
        );
        window.click("find-in-conversation", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(window.find("thread-find-count").label(), Some("1 / 2"));
        window.press("cmd-f", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.try_find("thread-find-query").is_some());
        window.click("find-in-conversation", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.try_find("thread-find-query").is_none());
        assert!(view.read(cx).store.unresolved().is_empty());
    })
    .unwrap();
}

fn catalog(view: &mut Workspace) {
    let connection = view.agents[0]["connection_id"].clone();
    view.connections = vec![json!({
        "id":connection,"harness":"codex","state":"active","login":"authenticated",
        "authentication":{"billing_source":"subscription"},"effective_billing_source":"subscription",
        "capabilities":{"steer":"supported"},
        "models":[{"id":"gpt-fast","reasoning":["low","high"]},{"id":"gpt-careful","reasoning":["low","high"]}]
    })];
    view.agents[0]["model_id"] = json!("gpt-fast");
}

#[gpui_kit::test]
fn compact_effort_menu_keeps_revision_bound_selection(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = window(cx);
    cx.update(|cx| {
        view.update(cx, |view, _| {
            catalog(view);
            view.agents[0]["reasoning"] = json!("high");
        })
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.click("model-picker", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.find("native-model-catalog").bounds().size.width < px(360.));
        window.click("model-effort", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.press("down", cx);
        window.press("enter", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update(|cx| {
        let view = view.read(cx);
        let operations = view.store.unresolved();
        assert_eq!(operations.len(), 1);
        assert_eq!(
            operations[0].1.request.body["changes"],
            json!({"reasoning":"low"})
        );
        assert_eq!(
            operations[0].1.request.body["expected_revision"],
            view.agents[0]["revision"]
        );
        assert_eq!(view.agents[0]["reasoning"], "high");
        assert!(!view.model_catalog.read(cx).open);
    });
}

#[gpui_kit::test]
fn model_search_confirms_explicit_billing_without_optimistic_agent_mutation(
    cx: &mut TestAppContext,
) {
    init(cx);
    let (handle, view) = window(cx);
    cx.update(|cx| view.update(cx, |view, _| catalog(view)));
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.click("model-picker", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.try_find("native-model-catalog").is_some());
        window.input("care", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.press("enter", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update(|cx| {
        let view = view.read(cx);
        let operations = view.store.unresolved();
        assert_eq!(operations.len(), 1);
        let changes = &operations[0].1.request.body["changes"];
        assert_eq!(changes["model_id"], "gpt-careful");
        assert_eq!(changes["connection_id"], view.agents[0]["connection_id"]);
        assert_eq!(changes["billing_source"], "subscription");
        assert_eq!(view.agents[0]["model_id"], "gpt-fast");
    });
}

#[gpui_kit::test]
fn stale_model_choice_cannot_replace_a_new_agent_revision(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = window(cx);
    cx.update(|cx| view.update(cx, |view, _| catalog(view)));
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.click("model-picker", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.input("care", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, _| {
            view.agents[0]["revision"] = json!(9999);
        });
        window.render_frame(cx);
        window.press("enter", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update(|cx| {
        assert!(view.read(cx).store.unresolved().is_empty());
        assert!(view.read(cx).error.contains("configuration changed"));
    });
}

#[gpui_kit::test]
fn composer_file_completion_accepts_tab_without_submitting(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = window(cx);
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            view.conversation.composer.update(cx, |composer, cx| {
                composer.set_catalog(
                    vec![crate::models::composer::Reference {
                        kind: crate::models::composer::ReferenceKind::File,
                        id: uuid::Uuid::new_v4().to_string(),
                        label: "review.md".into(),
                        source: None,
                        agent_id: None,
                        version: None,
                    }],
                    cx,
                )
            });
        });
        window.render_frame(cx);
        view.update(cx, |view, cx| {
            view.conversation
                .composer
                .read(cx)
                .input
                .clone()
                .update(cx, |input, cx| input.focus(window, cx));
        });
        window.input("@rvmd", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.try_find("composer-suggestions").is_some());
        window.press("tab", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update(|cx| {
        let view = view.read(cx);
        let snapshot = view.conversation.composer.read(cx).snapshot(cx);
        assert_eq!(snapshot.draft.tokens.len(), 1);
        assert_eq!(snapshot.draft.tokens[0].reference.label, "review.md");
        assert!(view.store.unresolved().is_empty());
    });
}

#[gpui_kit::test]
fn queue_keyboard_edit_preserves_the_message_until_authoritative_mutation(cx: &mut TestAppContext) {
    init(cx);
    let mut value = fixture("dm");
    let mut message = value["messages"][0].clone();
    let message_id = uuid::Uuid::new_v4().to_string();
    let run_id = uuid::Uuid::new_v4().to_string();
    message["id"] = json!(message_id);
    message["run_id"] = json!(run_id);
    message["text"] = json!("The queued follow-up");
    let mut run = value["runs"][0].clone();
    run["id"] = json!(run_id);
    run["input_message_id"] = json!(message_id);
    run["status"] = json!("queued");
    run["native_run_id"] = serde_json::Value::Null;
    value["messages"].as_array_mut().unwrap().push(message);
    value["runs"].as_array_mut().unwrap().push(run);
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(WindowOptions::default(), cx, |window, cx| {
            cx.new(|cx| workspace(value, window, cx))
        })
        .unwrap()
    });
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            view.conversation
                .composer
                .read(cx)
                .input
                .clone()
                .update(cx, |input, cx| input.focus(window, cx))
        });
        window.render_frame(cx);
        window.press("up", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        assert_eq!(
            view.read(cx).conversation.editing.as_ref().unwrap()["id"],
            message_id
        );
        assert_eq!(
            view.read(cx)
                .conversation
                .composer
                .read(cx)
                .snapshot(cx)
                .draft
                .text,
            "The queued follow-up"
        );
        assert!(view.read(cx).store.unresolved().is_empty());
        window.render_frame(cx);
        window.click("cancel-edit", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(view.read(cx).conversation.editing.is_none());
        assert_eq!(
            view.read(cx)
                .conversation
                .composer
                .read(cx)
                .snapshot(cx)
                .draft
                .text,
            ""
        );
        window.click(
            gpui_kit::SharedString::from(format!("delete:{message_id}")),
            cx,
        );
    })
    .unwrap();
    cx.run_until_parked();
    cx.update(|cx| {
        let view = view.read(cx);
        let operations = view.store.unresolved();
        assert_eq!(operations.len(), 1);
        assert!(
            operations[0]
                .1
                .request
                .path
                .ends_with(&format!("{message_id}/delete"))
        );
        assert!(
            ngertiin_client::rows(view.value(), "messages")
                .iter()
                .any(|message| message["id"] == message_id)
        );
    });
}

#[gpui_kit::test]
fn find_shortcut_invalid_regex_and_escape_keep_private_reference_syntax_out(
    cx: &mut TestAppContext,
) {
    init(cx);
    let (handle, view) = window(cx);
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        view.update(cx, |view, cx| {
            view.conversation
                .composer
                .read(cx)
                .input
                .clone()
                .update(cx, |input, cx| input.focus(window, cx))
        });
        window.render_frame(cx);
        window.press("cmd-f", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.input("ngertiin://", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(window.find("thread-find-count").label(), Some("0 / 0"));
        window.press("cmd-a", cx);
        window.input("[", cx);
        window.click("thread-find-options", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.press("down", cx);
        window.press("down", cx);
        window.press("down", cx);
        window.press("enter", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(
            window.find("thread-find-count").label(),
            Some("Invalid or overly complex expression")
        );
        window.click("thread-find-query", cx);
        window.press("escape", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert!(window.try_find("thread-find-query").is_none());
        assert!(view.read(cx).store.unresolved().is_empty());
    })
    .unwrap();
}

#[gpui_kit::test]
fn model_favorites_persist_locally_and_only_one_anchor_opens(cx: &mut TestAppContext) {
    init(cx);
    let (handle, view) = window(cx);
    cx.update(|cx| {
        view.update(cx, |view, _| {
            catalog(view);
            view.panel = Some(super::Panel::Detail);
        })
    });
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.click("model-picker", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        assert_eq!(window.find_all("native-model-catalog").len(), 1);
        window.click("favorite-model", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update(|cx| {
        let view = view.read(cx);
        let expected = format!(
            "{}:gpt-fast",
            view.agents[0]["connection_id"].as_str().unwrap()
        );
        assert!(view.store.favorite_models().contains(&expected));
        let prefs: serde_json::Value = serde_json::from_slice(
            &std::fs::read(view.store.file_root().join("preferences.json")).unwrap(),
        )
        .unwrap();
        assert!(
            prefs["favorite_models"]
                .as_array()
                .unwrap()
                .contains(&json!(expected))
        );
        assert!(view.store.unresolved().is_empty());
    });
}

#[gpui_kit::test]
fn find_reveals_a_match_inside_a_long_virtualized_message(cx: &mut TestAppContext) {
    init(cx);
    let mut value = fixture("dm");
    value["messages"][1]["text"] = json!(format!(
        "{}\n\nMiddle needle\n\n{}",
        "A paragraph above the result.\n\n".repeat(60),
        "A paragraph below the result.\n\n".repeat(60)
    ));
    let (handle, view) = cx.update(|cx| {
        gpui_kit::open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(Bounds::new(
                    Default::default(),
                    size(px(1000.), px(700.)),
                ))),
                ..Default::default()
            },
            cx,
            |window, cx| cx.new(|cx| workspace(value, window, cx)),
        )
        .unwrap()
    });
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.render_frame(cx);
        window.click("find-in-conversation", cx);
    })
    .unwrap();
    cx.run_until_parked();
    cx.update_window(handle, |_, window, cx| {
        window.input("Middle needle", cx);
    })
    .unwrap();
    for _ in 0..4 {
        cx.run_until_parked();
        cx.update_window(handle, |_, window, cx| window.render_frame(cx))
            .unwrap();
    }
    cx.update_window(handle, |_, window, cx| {
        assert_eq!(window.find("thread-find-count").label(), Some("1 / 1"));
        assert!(
            view.read(cx)
                .conversation
                .scroller
                .read(cx)
                .logical_scroll_top()
                .offset_in_item
                > px(100.)
        );
    })
    .unwrap();
}
