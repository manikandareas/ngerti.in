//! HTML5 tree sanitization ported from the current html-preview.ts policy.
//! Parse this bounded document on a preparation worker, never in a browser DOM.
use super::content::{PreviewError, text_preview};
use html5ever::{
    Attribute, QualName, local_name, namespace_url, ns, parse_document, serialize,
    tendril::TendrilSink,
};
use markup5ever_rcdom::{Handle, Node, NodeData, RcDom, SerializableHandle};
use std::{cell::RefCell, rc::Rc};
pub const POLICY: &str = "default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-src 'none'";
fn element(tag: html5ever::LocalName, attributes: Vec<Attribute>) -> Handle {
    Node::new(NodeData::Element {
        name: QualName::new(None, ns!(html), tag),
        attrs: RefCell::new(attributes),
        template_contents: RefCell::new(None),
        mathml_annotation_xml_integration_point: false,
    })
}
fn append(parent: &Handle, child: Handle, first: bool) {
    child.parent.set(Some(Rc::downgrade(parent)));
    if first {
        parent.children.borrow_mut().insert(0, child);
    } else {
        parent.children.borrow_mut().push(child);
    }
}
#[derive(Clone)]
pub struct PreparedHtml(String);
impl std::ops::Deref for PreparedHtml {
    type Target = str;
    fn deref(&self) -> &str {
        &self.0
    }
}
impl PreparedHtml {
    pub(crate) fn into_string(self) -> String {
        self.0
    }
}
pub fn prepare(bytes: &[u8], truncated: bool, inset: u32) -> Result<PreparedHtml, PreviewError> {
    let source = text_preview(bytes, truncated)?;
    let mut options = html5ever::ParseOpts::default();
    options.tree_builder.scripting_enabled = false;
    let document = parse_document(RcDom::default(), options).one(source);
    let mut queue = vec![document.document.clone()];
    let mut head = None;
    while let Some(parent) = queue.pop() {
        parent
            .children
            .borrow_mut()
            .retain(|node| match &node.data {
                NodeData::Element { name, attrs, .. } => {
                    let tag = name.local.as_ref();
                    if [
                        "script",
                        "base",
                        "iframe",
                        "object",
                        "embed",
                        "animate",
                        "animatemotion",
                        "animatetransform",
                        "set",
                    ]
                    .contains(&tag)
                    {
                        return false;
                    }
                    if tag == "meta"
                        && attrs
                            .borrow()
                            .iter()
                            .any(|a| a.name.local.as_ref() == "http-equiv")
                    {
                        return false;
                    }
                    attrs.borrow_mut().retain(|a| {
                        let name = a.name.local.as_ref();
                        !name.starts_with("on")
                            && !matches!(name, "target" | "download")
                            && (name != "href" || a.value.starts_with('#'))
                    });
                    true
                }
                _ => true,
            });
        for node in parent.children.borrow().iter() {
            if let NodeData::Element {
                name,
                template_contents,
                ..
            } = &node.data
            {
                if name.local.as_ref() == "head" {
                    head = Some(node.clone());
                }
                if let Some(content) = template_contents.borrow().as_ref() {
                    queue.push(content.clone());
                }
            }
            queue.push(node.clone());
        }
    }
    let head = head.ok_or(PreviewError::Unsupported)?;
    let meta = element(
        local_name!("meta"),
        vec![
            Attribute {
                name: QualName::new(None, ns!(), local_name!("http-equiv")),
                value: "Content-Security-Policy".into(),
            },
            Attribute {
                name: QualName::new(None, ns!(), local_name!("content")),
                value: POLICY.into(),
            },
        ],
    );
    append(&head, meta, true);
    if inset > 0 {
        let style = element(local_name!("style"), vec![]);
        append(&style,Node::new(NodeData::Text{contents:RefCell::new(format!(":root::before{{content:\"\";display:block;height:{}px}}:root{{scroll-padding-top:{}px}}",inset.min(200),inset.min(200)).into())}),false);
        append(&head, style, false);
    }
    let mut output = vec![];
    serialize(
        &mut output,
        &SerializableHandle::from(document.document.clone()),
        Default::default(),
    )
    .map_err(|_| PreviewError::Unsupported)?;
    let html = String::from_utf8(output).map_err(|_| PreviewError::InvalidUtf8)?;
    Ok(PreparedHtml(
        if html.to_ascii_lowercase().starts_with("<!doctype") {
            html
        } else {
            format!("<!doctype html>{html}")
        },
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn scripts_resources_forms_and_navigation_have_no_privileged_path() {
        let raw=br##"<html><head><base href="file:///"><meta http-equiv="refresh" content="0;url=https://example.com"><style>body{color:red} @import url(https://example.com/x);</style></head><body onload="alert(1)"><script>SECRET</script><iframe srcdoc="<script>bad</script>"></iframe><svg><animate attributeName="href"/><a xlink:href="javascript:alert(1)">link</a></svg><a href="https://example.com" target="_blank" download>external</a><a href="#section">internal</a><form action="https://example.com"><input name="x"></form><table><tr><td>Original content</td></tr></table></body></html>"##;
        let html = prepare(raw, false, 60).unwrap();
        assert!(!html.contains("SECRET"));
        assert!(!html.contains("onload"));
        assert!(!html.contains("<iframe"));
        assert!(!html.contains("<base"));
        assert!(!html.contains("javascript:"));
        assert!(!html.contains("target="));
        assert!(!html.contains("http-equiv=\"refresh\""));
        assert!(html.contains("href=\"#section\""));
        assert!(html.contains("form-action 'none'"));
        assert!(html.contains("connect-src 'none'"));
        assert!(html.contains("Original content"));
        assert!(html.contains("height:60px"));
        assert_eq!(raw[0], b'<');
    }
    #[test]
    fn no_truncated_or_oversized_document_is_partially_rendered() {
        assert!(prepare(b"<p>partial", true, 0).is_err());
        assert!(prepare(&vec![b'x'; 128001], false, 0).is_err());
    }
}
