//! Bounded, readable decision data, adapted from web ApprovalDetails.
use crate::ui::{
    controls::caption,
    theme::{Palette, ui},
};
use base64::Engine;
use gpui_kit::base::TestSupportExt;
use gpui_kit::*;
use serde_json::Value;

fn file_preview(encoded: &str) -> String {
    if encoded.len() > 65_536 {
        return "File content is too large to preview.".into();
    }
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) else {
        return "File content could not be previewed.".into();
    };
    if bytes
        .iter()
        .any(|byte| (*byte < 32 && ![9, 10, 13].contains(byte)) || *byte == 127)
    {
        return format!("Binary file · {} bytes", bytes.len());
    }
    String::from_utf8(bytes).unwrap_or_else(|_| "File content could not be previewed.".into())
}

fn label(key: &str) -> String {
    match key {
        "path" | "file_path" => "File".into(),
        "base64" | "content" => "Content".into(),
        "url" => "Link".into(),
        "to" | "recipients" => "Recipient".into(),
        _ => {
            let text = key.replace('_', " ");
            let mut chars = text.chars();
            chars
                .next()
                .map(|c| c.to_uppercase().to_string() + chars.as_str())
                .unwrap_or_default()
        }
    }
}

pub(super) fn view(values: &Value, p: Palette) -> AnyElement {
    let mut content = div().flex().flex_col().gap(ui(12.));
    if let Some(values) = values.as_object() {
        for (key, value) in values
            .iter()
            .filter(|(key, _)| key.as_str() != "command_id")
            .take(64)
        {
            let text = if key == "base64" {
                value
                    .as_str()
                    .map(file_preview)
                    .unwrap_or_else(|| "—".into())
            } else if let Some(text) = value.as_str() {
                text.to_owned()
            } else if value.is_null() {
                "—".into()
            } else {
                serde_json::to_string_pretty(value).unwrap_or_default()
            };
            let text = if text.len() > 65_536 {
                "Content is too large to preview.".into()
            } else {
                text
            };
            content = content.child(
                div()
                    .id(SharedString::from(format!("decision-field:{key}")))
                    .role(Role::Group)
                    .aria_label(format!("{}: {text}", label(key)))
                    .test_support()
                    .flex()
                    .flex_col()
                    .gap(ui(4.))
                    .child(caption(label(key), p))
                    .child(div().child(text)),
            );
        }
    }
    div()
        .id("approval-details-body")
        .w_full()
        .min_w_0()
        .max_h(ui(220.))
        .overflow_y_scroll()
        .text_size(ui(13.))
        .line_height(ui(20.))
        .child(content)
        .into_any_element()
}

#[cfg(test)]
mod tests {
    use super::file_preview;
    use base64::Engine;
    #[test]
    fn decision_file_content_is_readable_bounded_and_never_executed() {
        let encode = |bytes: &[u8]| base64::engine::general_purpose::STANDARD.encode(bytes);
        assert_eq!(
            file_preview(&encode("日本語 café".as_bytes())),
            "日本語 café"
        );
        assert_eq!(file_preview(&encode(&[0, 1, 2])), "Binary file · 3 bytes");
        assert_eq!(file_preview("%%%"), "File content could not be previewed.");
        assert_eq!(
            file_preview(&"a".repeat(65_537)),
            "File content is too large to preview."
        );
    }
}
