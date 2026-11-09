//! Native inline references share selection with the surrounding Markdown.
use super::*;
use crate::ui::{
    controls::{ButtonKind, button},
    theme::{Palette, ui, ui_px},
    workspace::glyph,
};
use crate::{
    models::content::TableDocument,
    ui::table::{InlineTable, RichTable},
};
use gpui_kit::component::{
    ActiveTheme,
    text::{
        InlineElement, InlineRenderContext, MarkdownExtensions, MarkdownNode, MarkdownParseContext,
        MarkdownPlugin, markdown_ast,
    },
};
use gpui_kit::prelude::FluentBuilder;
use ngertiin_client::{rows, text};
use std::{
    collections::{BTreeMap, hash_map::DefaultHasher},
    hash::{Hash, Hasher},
    sync::Arc,
};

#[derive(Clone)]
enum Target {
    File(String),
    Agent(String),
    Goal(String),
    User,
    Skill,
    Source(String),
    Missing,
}
#[derive(Clone)]
struct Reference {
    label: String,
    target: Target,
}
struct References {
    owner: WeakEntity<Workspace>,
    sources: Vec<String>,
}

pub(super) fn extensions(
    owner: WeakEntity<Workspace>,
    sources: Vec<String>,
    tables: BTreeMap<usize, Entity<RichTable>>,
) -> Box<MarkdownExtensions> {
    let revision = parser_configuration_revision(&sources, tables.keys().copied());
    Box::new(
        MarkdownExtensions::default()
            .parser_revision(revision)
            .plugin(References { owner, sources })
            .plugin(Tables(tables)),
    )
}

// Streaming can introduce a table or change source-link classification after
// the plugin names are already installed. GPUI needs an explicit configuration
// revision to reparse those nodes with the new lookup; ordinary appended rows
// keep the same revision and retain incremental parsing and table state.
fn parser_configuration_revision(sources: &[String], offsets: impl Iterator<Item = usize>) -> u64 {
    let mut revision = DefaultHasher::new();
    sources.hash(&mut revision);
    offsets.collect::<Vec<_>>().hash(&mut revision);
    revision.finish()
}

struct Tables(BTreeMap<usize, Entity<RichTable>>);
impl MarkdownPlugin for Tables {
    fn name(&self) -> &str {
        "ngertiin-table"
    }
    fn is_block(&self) -> bool {
        true
    }
    fn parse(
        &self,
        node: &markdown_ast::Node,
        context: &MarkdownParseContext<'_>,
    ) -> Option<MarkdownNode> {
        if !matches!(node, markdown_ast::Node::Table(_)) {
            return None;
        }
        let offset = context.offset() + node.position()?.start.offset;
        self.0.contains_key(&offset).then(|| {
            let text = node
                .children()
                .into_iter()
                .flatten()
                .map(|row| {
                    row.children()
                        .into_iter()
                        .flatten()
                        .map(plain)
                        .collect::<Vec<_>>()
                        .join("\t")
                })
                .collect::<Vec<_>>()
                .join("\n");
            MarkdownNode::new(self.name(), offset)
                .text(text)
                .markdown(context.node_source(node).unwrap_or_default().to_owned())
        })
    }
    fn render(&self, node: &MarkdownNode, _: &mut Window, _: &mut App) -> impl IntoElement {
        div().w_full().children(
            node.data::<usize>()
                .and_then(|offset| self.0.get(offset))
                .cloned(),
        )
    }
}

