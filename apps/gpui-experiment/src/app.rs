use crate::{
    fixtures,
    theme::{self, Palette},
};
use gpui_kit::component::{
    WindowExt,
    input::{
        Editor, EditorState, InlineToken, Input, InputEvent, InputState, Textarea, TextareaState,
    },
    text::{TextView, TextViewStyle},
};
use gpui_kit::prelude::FluentBuilder;
use gpui_kit::*;
use gpui_webview::WebView;
use std::time::Duration;

actions!(
    experiment,
    [
        Quit,
        ShowWorkspace,
        ShowRich,
        ShowCode,
        ShowAvatar,
        ShowHtml,
        ShowComputer,
        ToggleTheme,
        TogglePanel
    ]
);

#[derive(Clone, Copy, PartialEq, Eq)]
enum Scene {
    Conversation,
    Rich,
    Code,
    Avatars,
    Html,
    Computer,
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Panel {
    Detail,
    Library,
    Computer,
}

pub struct Experiment {
    dark: bool,
    scene: Scene,
    panel: Panel,
    panel_open: bool,
    composer: Entity<TextareaState>,
    search: Entity<InputState>,
    editor: Entity<EditorState>,
    html: Entity<WebView>,
    computer: Entity<WebView>,
    messages: Vec<(bool, String)>,
    streaming: bool,
    stream_generation: u64,
    stream_text: String,
    avatar_state: &'static str,
    animate: bool,
    suggestions: bool,
    saved_draft: Option<gpui_kit::component::input::InputContent>,
    scroll: ScrollHandle,
    status: String,
    _subscriptions: Vec<Subscription>,
}

fn icon(name: &str, size: f32, color: Hsla) -> AnyElement {
    svg()
        .path(SharedString::from(format!("icons/{name}.svg")))
        .size(px(size))
        .text_color(color)
        .into_any_element()
}
fn icon_button(id: &'static str, name: &str, p: Palette) -> Stateful<Div> {
    div()
        .id(id)
        .role(Role::Button)
        .aria_label(id)
        .flex()
        .items_center()
        .justify_center()
        .size(px(32.))
        .rounded_full()
        .cursor_pointer()
        .hover(move |style| style.bg(p.secondary))
        .child(icon(name, 18., p.foreground))
}
fn avatar(name: &str, state: &str, size: f32) -> AnyElement {
    img(crate::assets::asset_root().join(format!("avatars/{name}-{state}.png")))
        .size(px(size))
        .into_any_element()
}
fn caption(text: impl Into<SharedString>, p: Palette) -> AnyElement {
    div()
        .text_size(px(12.))
        .line_height(px(18.))
        .text_color(p.muted)
        .child(text.into())
        .into_any_element()
}

impl Experiment {
    fn bind_scene<A: Action>(cx: &mut Context<Self>, scene: Scene) {
        let view = cx.entity().downgrade();
        App::on_action(cx, move |_: &A, cx| {
            let _ = view.update(cx, |view, cx| view.switch(scene, cx));
        });
    }

