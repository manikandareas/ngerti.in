pub const REPLY: &str = include_str!("../fixtures/reply.md");
pub const WELCOME: &str = "Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation.";
pub const QUESTION: &str =
    "Bantu cek apakah UI Ngertiin bisa kita buat dengan GPUI. Mulai dari percakapan dan composer.";
pub const SAMPLE_CODE: &str = r#"use gpui_kit::*;

struct Conversation;

impl Render for Conversation {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        div()
            .flex()
            .flex_col()
            .gap_3()
            .child("Hello, Ngertiin!")
    }
}

fn main() {
    application().run(|cx| {
        init(cx);
        open_window(WindowOptions::default(), cx, |_, cx| {
            cx.new(|_| Conversation)
        }).expect("Failed to open window");
    });
}
"#;