pub(super) fn prepare_tables(
    mut previous: BTreeMap<usize, Entity<RichTable>>,
    source: &str,
    sources: &[String],
    window: &mut Window,
    cx: &mut Context<Workspace>,
) -> BTreeMap<usize, Entity<RichTable>> {
    let mut result = BTreeMap::new();
    let Ok(root) = markdown::to_mdast(source, &markdown::ParseOptions::gfm()) else {
        return result;
    };
    fn collect<'a>(node: &'a markdown_ast::Node, tables: &mut Vec<&'a markdown_ast::Node>) {
        if matches!(node, markdown_ast::Node::Table(_)) {
            tables.push(node);
        } else if let Some(children) = node.children() {
            for child in children {
                collect(child, tables);
            }
        }
    }
    let mut nodes = Vec::new();
    collect(&root, &mut nodes);
    for node in nodes {
        let Some(position) = node.position() else {
            continue;
        };
        let Some(table) = table_from_node(node, source) else {
            continue;
        };
        let cells = node
            .children()
            .map(Vec::as_slice)
            .unwrap_or_default()
            .iter()
            .map(|row| {
                row.children()
                    .map(Vec::as_slice)
                    .unwrap_or_default()
                    .iter()
                    .map(|cell| cell_markup(cell, source))
                    .collect::<Vec<_>>()
            })
            .collect::<Vec<_>>();
        let document = Arc::new(TableDocument {
            original: table.markdown,
            headers: table.headers,
            rows: table.rows,
        });
        let owner = cx.entity().downgrade();
        let actions_owner = owner.clone();
        let references = MarkdownExtensions::default()
            .parser_revision(parser_configuration_revision(sources, std::iter::empty()))
            .plugin(References {
                owner: owner.clone(),
                sources: sources.to_vec(),
            });
        let alignments = match node {
            markdown_ast::Node::Table(table) => table
                .align
                .iter()
                .map(|align| match align {
                    markdown_ast::AlignKind::Right => TextAlign::Right,
                    markdown_ast::AlignKind::Center => TextAlign::Center,
                    _ => TextAlign::Left,
                })
                .collect(),
            _ => Vec::new(),
        };
        let options = InlineTable::new(
            cells,
            alignments,
            references,
            move |data, cx| Workspace::table_actions(&data, actions_owner.clone(), None, cx),
            move |cx| {
                let owner = owner.clone();
                cx.defer(move |cx| {
                    let _ = owner.update(cx, |this, cx| {
                        this.scroller
                            .update(cx, |scroller, cx| scroller.remeasure(cx));
                        cx.notify();
                    });
                });
            },
        );
        let table = if let Some(table) = previous.remove(&position.start.offset) {
            table.update(cx, |table, cx| table.update_inline(document, options, cx));
            table
        } else {
            cx.new(|cx| RichTable::new(document, window, cx).inline(options))
        };
        result.insert(position.start.offset, table);
    }
    result
}

pub(super) fn code_actions(
    owner: WeakEntity<Workspace>,
    row_id: String,
    p: Palette,
) -> impl Fn(&gpui_kit::base::text::CodeBlock, &mut Window, &mut App) -> AnyElement {
    move |code, _, cx| {
        let group = SharedString::from(format!("message-actions:{row_id}"));
        let source = code.code();
        let copy = crate::ui::workspace::action(
            SharedString::from(format!(
                "copy-code:{}:{}",
                row_id,
                code.span.map_or(0, |span| span.start)
            )),
            "Copy code",
            "Copy01Icon",
            p,
            cx,
        )
        .size(ui(24.))
        .rounded_full()
        .bg(p.color("popover"))
        .opacity(0.)
        .group_hover(group.clone(), |style| style.opacity(1.))
        .focus_visible(|style| style.opacity(1.))
        .on_click(move |_, _, cx| {
            cx.write_to_clipboard(ClipboardItem::new_string(source.to_string()))
        });
        let owner = owner.clone();
        let row_id = row_id.clone();
        let wrap = crate::ui::workspace::action(
            SharedString::from(format!("wrap-code:{row_id}")),
            "Wrap code",
            "TextWrapIcon",
            p,
            cx,
        )
        .size(ui(24.))
        .rounded_full()
        .bg(p.color("popover"))
        .opacity(0.)
        .group_hover(group, |style| style.opacity(1.))
        .focus_visible(|style| style.opacity(1.))
        .on_click(move |_, _, cx| {
            let _ = owner.update(cx, |this, cx| {
                if !this.wrapped_code.remove(&row_id) {
                    this.wrapped_code.insert(row_id.clone());
                }
                cx.notify();
            });
        });
        // The framework positions this hook at the top right. Keep its empty
        // host at zero size so hidden controls do not cover the first code line.
        div()
            .relative()
            .size(ui(0.))
            .child(
                div()
                    .absolute()
                    .top_0()
                    .right_0()
                    .flex()
                    .gap(ui(2.))
                    .child(copy)
                    .child(wrap),
            )
            .into_any_element()
    }
}

/// Cell positions include the GFM separators; inline child ranges contain only
/// authored cell content, including its emphasis, code and link syntax.
fn cell_markup(cell: &markdown_ast::Node, source: &str) -> String {
    let Some((start, end)) = cell.children().and_then(|children| {
        Some((
            children.first()?.position()?.start.offset,
            children.last()?.position()?.end.offset,
        ))
    }) else {
        return plain(cell);
    };
    let Some(content) = source.get(start..end) else {
        return plain(cell);
    };
    fn code_ranges(node: &markdown_ast::Node, ranges: &mut Vec<std::ops::Range<usize>>) {
        if let markdown_ast::Node::InlineCode(code) = node {
            if let Some(position) = &code.position {
                ranges.push(position.start.offset..position.end.offset);
            }
        } else if let Some(children) = node.children() {
            for child in children {
                code_ranges(child, ranges);
            }
        }
    }
    let mut ranges = Vec::new();
    code_ranges(cell, &mut ranges);
    let mut content = content.to_owned();
    // GFM removes pipe escapes inside table code spans. A standalone inline
    // renderer does not, so remove only those table-specific escapes first.
    for range in ranges.into_iter().rev() {
        let range = range.start - start..range.end - start;
        let code = content[range.clone()].replace("\\|", "|");
        content.replace_range(range, &code);
    }
    content
}

