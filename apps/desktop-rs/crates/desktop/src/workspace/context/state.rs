use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Default, PartialEq, Eq)]
pub(super) enum Location {
    #[default]
    Overview,
    Member(String),
    Goal(String),
    Routine(String),
    Artifact(String),
    Profile,
    Skills,
    Apps,
    Files,
}
#[derive(Default)]
pub(super) struct Folder {
    pub entries: Vec<Value>,
    pub after: Option<String>,
    pub loading: bool,
    pub error: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum FolderStatus {
    Loading,
    Retry,
    More,
    Empty,
}
#[derive(Clone)]
pub(super) enum TreeRow {
    Entry {
        entry: Value,
        depth: usize,
    },
    Status {
        path: String,
        depth: usize,
        state: FolderStatus,
    },
}
impl TreeRow {
    pub fn entry(&self) -> Option<&Value> {
        match self {
            Self::Entry { entry, .. } => Some(entry),
            _ => None,
        }
    }
}
pub(super) enum TreeIntent {
    None,
    Load(String),
    Open(Value),
}
#[derive(Default)]
pub(super) struct Tree {
    pub folders: BTreeMap<String, Folder>,
    pub expanded: BTreeSet<String>,
    pub selected: String,
    rows: std::rc::Rc<[TreeRow]>,
}
impl Tree {
    pub fn apply(&mut self, path: String, value: Value, append: bool) {
        let folder = self.folders.entry(path).or_default();
        if !append {
            folder.entries.clear();
        }
        for entry in value["entries"].as_array().into_iter().flatten() {
            if let Some(old) = folder
                .entries
                .iter_mut()
                .find(|v| v["path"] == entry["path"])
            {
                *old = entry.clone();
            } else {
                folder.entries.push(entry.clone());
            }
        }
        folder.after = value["next_after"].as_str().map(str::to_owned);
        folder.loading = false;
        folder.error = None;
        self.refresh_rows();
        if !append && !self.selected.is_empty() && self.selected_index().is_none() {
            self.selected.clear();
        }
    }
    pub fn rows(&self) -> std::rc::Rc<[TreeRow]> {
        self.rows.clone()
    }
    pub fn selected_index(&self) -> Option<usize> {
        self.rows
            .iter()
            .position(|row| row.entry().is_some_and(|e| e["path"] == self.selected))
    }
    pub fn toggle(&mut self, path: &str) -> bool {
        let opened = if self.expanded.remove(path) {
            false
        } else {
            self.expanded.insert(path.into());
            true
        };
        self.refresh_rows();
        opened
    }
    pub fn refresh_rows(&mut self) {
        fn walk(tree: &Tree, path: &str, depth: usize, out: &mut Vec<TreeRow>) {
            if depth > 64 {
                return;
            }
            if let Some(folder) = tree.folders.get(path) {
                let mut entries: Vec<_> = folder.entries.iter().collect();
                // Zed's explorer groups folders first. Pagination still uses
                // the backend's cursor; this orders only the loaded prefix.
                entries.sort_by_cached_key(|entry| {
                    (
                        entry["type"] != "directory",
                        entry["name"].as_str().unwrap_or("").to_lowercase(),
                    )
                });
                for entry in entries {
                    out.push(TreeRow::Entry {
                        entry: entry.clone(),
                        depth,
                    });
                    if let Some(path) = entry["path"].as_str()
                        && tree.expanded.contains(path)
                    {
                        walk(tree, path, depth + 1, out);
                    }
                }
                let state = if folder.loading {
                    Some(FolderStatus::Loading)
                } else if folder.error.is_some() {
                    Some(FolderStatus::Retry)
                } else if folder.after.is_some() {
                    Some(FolderStatus::More)
                } else if folder.entries.is_empty() {
                    Some(FolderStatus::Empty)
                } else {
                    None
                };
                if let Some(state) = state {
                    out.push(TreeRow::Status {
                        path: path.into(),
                        depth,
                        state,
                    });
                }
            }
        }
        let mut rows = vec![];
        walk(self, "", 0, &mut rows);
        self.rows = rows.into();
    }
    pub fn navigate(&mut self, key: &str) -> TreeIntent {
        let entries: Vec<_> = self
            .rows
            .iter()
            .filter_map(TreeRow::entry)
            .cloned()
            .collect();
        let current = entries.iter().position(|e| e["path"] == self.selected);
        let index = match key {
            "down" => Some(current.map_or(0, |i| (i + 1).min(entries.len().saturating_sub(1)))),
            "up" => Some(current.map_or(0, |i| i.saturating_sub(1))),
            "home" => Some(0),
            "end" => entries.len().checked_sub(1),
            _ => None,
        };
        if let Some(entry) = index.and_then(|i| entries.get(i)) {
            self.selected = entry["path"].as_str().unwrap_or("").into();
            return TreeIntent::None;
        }
        let Some(entry) = current.and_then(|i| entries.get(i)) else {
            return TreeIntent::None;
        };
        let path = entry["path"].as_str().unwrap_or("").to_owned();
        let directory = entry["type"] == "directory";
        match key {
            "left" => {
                if directory && self.expanded.remove(&path) {
                    self.refresh_rows();
                } else if let Some((parent, _)) = path.rsplit_once('/') {
                    self.selected = parent.into();
                }
            }
            "right" if directory => {
                if self.expanded.contains(&path) {
                    if let Some(child) = entries.iter().find(|e| {
                        e["path"].as_str().is_some_and(|p| {
                            p.rsplit_once('/').is_some_and(|(parent, _)| parent == path)
                        })
                    }) {
                        self.selected = child["path"].as_str().unwrap_or("").into();
                    }
                } else {
                    self.expanded.insert(path.clone());
                    self.refresh_rows();
                    if !self.folders.contains_key(&path) {
                        return TreeIntent::Load(path);
                    }
                }
            }
            "enter" | "space" => {
                if directory {
                    if self.toggle(&path) && !self.folders.contains_key(&path) {
                        return TreeIntent::Load(path);
                    }
                } else if entry["type"] == "file" {
                    return TreeIntent::Open(entry.clone());
                }
            }
            _ => {}
        }
        TreeIntent::None
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn page(entries: Value, after: Value) -> Value {
        json!({"entries":entries,"next_after":after})
    }
    #[test]
    fn folder_pages_append_without_duplicate_entries_and_keep_other_folders() {
        let mut tree = Tree::default();
        tree.apply(
            "".into(),
            page(
                json!([{"name":"src","path":"src","type":"directory"}]),
                Value::Null,
            ),
            false,
        );
        tree.toggle("src");
        tree.apply(
            "src".into(),
            page(
                json!([{"name":"a.rs","path":"src/a.rs","type":"file"}]),
                json!("a"),
            ),
            false,
        );
        tree.apply("src".into(),page(json!([{"name":"a.rs","path":"src/a.rs","type":"file"},{"name":"b.rs","path":"src/b.rs","type":"file"}]),Value::Null),true);
        assert_eq!(tree.rows.iter().filter_map(TreeRow::entry).count(), 3);
        tree.selected = "src/b.rs".into();
        tree.apply("src".into(), page(json!([]), Value::Null), false);
        assert_eq!(tree.rows.iter().filter_map(TreeRow::entry).count(), 1);
        assert!(tree.selected.is_empty());
        assert!(tree.expanded.contains("src"));
    }
    #[test]
    fn folder_status_follows_its_descendants_before_the_next_sibling() {
        let mut tree = Tree::default();
        tree.apply("".into(),page(json!([{"name":"z.txt","path":"z.txt","type":"file"},{"name":"src","path":"src","type":"directory"}]),Value::Null),false);
        tree.toggle("src");
        tree.apply(
            "src".into(),
            page(
                json!([{"name":"a.rs","path":"src/a.rs","type":"file"}]),
                json!("a"),
            ),
            false,
        );
        assert_eq!(tree.rows[0].entry().unwrap()["path"], "src");
        assert_eq!(tree.rows[1].entry().unwrap()["path"], "src/a.rs");
        assert!(
            matches!(&tree.rows[2],TreeRow::Status{path,depth:1,state:FolderStatus::More} if path=="src")
        );
        assert_eq!(tree.rows[3].entry().unwrap()["path"], "z.txt");
    }
    #[test]
    fn keyboard_skips_status_rows_and_preserves_expanded_parents() {
        let mut tree = Tree::default();
        tree.apply("".into(),page(json!([{"name":"src","path":"src","type":"directory"},{"name":"z.txt","path":"z.txt","type":"file"}]),Value::Null),false);
        tree.navigate("home");
        assert!(matches!(tree.navigate("right"),TreeIntent::Load(path) if path=="src"));
        tree.apply(
            "src".into(),
            page(
                json!([{"name":"a.rs","path":"src/a.rs","type":"file"}]),
                json!("a"),
            ),
            false,
        );
        tree.navigate("right");
        assert_eq!(tree.selected, "src/a.rs");
        tree.navigate("down");
        assert_eq!(tree.selected, "z.txt");
        tree.navigate("up");
        tree.navigate("left");
        assert_eq!(tree.selected, "src");
        tree.navigate("left");
        assert!(!tree.expanded.contains("src"));
    }
}
