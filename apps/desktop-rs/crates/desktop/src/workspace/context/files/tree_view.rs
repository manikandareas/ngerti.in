//! Zed project-panel geometry, adapted to the scoped Ngertiin file browser.
//! Source pin and deliberate differences: docs/research/zed-file-tree-2026-11-08.md.
use super::super::state::{FolderStatus, TreeIntent, TreeRow};
use super::*;
use gpui_kit::{base::Button as BaseButton, component::tooltip::Tooltip};

// One product-owned geometry scale: 24-unit content plus a reserved focus border.
const ROW_HEIGHT: f32 = 26.;
const INDENT: f32 = 20.;
const INSET: f32 = 6.;
const ICON: f32 = 16.;
const DISCLOSURE_GAP: f32 = 2.;
const LABEL_GAP: f32 = 6.;
const GUIDE_OFFSET: f32 = 15.;

impl Workspace {
    pub(in crate::workspace) fn working_files_open(&self) -> bool {
        self.context_work.location == Location::Files
    }
    pub(in crate::workspace) fn working_files(&self, cx: &mut Context<Self>) -> AnyElement {
        let p = Palette::new(self.store.dark());
        let rows = self.context_work.tree.rows();
        let weak = cx.entity().downgrade();
        let list = uniform_list(
            "working-files-rows",
            rows.len(),
            move |range, window, cx| {
                weak.update(cx, |this, cx| {
                    range
                        .map(|index| this.working_file_row(&rows[index], window, cx))
                        .collect()
                })
                .unwrap_or_default()
            },
        )
        .track_scroll(&self.context_work.tree_scroll)
        .h_full()
        .w_full();
        div()
            .id("working-files-browser")
            .flex_1()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .child(
                div()
                    .id("working-file-tree")
                    .role(Role::Tree)
                    .aria_label("Working files")
                    .track_focus(&self.context_work.tree_focus)
                    .flex_1()
                    .min_h_0()
                    .min_w_0()
                    .overflow_hidden()
                    .py(ui(4.))
                    .on_key_down(cx.listener(|this, event: &KeyDownEvent, window, cx| {
                        let key = event.keystroke.key.as_str();
                        if !matches!(
                            key,
                            "up" | "down" | "left" | "right" | "home" | "end" | "enter" | "space"
                        ) {
                            return;
                        }
                        if matches!(key, "enter" | "space")
                            && !this.context_work.tree_focus.is_focused(window)
                        {
                            return;
                        }
                        this.context_work.tree_focus.focus(window, cx);
                        match this.context_work.tree.navigate(key) {
                            TreeIntent::Load(path) => this.load_folder(path, false, cx),
                            TreeIntent::Open(entry) => this.activate_file(entry, window, cx),
                            TreeIntent::None => {}
                        }
                        if let Some(index) = this.context_work.tree.selected_index() {
                            this.context_work
                                .tree_scroll
                                .scroll_to_item(index, ScrollStrategy::Nearest);
                        }
                        window.prevent_default();
                        cx.stop_propagation();
                        cx.notify();
                    }))
                    .child(list),
            )
            .child(
                div()
                    .border_t_1()
                    .border_color(p.color("border-subtle"))
                    .px(ui(12.))
                    .py(ui(10.))
                    .child(caption("Shared with all your agents on this machine.", p)),
            )
            .into_any_element()
    }
    fn working_file_row(
        &self,
        row: &TreeRow,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let p = Palette::new(self.store.dark());
        match row {
            TreeRow::Entry { entry, depth } => {
                let path = text(entry, "path").to_owned();
                let label = text(entry, "name").to_owned();
                let directory = entry["type"] == "directory";
                let expanded = self.context_work.tree.expanded.contains(&path);
                let selected = self.context_work.tree.selected == path;
                let focused = self.context_work.tree_focus.contains_focused(window, cx);
                let tooltip = path.clone();
                let clicked = entry.clone();
                let mut item = BaseButton::new(SharedString::from(format!("tree:{path}")))
                    .role(Role::TreeItem)
                    .accessibility_label(label.clone())
                    .aria_selected(selected)
                    .aria_level(depth + 1)
                    .focusable(false)
                    .when(directory, |row| row.aria_expanded(expanded))
                    .when(selected, |row| row.aria_active_descendant())
                    .relative()
                    .w_full()
                    .h(ui(ROW_HEIGHT))
                    .min_w_0()
                    .justify_start()
                    .font_weight(FontWeight::NORMAL)
                    .text_size(ui(14.))
                    .line_height(ui(24.))
                    .text_color(p.color("foreground"))
                    .border_1()
                    .border_color(p.color("ring").opacity(if selected && focused {
                        1.
                    } else {
                        0.
                    }))
                    .when(selected, |row| row.bg(p.color("menu-active")))
                    .when(!selected, |row| {
                        row.hover(|row| row.bg(p.color("menu-hover")))
                    })
                    .tooltip(move |window, cx| Tooltip::new(tooltip.clone()).build(window, cx))
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.context_work.tree_focus.focus(window, cx);
                        this.activate_file(clicked.clone(), window, cx);
                    }));
                for guide in self.tree_guides(&path, *depth, p) {
                    item = item.child(guide);
                }
                let disclosure =
                    div()
                        .w(ui(ICON))
                        .h(ui(ICON))
                        .flex_shrink_0()
                        .when(directory, |slot| {
                            slot.child(glyph(
                                if expanded {
                                    "ArrowDown01Icon"
                                } else {
                                    "ArrowRight01Icon"
                                },
                                ICON,
                                p,
                            ))
                        });
                item.child(
                    div()
                        .flex()
                        .items_center()
                        .w_full()
                        .min_w_0()
                        .pl(ui(INSET + *depth as f32 * INDENT))
                        .pr(ui(INSET))
                        .child(disclosure)
                        .child(
                            div()
                                .ml(ui(DISCLOSURE_GAP))
                                .flex_shrink_0()
                                .child(file_icon_sized(
                                    &path,
                                    directory,
                                    expanded,
                                    self.store.dark(),
                                    ICON,
                                )),
                        )
                        .child(
                            div()
                                .ml(ui(LABEL_GAP))
                                .flex_1()
                                .min_w_0()
                                .truncate()
                                .child(label),
                        ),
                )
                .into_any_element()
            }
            TreeRow::Status { path, depth, state } => {
                let (label, disabled) = match state {
                    FolderStatus::Loading => ("Loading…", true),
                    FolderStatus::Retry => ("Couldn’t load folder · Try again", false),
                    FolderStatus::More => ("Load more", false),
                    FolderStatus::Empty => ("Empty folder", true),
                };
                let append = *state == FolderStatus::More;
                let target = path.clone();
                let mut status =
                    BaseButton::new(SharedString::from(format!("folder-state:{path}")))
                        .accessibility_label(format!(
                            "{label} · {}",
                            if path.is_empty() {
                                "Working files"
                            } else {
                                path
                            }
                        ))
                        .disabled(disabled)
                        .relative()
                        .w_full()
                        .h(ui(ROW_HEIGHT))
                        .justify_start()
                        .text_size(ui(12.))
                        .text_color(p.color("muted-foreground"))
                        .when(!disabled, |row| {
                            row.hover(|row| row.bg(p.color("menu-hover")))
                        })
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.context_work.tree_focus.focus(window, cx);
                            this.load_folder(target.clone(), append, cx)
                        }));
                for guide in self.tree_guides(path, *depth, p) {
                    status = status.child(guide);
                }
                status
                    .child(
                        div()
                            .pl(ui(INSET
                                + *depth as f32 * INDENT
                                + ICON
                                + DISCLOSURE_GAP
                                + ICON
                                + LABEL_GAP))
                            .pr(ui(INSET))
                            .min_w_0()
                            .truncate()
                            .child(label),
                    )
                    .into_any_element()
            }
        }
    }
    fn tree_guides(&self, path: &str, depth: usize, p: Palette) -> Vec<Div> {
        let selected = &self.context_work.tree.selected;
        (0..depth)
            .map(|level| {
                let ancestor = path
                    .split('/')
                    .take(level + 1)
                    .collect::<Vec<_>>()
                    .join("/");
                let active = selected == &ancestor || selected.starts_with(&format!("{ancestor}/"));
                div()
                    .absolute()
                    .top_0()
                    .bottom_0()
                    .left(ui(INSET + GUIDE_OFFSET + level as f32 * INDENT))
                    .border_l_1()
                    .border_color(p.color("muted-foreground").opacity(if active {
                        0.35
                    } else {
                        0.16
                    }))
            })
            .collect()
    }
}