fn plain(node: &markdown_ast::Node) -> String {
    match node {
        markdown_ast::Node::Text(text) => text.value.clone(),
        markdown_ast::Node::InlineCode(code) => code.value.clone(),
        _ => node
            .children()
            .map(|children| children.iter().map(plain).collect())
            .unwrap_or_default(),
    }
}

#[cfg(test)]
fn table_data(source: &str) -> Option<gpui_kit::base::text::TableData> {
    let document = markdown::to_mdast(source, &markdown::ParseOptions::gfm()).ok()?;
    let node = document
        .children()?
        .iter()
        .find(|node| matches!(node, markdown_ast::Node::Table(_)))?;
    table_from_node(node, source)
}
fn table_from_node(
    node: &markdown_ast::Node,
    source: &str,
) -> Option<gpui_kit::base::text::TableData> {
    let markdown_ast::Node::Table(table) = node else {
        return None;
    };
    let mut rows = table.children.iter().filter_map(|row| {
        row.children()
            .map(|cells| cells.iter().map(plain).collect::<Vec<_>>())
    });
    Some(gpui_kit::base::text::TableData {
        headers: rows.next()?,
        rows: rows.collect(),
        markdown: node
            .position()
            .and_then(|position| source.get(position.start.offset..position.end.offset))
            .unwrap_or(source)
            .to_owned(),
        span: None,
    })
}
impl MarkdownPlugin for References {
    fn name(&self) -> &str {
        "ngertiin-reference"
    }
    fn parse(
        &self,
        node: &markdown_ast::Node,
        context: &MarkdownParseContext<'_>,
    ) -> Option<MarkdownNode> {
        if let markdown_ast::Node::Image(image) = node {
            return Some(
                MarkdownNode::new(
                    self.name(),
                    Reference {
                        label: image.alt.clone(),
                        target: Target::Missing,
                    },
                )
                .text(image.alt.clone()),
            );
        }
        let markdown_ast::Node::Link(link) = node else {
            return None;
        };
        let label = plain(node);
        let target = if let Some(id) = link.url.strip_prefix("ngertiin://file/") {
            Target::File(id.into())
        } else if let Some(id) = link.url.strip_prefix("ngertiin://agent/") {
            Target::Agent(id.into())
        } else if let Some(id) = link.url.strip_prefix("ngertiin://goal/") {
            Target::Goal(id.into())
        } else if link.url.starts_with("ngertiin://user/") {
            Target::User
        } else if link.url.starts_with("ngertiin://skill/") {
            Target::Skill
        } else if self.sources.contains(&link.url) {
            Target::Source(link.url.clone())
        } else {
            return None;
        };
        Some(
            MarkdownNode::new(
                self.name(),
                Reference {
                    label: label.clone(),
                    target,
                },
            )
            .text(label)
            .markdown(context.node_source(node).unwrap_or_default().to_owned()),
        )
    }
    fn render_inline(
        &self,
        node: &MarkdownNode,
        context: &InlineRenderContext,
        _: &mut Window,
        cx: &mut App,
    ) -> Option<InlineElement> {
        let reference = node.data::<Reference>()?.clone();
        let p = Palette::new(cx.theme().mode.is_dark());
        let label = match &reference.target {
            Target::File(id) => self
                .owner
                .read_with(cx, |this, _| {
                    rows(this.value(), "artifacts")
                        .iter()
                        .find(|file| file["id"] == *id)
                        .map(|file| text(file, "name").to_owned())
                })
                .ok()
                .flatten(),
            Target::Source(url) => url::Url::parse(url)
                .ok()
                .and_then(|url| url.host_str().map(str::to_owned)),
            Target::Missing => None,
            _ => Some(reference.label.clone()),
        };
        let Some(label) = label else {
            return Some(InlineElement::new(
                div().text_color(p.color("muted-foreground")).child(
                    if matches!(reference.target, Target::Missing) {
                        reference.label
                    } else {
                        "File tidak tersedia".into()
                    },
                ),
            ));
        };
        let source = matches!(reference.target, Target::Source(_));
        let file = matches!(reference.target, Target::File(_));
        let mut chip = button(
            SharedString::from(format!(
                "reference:{}:{}",
                node.source_range().map_or(0, |range| range.start),
                label
            )),
            "",
            ButtonKind::Ghost,
            p,
            cx,
        )
        .accessibility_label(format!("Open {label}"))
        .h(ui(21.))
        .max_w(ui(240.))
        .px(ui(5.))
        .py_0()
        .rounded(ui_px(5., cx))
        .bg(p.color("secondary"))
        .text_color(p.color("muted-foreground"))
        .when(file, |chip| {
            chip.h(ui(26.))
                .px(ui(9.))
                .rounded_full()
                .bg(p.color("popover"))
                .border_1()
                .border_color(p.color("border"))
        })
        .when(source, |chip| {
            chip.border_1().border_color(p.color("border"))
        });
        let mut contents = div()
            .flex()
            .items_center()
            .gap(ui(4.))
            .min_w_0()
            .text_size(ui(13.))
            .line_height(ui(19.));
        if file {
            contents = contents.child(context::file_icon(&label, false, false, p.dark));
        } else {
            contents = contents.child(glyph(
                if source { "Globe02Icon" } else { "UserIcon" },
                12.,
                p,
            ));
        }
        contents = contents.child(
            div()
                .min_w_0()
                .truncate()
                .when(source, |view| view.font_family("Geist Mono"))
                .child(label),
        );
        if file {
            contents = contents.child(glyph("ArrowUpRight01Icon", 12., p));
        }
        let owner = self.owner.clone();
        chip = chip.child(contents).on_click(move |_, window, cx| {
            let _ = owner.update(cx, |this, cx| match &reference.target {
                Target::File(id) => {
                    let artifact = rows(this.value(), "artifacts")
                        .iter()
                        .find(|file| file["id"] == *id)
                        .cloned();
                    if let Some(artifact) = artifact {
                        this.open_artifact(artifact, window, cx);
                    }
                }
                Target::Goal(id) => this.show_goal(id.clone(), window, cx),
                Target::Agent(id) => this.show_member(id.clone(), window, cx),
                Target::User => this.show_profile(window, cx),
                Target::Skill => this.show_skills(window, cx),
                Target::Source(url) if crate::host::is_external_url(url) => cx.open_url(url),
                _ => {}
            });
        });
        Some(InlineElement::new(chip).with_baseline(context.line_height() * 0.78))
    }
}