    pub fn new(origin: &str, window: &mut Window, cx: &mut Context<Self>) -> Self {
        Self::bind_scene::<ShowWorkspace>(cx, Scene::Conversation);
        Self::bind_scene::<ShowRich>(cx, Scene::Rich);
        Self::bind_scene::<ShowCode>(cx, Scene::Code);
        Self::bind_scene::<ShowAvatar>(cx, Scene::Avatars);
        Self::bind_scene::<ShowHtml>(cx, Scene::Html);
        Self::bind_scene::<ShowComputer>(cx, Scene::Computer);
        let view = cx.entity().downgrade();
        App::on_action(cx, move |_: &ToggleTheme, cx| {
            let _ = view.update(cx, |view, cx| {
                view.dark = !view.dark;
                theme::apply_theme(view.dark, None, cx);
                cx.notify();
            });
        });
        let view = cx.entity().downgrade();
        App::on_action(cx, move |_: &TogglePanel, cx| {
            let _ = view.update(cx, |view, cx| {
                view.panel_open = !view.panel_open;
                cx.notify();
            });
        });
        let composer = cx.new(|cx| {
            TextareaState::new(window, cx)
                .placeholder("Pesan untuk Tobi…")
                .auto_grow(1, 7)
        });
        let search = cx.new(|cx| InputState::new(window, cx).placeholder("Search"));
        let editor = cx.new(|cx| {
            EditorState::new(window, cx)
                .language("rust")
                .default_value(fixtures::SAMPLE_CODE)
        });
        let html = cx.new(|cx| {
            WebView::build(
                wry::WebViewBuilder::new().with_url(format!("{origin}/preview.html")),
                window,
                cx,
            )
            .expect("Failed to create HTML WebView")
        });
        let computer_url = std::env::var("NGERTIIN_GPUI_COMPUTER_URL")
            .ok()
            .filter(|value| {
                url::Url::parse(value).is_ok_and(|url| {
                    url.scheme() == "http"
                        && matches!(url.host_str(), Some("127.0.0.1" | "localhost"))
                })
            })
            .unwrap_or_else(|| format!("{origin}/computer.html"));
        let computer = cx.new(|cx| {
            WebView::build(
                wry::WebViewBuilder::new().with_url(computer_url),
                window,
                cx,
            )
            .expect("Failed to create Computer WebView")
        });
        html.update(cx, |view, _| view.hide());
        computer.update(cx, |view, _| view.hide());
        let subscriptions = vec![
            cx.subscribe_in(
                &composer,
                window,
                |this, input, event: &InputEvent, window, cx| match event {
                    InputEvent::Change => {
                        let value = input.read(cx).value();
                        this.suggestions = value.ends_with('@') || value.ends_with('/');
                        cx.notify();
                    }
                    InputEvent::PressEnter {
                        secondary: false,
                        shift: false,
                    } => this.send(window, cx),
                    _ => {}
                },
            ),
            cx.subscribe(&search, |_, _, _: &InputEvent, cx| cx.notify()),
        ];
        Self {
            dark: false,
            scene: Scene::Conversation,
            panel: Panel::Detail,
            panel_open: false,
            composer,
            search,
            editor,
            html,
            computer,
            messages: vec![
                (false, fixtures::WELCOME.into()),
                (true, fixtures::QUESTION.into()),
            ],
            streaming: false,
            stream_generation: 0,
            stream_text: String::new(),
            avatar_state: "idle",
            animate: true,
            suggestions: false,
            saved_draft: None,
            scroll: ScrollHandle::new(),
            status: "Local fixture · no model inference".into(),
            _subscriptions: subscriptions,
        }
    }

    fn switch(&mut self, scene: Scene, cx: &mut Context<Self>) {
        self.html.update(cx, |view, _| view.hide());
        self.computer.update(cx, |view, _| view.hide());
        self.scene = scene;
        if scene == Scene::Html {
            self.html.update(cx, |view, _| view.show());
        }
        if scene == Scene::Computer {
            self.computer.update(cx, |view, _| view.show());
        }
        cx.notify();
    }

