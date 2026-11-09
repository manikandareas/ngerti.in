use super::*;
mod tree_view;
use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use std::sync::LazyLock;

static ICONS: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../../../assets/format-icons/manifest.json"
    ))
    .expect("Pinned icon manifest")
});
pub(in crate::workspace) fn encode(value: &str) -> String {
    utf8_percent_encode(value, NON_ALPHANUMERIC).to_string()
}
pub(in crate::workspace) fn file_icon(
    name: &str,
    folder: bool,
    expanded: bool,
    dark: bool,
) -> AnyElement {
    file_icon_sized(name, folder, expanded, dark, 18.)
}
pub(in crate::workspace) fn file_icon_sized(
    name: &str,
    folder: bool,
    expanded: bool,
    dark: bool,
    size: f32,
) -> AnyElement {
    let path = icon_path(name, folder, expanded, !dark);
    img(crate::platform::assets::root().join(format!("format-icons/{path}")))
        .size(ui(size))
        .flex_shrink_0()
        .into_any_element()
}
fn icon_path(path: &str, folder: bool, expanded: bool, light: bool) -> String {
    let normalized = path.to_lowercase();
    let parts: Vec<_> = normalized.split('/').collect();
    let name = parts.last().copied().unwrap_or("");
    let mut names = vec![];
    if parts.len() > 1 {
        names.push(parts[parts.len() - 2..].join("/"));
    }
    names.push(name.to_owned());
    let theme = if light { &ICONS["light"] } else { &Value::Null };
    let lookup = |key: &str, values: &[String]| {
        values
            .iter()
            .find_map(|name| theme[key][name].as_str().or(ICONS[key][name].as_str()))
    };
    let fallback = |key: &str| theme[key].as_str().or(ICONS[key].as_str());
    let id = if folder {
        (if expanded {
            lookup("folderNamesExpanded", &names)
        } else {
            None
        })
        .or_else(|| lookup("folderNames", &names))
        .or_else(|| {
            if expanded {
                fallback("folderExpanded")
            } else {
                None
            }
        })
        .or_else(|| fallback("folder"))
    } else {
        let segments: Vec<_> = name.split('.').skip(1).collect();
        let mut extensions = vec![];
        for ix in 0..segments.len() {
            let ext = segments[ix..].join(".");
            if parts.len() > 1 {
                extensions.push(format!("{}/{ext}", parts[parts.len() - 2]));
            }
            extensions.push(ext);
        }
        lookup("fileNames", &names)
            .or_else(|| lookup("fileExtensions", &extensions))
            .or_else(|| fallback("file"))
    }
    .unwrap_or("file");
    ICONS["icons"][id].as_str().unwrap_or("file.svg").to_owned()
}
impl Workspace {
    pub(in crate::workspace) fn open_working_files(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.context_work.tree_focus_observers.is_empty() {
            let focus = self.context_work.tree_focus.clone();
            self.context_work.tree_focus_observers = vec![
                cx.on_focus_in(&focus, window, |_, _, cx| cx.notify()),
                cx.on_focus_out(&focus, window, |_, _, _, cx| cx.notify()),
            ];
        }
        self.locate_context(Location::Files, window, cx);
        self.context_work.tree_focus.focus(window, cx);
        if !self.context_work.tree.folders.contains_key("") {
            self.load_folder("".into(), false, cx);
        }
    }
    fn load_folder(&mut self, path: String, append: bool, cx: &mut Context<Self>) {
        let folder = self
            .context_work
            .tree
            .folders
            .entry(path.clone())
            .or_default();
        if folder.loading {
            return;
        }
        let retained_count = if append { 0 } else { folder.entries.len() };
        let after = if append { folder.after.clone() } else { None };
        folder.loading = true;
        folder.error = None;
        self.context_work.tree.refresh_rows();
        let Some(worker) = &self.reads else {
            let folder = self.context_work.tree.folders.entry(path).or_default();
            folder.loading = false;
            folder.error = Some("The local connection is unavailable.".into());
            self.context_work.tree.refresh_rows();
            cx.notify();
            return;
        };
        let url = format!(
            "/v1/machine/files?path={}&limit=200{}",
            encode(&path),
            after
                .map(|v| format!("&after={}", encode(&v)))
                .unwrap_or_default()
        );
        let result = worker.submit(false, move |api| {
            let mut page = api.get(&url)?;
            while page["entries"].as_array().map_or(0, Vec::len) < retained_count {
                let Some(after) = page["next_after"].as_str() else {
                    break;
                };
                let next = api.get(&format!(
                    "{}&after={}",
                    url.split("&after=").next().unwrap_or(&url),
                    encode(after)
                ))?;
                let entries = next["entries"]
                    .as_array()
                    .ok_or(ClientError::ShapeMismatch)?
                    .clone();
                if entries.is_empty() {
                    break;
                }
                page["entries"]
                    .as_array_mut()
                    .ok_or(ClientError::ShapeMismatch)?
                    .extend(entries);
                page["next_after"] = next["next_after"].clone();
            }
            Ok(page)
        });
        let Ok(reply) = result else {
            let folder = self.context_work.tree.folders.entry(path).or_default();
            folder.loading = false;
            folder.error = Some("The folder read could not start. Try again.".into());
            self.context_work.tree.refresh_rows();
            cx.notify();
            return;
        };
        let key = format!("folder:{path}");
        let identity = key.clone();
        let scope = self.scope;
        let generation = self.context_work.generation;
        let task = cx.spawn(async move |view, cx| {
            let result = reply.await.unwrap_or(Err(ClientError::Unavailable));
            let _ = view.update(cx, |this, cx| {
                if scope != this.scope || generation != this.context_work.generation {
                    return;
                }
                this.context_work.tasks.remove(&identity);
                match result {
                    Ok(value) => this.context_work.tree.apply(path, value, append),
                    Err(error) => {
                        let folder = this.context_work.tree.folders.entry(path).or_default();
                        folder.loading = false;
                        folder.error = Some(error.to_string());
                        this.context_work.tree.refresh_rows();
                    }
                }
                cx.notify();
            });
        });
        self.context_work.tasks.insert(key, task);
        cx.notify();
    }
    pub(in crate::workspace) fn refresh_files(&mut self, cx: &mut Context<Self>) {
        self.context_work.generation += 1;
        self.context_work
            .tasks
            .retain(|key, _| !key.starts_with("folder:"));
        let paths: Vec<_> = self.context_work.tree.folders.keys().cloned().collect();
        for path in paths {
            self.context_work
                .tree
                .folders
                .get_mut(&path)
                .unwrap()
                .loading = false;
            self.load_folder(path, false, cx);
        }
    }
    fn activate_file(&mut self, entry: Value, window: &mut Window, cx: &mut Context<Self>) {
        let path = text(&entry, "path").to_owned();
        self.context_work.tree.selected = path.clone();
        if entry["type"] == "directory" {
            if self.context_work.tree.toggle(&path)
                && !self.context_work.tree.folders.contains_key(&path)
            {
                self.load_folder(path, false, cx);
            }
        } else if entry["type"] == "file" {
            self.open_target(
                focus::Target::working(
                    text(&entry, "name").to_owned(),
                    format!("/v1/machine/file?path={}", encode(&path)),
                ),
                window,
                cx,
            );
        }
        cx.notify();
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use core::prelude::v1::test;
    #[test]
    fn format_precedence_matches_reference() {
        assert_eq!(icon_path("package.json", false, false, true), "nodejs.svg");
        assert_eq!(icon_path("README.md", false, false, true), "readme.svg");
        assert_ne!(
            icon_path("src", true, false, true),
            icon_path("src", true, true, true)
        );
        assert_eq!(
            icon_path("workspace.ts", false, false, true),
            "typescript.svg"
        );
    }
}
