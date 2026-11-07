use crate::{
    shell::Gallery,
    ui::{controls::*, theme::Palette},
};
use gpui_kit::{component::text::TextView, *};

impl Gallery {
    pub(crate) fn snapshot_view(&self, p: Palette, cx: &mut Context<Self>) -> AnyElement {
        let mut content = div()
            .id("snapshot-content")
            .overflow_y_scroll()
            .size_full()
            .flex()
            .flex_col()
            .gap_4()
            .child(
                row().child(title("Read-only conversation")).child(
                    button("reload-snapshot", "Retry", ButtonKind::Default, p, cx)
                        .on_click(cx.listener(|this, _, _, cx| this.load_snapshot(cx))),
                ),
            );
        match &self.snapshot {
            Err(error) => content = content.child(state("snapshot-error", "Cannot read conversation", error, p)),
            Ok(None) => content = content.child(state("snapshot-detached", "Select a local backend", "Set NGERTIIN_RS_BACKEND_ORIGIN, NGERTIIN_RS_TOKEN_FILE and NGERTIIN_RS_THREAD_ID, then restart or retry. Only an existing thread can be read.", p)),
            Ok(Some(snapshot)) => {
                content = content.child(card(p).child(title(snapshot.thread.name.clone().unwrap_or_else(|| snapshot.agents.iter().map(|a| a.name.as_str()).collect::<Vec<_>>().join(", "))))
                    .child(caption(format!("Contract {} · cursor {} · {} messages", ngertiin_client::CONTRACT_VERSION, snapshot.cursor, snapshot.messages.len()), p)));
                for (i, message) in snapshot.messages.iter().filter(|m| m.state != "deleted").enumerate() {
                    content = content.child(card(p).child(caption(message.author.clone(), p))
                        .child(TextView::markdown(("snapshot-message", i), message.text.clone())));
                }
                if snapshot.has_more { content = content.child(caption("Earlier messages exist. History pagination is added with NMA-068.", p)); }
            },
        }
        content.into_any_element()
    }
}