impl Workspace {
    pub(super) fn message_link(
        &mut self,
        target: &str,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if crate::host::is_external_url(target) {
            cx.open_url(target);
            return;
        }
        let id = target.rsplit('/').next().unwrap_or_default();
        if let Some(artifact) = rows(self.value(), "artifacts")
            .iter()
            .find(|file| file["id"] == id)
            .cloned()
        {
            self.open_artifact(artifact, window, cx);
        } else if rows(self.value(), "goals")
            .iter()
            .any(|goal| goal["id"] == id)
        {
            self.show_goal(id.into(), window, cx);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{cell_markup, table_data};

    #[test]
    fn table_actions_use_parsed_cells_including_formatting_and_escaped_pipes() {
        let source = "| **Name** | Value |\n| --- | ---: |\n| [Alpha](https://example.org) | `42` |\n| A\\|B | 7 |\n";
        let table = table_data(source).unwrap();
        let root = markdown::to_mdast(source, &markdown::ParseOptions::gfm()).unwrap();
        let rows = root.children().unwrap()[0].children().unwrap();
        let cells = rows[1].children().unwrap();
        assert_eq!(
            cell_markup(&cells[0], source),
            "[Alpha](https://example.org)"
        );
        assert_eq!(cell_markup(&cells[1], source), "`42`");
        assert_eq!(
            cell_markup(&rows[2].children().unwrap()[0], source),
            "A\\|B"
        );
        assert_eq!(table.headers, ["Name", "Value"]);
        assert_eq!(table.rows, [["Alpha", "42"], ["A|B", "7"]]);
        assert_eq!(table.markdown, source.trim_end());
        assert!(table_data("A paragraph.").is_none());
    }

    #[test]
    fn inline_table_code_preserves_gfm_pipe_values_after_unicode_text() {
        let source =
            "日本語\n\n| Name | Value |\n| --- | --- |\n| **`a\\|b`** and `c\\|d` | café |\n";
        let root = markdown::to_mdast(source, &markdown::ParseOptions::gfm()).unwrap();
        let table = &root.children().unwrap()[1];
        let cell = &table.children().unwrap()[1].children().unwrap()[0];
        let markup = cell_markup(cell, source);
        assert_eq!(markup, "**`a|b`** and `c|d`");
        let standalone = markdown::to_mdast(&markup, &markdown::ParseOptions::gfm()).unwrap();
        assert_eq!(super::plain(&standalone), super::plain(cell));
    }
}