    fn insert_token(
        &mut self,
        id: &'static str,
        text: &'static str,
        label: &'static str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.composer.update(cx, |input, cx| {
            if let Err(error) =
                input.replace_with_token(InlineToken::new(id, text).with_label(label), window, cx)
            {
                eprintln!("Token insertion unavailable: {error:?}");
            }
            input.focus(window, cx);
        });
        self.suggestions = false;
        cx.notify();
    }

    fn send(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.streaming {
            self.streaming = false;
            self.stream_generation += 1;
            if !self.stream_text.is_empty() {
                self.messages
                    .push((false, std::mem::take(&mut self.stream_text)));
            }
            self.avatar_state = "idle";
            self.status = "Fixture stream stopped".into();
            cx.notify();
            return;
        }
        let content = self.composer.read(cx).content();
        let text = content.text().to_string();
        if text.trim().is_empty() {
            return;
        }
        self.messages.push((true, text));
        self.composer
            .update(cx, |input, cx| input.set_value("", window, cx));
        self.switch(Scene::Conversation, cx);
        self.streaming = true;
        self.stream_generation += 1;
        let generation = self.stream_generation;
        self.stream_text.clear();
        self.avatar_state = "thinking";
        self.status = format!(
            "Fixture stream · {} inline references submitted",
            content.tokens().len()
        );
        self.scroll.scroll_to_bottom();
        cx.spawn(async move |this, cx| {
            let words: Vec<&str> = fixtures::REPLY.split_inclusive(' ').collect();
            for word in words {
                cx.background_executor()
                    .timer(Duration::from_millis(28))
                    .await;
                let keep_going = this
                    .update(cx, |this, cx| {
                        if this.stream_generation != generation || !this.streaming {
                            return false;
                        }
                        this.stream_text.push_str(word);
                        this.scroll.scroll_to_bottom();
                        cx.notify();
                        true
                    })
                    .unwrap_or(false);
                if !keep_going {
                    return;
                }
            }
            let _ = this.update(cx, |this, cx| {
                this.messages
                    .push((false, std::mem::take(&mut this.stream_text)));
                this.streaming = false;
                this.avatar_state = "idle";
                this.status = "Fixture stream complete · no provider called".into();
                cx.notify();
            });
        })
        .detach();
    }

    fn sidebar(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.dark);
        let query = self.search.read(cx).value().to_lowercase();
        let contacts = [
            ("tobi", "Tobi", "Let's explore the native workspace"),
            ("kira", "Kira", "Design, research, and a little curiosity"),
            ("nara", "Nara", "Belum ada pesan"),
        ];
        div()
            .w(px(280.))
            .h_full()
            .flex_shrink_0()
            .p(px(12.))
            .flex()
            .flex_col()
            .gap(px(8.))
            .child(
                div()
                    .h(px(36.))
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(
                        Input::new(&self.search)
                            .appearance(false)
                            .bordered(false)
                            .h(px(32.))
                            .prefix(icon("search", 15., p.muted)),
                    )
                    .child(
                        icon_button("create-contact", "plus", p).on_click(cx.listener(
                            |this, _, window, cx| {
                                this.suggestions = !this.suggestions;
                                this.composer
                                    .update(cx, |input, cx| input.focus(window, cx));
                                cx.notify();
                            },
                        )),
                    ),
            )
            .child(
                div().flex_1().children(
                    contacts
                        .into_iter()
                        .filter(|(_, name, _)| name.to_lowercase().contains(&query))
                        .enumerate()
                        .map(|(index, (key, name, description))| {
                            div()
                                .id(("contact", index))
                                .role(Role::Button)
                                .aria_label(name)
                                .w_full()
                                .min_h(px(60.))
                                .my(px(2.))
                                .px(px(8.))
                                .py(px(8.))
                                .rounded(px(10.))
                                .flex()
                                .items_center()
                                .gap(px(12.))
                                .cursor_pointer()
                                .when(index == 0, |item| item.bg(p.secondary))
                                .hover(move |style| style.bg(p.secondary))
                                .child(avatar(key, "idle", 44.))
                                .child(
                                    div()
                                        .flex_1()
                                        .min_w_0()
                                        .child(
                                            div()
                                                .text_size(px(14.))
                                                .font_weight(FontWeight::MEDIUM)
                                                .child(name),
                                        )
                                        .child(
                                            div()
                                                .mt(px(2.))
                                                .text_size(px(13.))
                                                .text_color(p.muted)
                                                .truncate()
                                                .child(description),
                                        ),
                                )
                                .on_click(cx.listener(|this, _, _, cx| {
                                    this.switch(Scene::Conversation, cx)
                                }))
                        }),
                ),
            )
            .child(caption("GPUI experiment", p))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.))
                    .child(
                        icon_button("theme", "sun", p)
                            .bg(p.composer)
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.dark = !this.dark;
                                theme::apply_theme(this.dark, Some(window), cx);
                                cx.notify();
                            })),
                    )
                    .child(
                        div()
                            .id("experiments")
                            .role(Role::Button)
                            .aria_label("Experiments")
                            .h(px(34.))
                            .flex_1()
                            .rounded_full()
                            .bg(p.composer)
                            .flex()
                            .items_center()
                            .justify_center()
                            .gap(px(7.))
                            .cursor_pointer()
                            .child(icon("settings", 15., p.foreground))
                            .child("Experiments")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.panel_open = true;
                                this.panel = Panel::Library;
                                cx.notify();
                            })),
                    ),
            )
            .into_any_element()
    }

    fn header(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.dark);
        let title = match self.scene {
            Scene::Code => "workspace.rs",
            Scene::Html => "report.html",
            Scene::Avatars => "Avatar",
            Scene::Computer => "Computer",
            _ => "Tobi",
        };
        div()
            .h(px(60.))
            .px(px(20.))
            .flex()
            .items_center()
            .justify_between()
            .flex_shrink_0()
            .child(
                div()
                    .w(px(32.))
                    .when(self.scene != Scene::Conversation, |item| {
                        item.child(icon_button("back", "left", p).on_click(
                            cx.listener(|this, _, _, cx| this.switch(Scene::Conversation, cx)),
                        ))
                    }),
            )
            .child(
                div()
                    .id("identity")
                    .role(Role::Button)
                    .aria_label("Toggle details")
                    .h(px(39.))
                    .pl(px(7.))
                    .pr(px(14.))
                    .rounded_full()
                    .bg(p.card)
                    .flex()
                    .items_center()
                    .gap(px(7.))
                    .cursor_pointer()
                    .child(avatar("tobi", self.avatar_state, 25.))
                    .child(title)
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.panel_open = !this.panel_open;
                        cx.notify();
                    })),
            )
            .child(
                div().flex().gap(px(8.)).child(
                    icon_button("open-computer", "computer", p)
                        .bg(p.card)
                        .on_click(cx.listener(|this, _, _, cx| this.switch(Scene::Computer, cx))),
                ),
            )
            .into_any_element()
    }

    fn message(&self, id: usize, user: bool, text: String) -> AnyElement {
        let p = Palette::new(self.dark);
        div()
            .w_full()
            .flex()
            .when(user, |item| item.justify_end())
            .child(
                div()
                    .max_w(px(560.))
                    .min_w_0()
                    .px(px(12.))
                    .py(px(7.))
                    .rounded(px(18.))
                    .bg(if user { p.user } else { p.card })
                    .text_color(if user {
                        rgb(0xffffff).into()
                    } else {
                        p.foreground
                    })
                    .child(
                        TextView::markdown(("message", id), SharedString::from(text))
                            .when(!user, |view| {
                                view.style(
                                    TextViewStyle::default()
                                        .paragraph_gap(rems(0.625))
                                        .table_head(
                                            StyleRefinement::default()
                                                .bg(p.panel)
                                                .text_color(p.muted),
                                        ),
                                )
                            })
                            .selectable(true)
                            .text_size(px(15.))
                            .line_height(px(22.)),
                    )
                    .child(
                        div()
                            .mt(px(2.))
                            .w_full()
                            .flex()
                            .justify_end()
                            .text_size(px(11.))
                            .text_color(if user { rgb(0xe7e7e7).into() } else { p.muted })
                            .child("10.25"),
                    ),
            )
            .into_any_element()
    }

    fn conversation(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.dark);
        let mut messages = self.messages.clone();
        if self.scene == Scene::Rich {
            messages = vec![(false, fixtures::REPLY.into())];
        }
        div()
            .id("conversation-scroll")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .track_scroll(&self.scroll)
            .px(px(40.))
            .pt(px(46.))
            .pb(px(28.))
            .child(
                div()
                    .w_full()
                    .max_w(px(1000.))
                    .mx_auto()
                    .flex()
                    .flex_col()
                    .gap(px(24.))
                    .children(
                        messages
                            .into_iter()
                            .enumerate()
                            .map(|(id, (user, text))| self.message(id, user, text)),
                    )
                    .when(self.streaming, |item| {
                        item.child(self.message(1000, false, self.stream_text.clone()))
                    })
                    .when(
                        !self.streaming && self.scene == Scene::Conversation,
                        |item| {
                            item.child(
                                div().flex().gap(px(6.)).flex_wrap().children(
                                    [
                                        ("Rich answer", Scene::Rich),
                                        ("Avatar", Scene::Avatars),
                                        ("HTML preview", Scene::Html),
                                    ]
                                    .into_iter()
                                    .enumerate()
                                    .map(
                                        |(id, (label, scene))| {
                                            div()
                                                .id(("quick", id))
                                                .role(Role::Button)
                                                .aria_label(label)
                                                .px(px(10.))
                                                .py(px(5.))
                                                .rounded_full()
                                                .border_1()
                                                .border_color(p.border)
                                                .text_size(px(12.))
                                                .text_color(p.muted)
                                                .cursor_pointer()
                                                .child(label)
                                                .on_click(cx.listener(move |this, _, _, cx| {
                                                    this.switch(scene, cx)
                                                }))
                                        },
                                    ),
                                ),
                            )
                        },
                    ),
            )
            .into_any_element()
    }

    fn composer(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.dark);
        div()
            .w_full()
            .px(px(20.))
            .pt(px(12.))
            .pb(px(16.))
            .flex_shrink_0()
            .child(
                div()
                    .w_full()
                    .max_w(px(1000.))
                    .mx_auto()
                    .flex()
                    .flex_col()
                    .gap(px(8.))
                    .when(self.suggestions, |item| {
                        item.child(
                            div()
                                .rounded(px(12.))
                                .bg(p.composer)
                                .border_1()
                                .border_color(p.border)
                                .p(px(6.))
                                .children(
                                    [
                                        ("Tobi", "@tobi", "Tobi"),
                                        ("Attachment", "[file:report]", "report.html"),
                                        ("Skill", "/research", "/research"),
                                    ]
                                    .into_iter()
                                    .enumerate()
                                    .map(
                                        |(id, (label, text, display))| {
                                            div()
                                                .id(("suggestion", id))
                                                .role(Role::Button)
                                                .aria_label(display)
                                                .p(px(8.))
                                                .rounded(px(6.))
                                                .cursor_pointer()
                                                .hover(move |style| style.bg(p.secondary))
                                                .child(display)
                                                .on_click(cx.listener(
                                                    move |this, _, window, cx| {
                                                        this.insert_token(
                                                            label, text, display, window, cx,
                                                        )
                                                    },
                                                ))
                                        },
                                    ),
                                ),
                        )
                    })
                    .child(
                        div()
                            .rounded(px(22.))
                            .border_1()
                            .border_color(p.border)
                            .bg(p.composer)
                            .p(px(8.))
                            .flex()
                            .items_end()
                            .gap(px(6.))
                            .child(icon_button("attach", "plus", p).bg(p.card).on_click(
                                cx.listener(|this, _, _, cx| {
                                    this.suggestions = !this.suggestions;
                                    cx.notify();
                                }),
                            ))
                            .child(
                                div().flex_1().min_w_0().child(
                                    Textarea::new(&self.composer)
                                        .appearance(false)
                                        .bordered(false)
                                        .text_size(px(14.))
                                        .line_height(px(20.))
                                        .aria_label("Message Tobi")
                                        .on_token_click(|event, _, _| {
                                            eprintln!(
                                                "Opened fixture reference: {}",
                                                event.token().id()
                                            );
                                        }),
                                ),
                            )
                            .child(
                                div()
                                    .id("send")
                                    .role(Role::Button)
                                    .aria_label(if self.streaming {
                                        "Stop fixture stream"
                                    } else {
                                        "Send fixture message"
                                    })
                                    .size(px(28.))
                                    .rounded_full()
                                    .bg(p.user)
                                    .cursor_pointer()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .child(icon(
                                        if self.streaming { "stop" } else { "up" },
                                        16.,
                                        rgb(0xffffff).into(),
                                    ))
                                    .on_click(
                                        cx.listener(|this, _, window, cx| this.send(window, cx)),
                                    ),
                            ),
                    )
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .items_center()
                            .child(caption(self.status.clone(), p))
                            .child(
                                div().flex().gap(px(12.)).children(
                                    [("Save draft", false), ("Restore", true)]
                                        .into_iter()
                                        .enumerate()
                                        .map(|(id, (label, restore))| {
                                            div()
                                                .id(("draft", id))
                                                .role(Role::Button)
                                                .aria_label(label)
                                                .text_size(px(11.))
                                                .text_color(p.muted)
                                                .cursor_pointer()
                                                .child(label)
                                                .on_click(cx.listener(
                                                    move |this, _, window, cx| {
                                                        if restore {
                                                            if let Some(content) =
                                                                this.saved_draft.clone()
                                                            {
                                                                this.composer.update(
                                                                    cx,
                                                                    |input, cx| {
                                                                        input.set_value(
                                                                            content, window, cx,
                                                                        )
                                                                    },
                                                                );
                                                                this.status =
                                                                    "Draft restored in memory"
                                                                        .into();
                                                            }
                                                        } else {
                                                            this.saved_draft = Some(
                                                                this.composer.read(cx).content(),
                                                            );
                                                            this.status =
                                                                "Draft saved in memory".into();
                                                        }
                                                        cx.notify();
                                                    },
                                                ))
                                        }),
                                ),
                            ),
                    ),
            )
            .into_any_element()
    }

    fn avatars(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.dark);
        let portraits = div()
            .flex()
            .items_center()
            .justify_center()
            .gap(px(28.))
            .children(
                ["tobi", "kira", "nara"]
                    .into_iter()
                    .enumerate()
                    .map(|(index, name)| {
                        let portrait = div().id(("portrait", index)).child(avatar(
                            name,
                            self.avatar_state,
                            160.,
                        ));
                        if self.animate && self.avatar_state != "idle" {
                            portrait
                                .with_animation(
                                    "breathing",
                                    Animation::new(Duration::from_millis(1800)).repeat(),
                                    |item, delta| {
                                        item.top(px((delta * std::f32::consts::TAU).sin() * 3.))
                                    },
                                )
                                .into_any_element()
                        } else {
                            portrait.into_any_element()
                        }
                    }),
            );
        div()
            .flex_1()
            .flex()
            .flex_col()
            .items_center()
            .justify_center()
            .gap(px(28.))
            .p(px(24.))
            .child(portraits)
            .child(
                div().flex().gap(px(8.)).children(
                    ["idle", "thinking", "working", "listening"]
                        .into_iter()
                        .enumerate()
                        .map(|(index, state)| {
                            div()
                                .id(("avatar-state", index))
                                .role(Role::Button)
                                .aria_label(state)
                                .px(px(12.))
                                .py(px(7.))
                                .rounded_full()
                                .bg(if self.avatar_state == state {
                                    p.secondary
                                } else {
                                    p.card
                                })
                                .cursor_pointer()
                                .child(state)
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.avatar_state = state;
                                    cx.notify();
                                }))
                        }),
                ),
            )
            .child(
                div()
                    .id("motion")
                    .role(Role::Button)
                    .aria_label("Toggle animation")
                    .cursor_pointer()
                    .text_color(p.link)
                    .child(if self.animate {
                        "Pause native animation"
                    } else {
                        "Resume native animation"
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.animate = !this.animate;
                        cx.notify();
                    })),
            )
            .child(caption(
                "Client-generated cached portraits · native GPUI animation",
                p,
            ))
            .into_any_element()
    }

    fn browser(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.dark);
        let browser = if self.scene == Scene::Html {
            self.html.clone()
        } else {
            self.computer.clone()
        };
        div().flex_1().min_h_0().flex().flex_col()
            .child(div().px(px(20.)).pb(px(10.)).flex().items_center().justify_between()
                .child(caption(if self.scene==Scene::Html {"Same local HTML fixture · WKWebView"}else{"Cua viewer · separate browser surface"},p))
                .child(div().id("overlay-test").role(Role::Button).aria_label("Test overlay").text_size(px(12.)).text_color(p.link).cursor_pointer().child("Test overlay")
                    .on_click(cx.listener(|_,_,window,cx| { window.open_dialog(cx,|dialog,_,_| dialog.title("Native overlay").child("This GPUI dialog must appear above the embedded browser and receive input.")); }))))
            .child(div().flex_1().min_h_0().overflow_hidden().child(browser))
            .into_any_element()
    }

    fn panel(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.dark);
        let mut content = div()
            .flex_1()
            .min_h_0()
            .p(px(20.))
            .flex()
            .flex_col()
            .gap(px(18.));
        if self.panel == Panel::Detail {
            content = content
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .items_center()
                        .gap(px(8.))
                        .py(px(12.))
                        .child(avatar("tobi", self.avatar_state, 90.))
                        .child(
                            div()
                                .font_weight(FontWeight::SEMIBOLD)
                                .text_size(px(18.))
                                .child("Tobi"),
                        )
                        .child(caption("Your persistent workspace agent", p)),
                )
                .child(div().h(px(1.)).bg(p.border))
                .child(div().child("About").child(caption(
                    "A small native experiment using the existing Ngertiin design language.",
                    p,
                )))
                .child(
                    div()
                        .child("Goals")
                        .child(caption("Explore visual fidelity with GPUI", p)),
                )
                .child(
                    div()
                        .child("Routine")
                        .child(caption("No scheduled work in this experiment", p)),
                );
        } else if self.panel == Panel::Library {
            content = content
                .child(caption("Experiments and sample files", p))
                .children(
                    [
                        ("Conversation", Scene::Conversation, "file"),
                        ("Rich answer", Scene::Rich, "file"),
                        ("workspace.rs", Scene::Code, "code"),
                        ("report.html", Scene::Html, "file"),
                        ("Avatar", Scene::Avatars, "user"),
                        ("Computer", Scene::Computer, "computer"),
                    ]
                    .into_iter()
                    .enumerate()
                    .map(|(index, (name, scene, glyph))| {
                        div()
                            .id(("library", index))
                            .role(Role::Button)
                            .aria_label(name)
                            .flex()
                            .items_center()
                            .gap(px(10.))
                            .p(px(10.))
                            .rounded(px(10.))
                            .cursor_pointer()
                            .hover(move |style| style.bg(p.card))
                            .child(icon(glyph, 18., p.muted))
                            .child(div().flex_1().child(name))
                            .child(icon("right", 14., p.muted))
                            .on_click(cx.listener(move |this, _, _, cx| this.switch(scene, cx)))
                    }),
                );
        } else {
            content = content
                .child(caption("Shared desktop viewer", p))
                .child("Open the viewer to test browser composition, keyboard focus and resizing.")
                .child(
                    div()
                        .id("computer-scene")
                        .px(px(12.))
                        .py(px(8.))
                        .bg(p.card)
                        .rounded(px(8.))
                        .cursor_pointer()
                        .child("Open Computer")
                        .on_click(cx.listener(|this, _, _, cx| this.switch(Scene::Computer, cx))),
                );
        }
        div()
            .w(px(300.))
            .h_full()
            .flex_shrink_0()
            .border_l_1()
            .border_color(p.border)
            .bg(p.background)
            .rounded_r(px(16.))
            .flex()
            .flex_col()
            .child(
                div()
                    .h(px(60.))
                    .px(px(12.))
                    .flex()
                    .items_center()
                    .justify_between()
                    .child(
                        div().flex().gap(px(3.)).children(
                            [
                                ("Detail", Panel::Detail),
                                ("Library", Panel::Library),
                                ("Computer", Panel::Computer),
                            ]
                            .into_iter()
                            .enumerate()
                            .map(|(id, (label, panel))| {
                                div()
                                    .id(("panel-tab", id))
                                    .role(Role::Button)
                                    .aria_label(label)
                                    .px(px(10.))
                                    .py(px(7.))
                                    .rounded(px(7.))
                                    .bg(if self.panel == panel {
                                        p.secondary
                                    } else {
                                        p.background
                                    })
                                    .text_size(px(13.))
                                    .cursor_pointer()
                                    .child(label)
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        this.panel = panel;
                                        cx.notify();
                                    }))
                            }),
                        ),
                    )
                    .child(icon_button("close-panel", "close", p).on_click(cx.listener(
                        |this, _, _, cx| {
                            this.panel_open = false;
                            cx.notify();
                        },
                    ))),
            )
            .child(content)
            .into_any_element()
    }
}

impl Render for Experiment {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let p = Palette::new(self.dark);
        let center = match self.scene {
            Scene::Conversation | Scene::Rich => self.conversation(cx),
            Scene::Avatars => self.avatars(cx),
            Scene::Code => div()
                .flex_1()
                .min_h_0()
                .p(px(16.))
                .child(Editor::new(&self.editor).readonly(true).size_full())
                .into_any_element(),
            Scene::Html | Scene::Computer => self.browser(cx),
        };
        let header = self.header(cx);
        let composer = self.composer(cx);
        let sidebar = self.sidebar(cx);
        div()
            .size_full()
            .font_family("Geist")
            .text_size(px(14.))
            .line_height(px(20.))
            .text_color(p.foreground)
            .bg(p.frame)
            .pr(px(8.))
            .py(px(8.))
            .flex()
            .child(sidebar)
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h_full()
                    .rounded_l(px(16.))
                    .when(!self.panel_open, |item| item.rounded_r(px(16.)))
                    .bg(p.background)
                    .overflow_hidden()
                    .flex()
                    .flex_col()
                    .child(header)
                    .child(center)
                    .child(composer),
            )
            .when(self.panel_open, |item| item.child(self.panel(cx)))
    }
}
