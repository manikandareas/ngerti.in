use anyhow::{Context, ensure};
use base64::{Engine, engine::general_purpose::STANDARD};
use ngertiin_client::{ApiClient, ClientError};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::BTreeMap,
    fs::{self, File, OpenOptions},
    io::Write,
    os::unix::fs::{OpenOptionsExt, PermissionsExt},
    path::{Path, PathBuf},
};
use uuid::Uuid;

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct StagedFile {
    pub id: Uuid,
    pub name: String,
    pub media_type: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Request {
    pub key: Uuid,
    pub path: String,
    pub body: Value,
}

#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) enum OperationState {
    Pending,
    Unknown,
    Rejected,
    Acknowledged,
}

#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Operation {
    pub request: Request,
    pub uploads: Vec<Request>,
    pub replayable: bool,
    pub state: OperationState,
    pub thread: Option<Uuid>,
    pub authored: Option<String>,
    pub response: Option<Value>,
    #[serde(default)]
    pub staged_ids: Vec<Uuid>,
    #[serde(default)]
    cleanup_complete: bool,
}

impl Operation {
    pub fn command(path: String, body: Value, thread: Option<Uuid>) -> Self {
        Self {
            request: Request {
                key: Uuid::new_v4(),
                path,
                body,
            },
            uploads: vec![],
            replayable: true,
            state: OperationState::Pending,
            thread,
            authored: None,
            response: None,
            staged_ids: vec![],
            cleanup_complete: false,
        }
    }

    pub fn execute(&self, api: &ApiClient) -> Result<Value, ClientError> {
        if !self.uploads.is_empty() {
            let status = api.get(&format!("/v1/message-submissions/{}", self.request.key))?;
            if status["state"] == "committed" {
                return Ok(status["result"].clone());
            }
        }
        for request in &self.uploads {
            api.post(&request.path, &request.body, Some(request.key))?;
        }
        api.post(
            &self.request.path,
            &self.request.body,
            self.replayable.then_some(self.request.key),
        )
    }

    pub fn unresolved(&self) -> bool {
        matches!(
            self.state,
            OperationState::Pending | OperationState::Unknown
        )
    }
}

#[derive(Default, Serialize, Deserialize)]
#[serde(default)]
struct Preferences {
    origin: String,
    owner: String,
    selected: Option<Uuid>,
    dark: bool,
    drafts: BTreeMap<Uuid, String>,
    files: BTreeMap<Uuid, Vec<StagedFile>>,
    recipients: BTreeMap<Uuid, Uuid>,
}

pub(crate) struct Store {
    root: PathBuf,
    preferences: Preferences,
    operations: BTreeMap<String, Operation>,
    _lock: File,
}
fn atomic(path: &Path, value: &impl Serialize) -> anyhow::Result<()> {
    let temporary = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .mode(0o600)
        .open(&temporary)?;
    file.write_all(&serde_json::to_vec(value)?)?;
    file.sync_all()?;
    fs::rename(&temporary, path)?;
    File::open(path.parent().context("Missing profile directory")?)?.sync_all()?;
    Ok(())
}

fn load<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> anyhow::Result<T> {
    if !path.try_exists()? {
        return Ok(T::default());
    }
    serde_json::from_reader(File::open(path)?).context("Native profile data could not be read. Preserve the profile and restore its verified backup.")
}

impl Store {
    pub fn open(root: PathBuf) -> anyhow::Result<Self> {
        fs::create_dir_all(&root)?;
        fs::set_permissions(&root, fs::Permissions::from_mode(0o700))?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .open(root.join("profile.lock"))?;
        lock.try_lock()
            .context("This native workspace profile is already open in another process.")?;
        let mut this = Self {
            preferences: load(&root.join("preferences.json"))?,
            operations: load(&root.join("operations.json"))?,
            root,
            _lock: lock,
        };
        for files in this.preferences.files.values_mut() {
            files.retain(|file| this.root.join(format!("{}.bytes", file.id)).is_file());
        }
        this.save_preferences()?;
        let acknowledged: Vec<_> = this
            .operations
            .values()
            .filter(|op| {
                op.state == OperationState::Acknowledged
                    && !op.cleanup_complete
                    && op.authored.is_some()
            })
            .cloned()
            .collect();
        for op in acknowledged {
            this.clear_sent(&op)?;
        }
        let retained: std::collections::BTreeSet<_> = this
            .preferences
            .files
            .values()
            .flatten()
            .map(|file| file.id)
            .collect();
        for entry in fs::read_dir(&this.root)? {
            let entry = entry?;
            let path = entry.path();
            if path
                .extension()
                .is_some_and(|extension| extension == "bytes")
                && entry.file_type()?.is_file()
                && let Some(id) = path
                    .file_stem()
                    .and_then(|name| name.to_str())
                    .and_then(|name| name.parse::<Uuid>().ok())
                && !retained.contains(&id)
            {
                fs::remove_file(path)?;
            }
        }
        Ok(this)
    }

    pub fn bind(&mut self, origin: &str, owner: &str) -> anyhow::Result<()> {
        ensure!(
            self.preferences.origin.is_empty() || self.preferences.owner == owner,
            "This native profile belongs to another backend/owner. Use its original attachment configuration."
        );
        if self.preferences.origin == origin && self.preferences.owner == owner {
            return Ok(());
        }
        self.preferences.origin = origin.into();
        self.preferences.owner = owner.into();
        self.save_preferences()
    }

    fn save_preferences(&self) -> anyhow::Result<()> {
        atomic(&self.root.join("preferences.json"), &self.preferences)
    }
    fn save_operations(&self) -> anyhow::Result<()> {
        atomic(&self.root.join("operations.json"), &self.operations)
    }
    pub fn selected(&self) -> Option<Uuid> {
        self.preferences.selected
    }
    pub fn select(&mut self, id: Uuid) -> anyhow::Result<()> {
        self.preferences.selected = Some(id);
        self.save_preferences()
    }
    pub fn recipient(&self, id: Uuid) -> Option<Uuid> {
        self.preferences.recipients.get(&id).copied()
    }
    pub fn choose_recipient(&mut self, id: Uuid, agent: Option<Uuid>) -> anyhow::Result<()> {
        if let Some(agent) = agent {
            self.preferences.recipients.insert(id, agent);
        } else {
            self.preferences.recipients.remove(&id);
        }
        self.save_preferences()
    }
    pub fn dark(&self) -> bool {
        self.preferences.dark
    }
    pub fn theme(&mut self, dark: bool) -> anyhow::Result<()> {
        self.preferences.dark = dark;
        self.save_preferences()
    }
    pub fn draft(&self, id: Uuid) -> String {
        self.preferences
            .drafts
            .get(&id)
            .cloned()
            .unwrap_or_default()
    }
    pub fn save_draft(&mut self, id: Uuid, text: String) -> anyhow::Result<()> {
        if self.draft(id) == text {
            return Ok(());
        }
        self.preferences.drafts.insert(id, text);
        self.save_preferences()
    }
    pub fn files(&self, id: Uuid) -> Vec<StagedFile> {
        self.preferences.files.get(&id).cloned().unwrap_or_default()
    }

    pub fn file_root(&self) -> PathBuf {
        self.root.clone()
    }
    #[cfg(test)]
    pub fn stage(
        &mut self,
        thread: Uuid,
        name: String,
        media_type: String,
        bytes: Vec<u8>,
    ) -> anyhow::Result<StagedFile> {
        let file = Self::write_staged(&self.root, name, media_type, bytes)?;
        self.retain_staged(thread, file.clone())?;
        Ok(file)
    }
    pub fn write_staged(
        root: &Path,
        name: String,
        media_type: String,
        bytes: Vec<u8>,
    ) -> anyhow::Result<StagedFile> {
        ensure!(
            bytes.len() <= 10 * 1024 * 1024,
            "Choose a file of at most 10 MiB."
        );
        let file = StagedFile {
            id: Uuid::new_v4(),
            name,
            media_type,
        };
        let mut output = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(root.join(format!("{}.bytes", file.id)))?;
        output.write_all(&bytes)?;
        output.sync_all()?;
        Ok(file)
    }
    pub fn retain_staged(&mut self, thread: Uuid, file: StagedFile) -> anyhow::Result<()> {
        ensure!(self.files(thread).len() < 20, "Attach at most 20 files.");
        self.preferences
            .files
            .entry(thread)
            .or_default()
            .push(file.clone());
        self.save_preferences()?;
        Ok(())
    }

    pub fn remove_file(&mut self, thread: Uuid, id: Uuid) -> anyhow::Result<()> {
        if let Some(files) = self.preferences.files.get_mut(&thread) {
            files.retain(|f| f.id != id);
        }
        self.save_preferences()?;
        let path = self.root.join(format!("{id}.bytes"));
        if path.try_exists()? {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    pub fn pending(&self, slot: &str) -> Option<Operation> {
        self.operations
            .get(slot)
            .filter(|op| op.unresolved())
            .cloned()
    }
    pub fn operation(&self, slot: &str) -> Option<&Operation> {
        self.operations.get(slot)
    }
    pub fn unresolved(&self) -> Vec<(String, Operation)> {
        self.operations
            .iter()
            .filter(|(_, op)| op.unresolved())
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }
    pub fn prepare(&mut self, slot: &str, operation: Operation) -> anyhow::Result<Operation> {
        if let Some(old) = self.pending(slot) {
            self.save_operations()?;
            return Ok(old);
        }
        self.operations.insert(slot.into(), operation.clone());
        self.save_operations()?;
        Ok(operation)
    }

    pub fn finish(
        &mut self,
        slot: &str,
        key: Uuid,
        result: &Result<Value, ClientError>,
    ) -> anyhow::Result<()> {
        let previous = self.operations.get(slot).cloned();
        if let Some(op) = self
            .operations
            .get_mut(slot)
            .filter(|op| op.request.key == key)
        {
            match result {
                Ok(value) => {
                    op.state = OperationState::Acknowledged;
                    op.response = Some(value.clone());
                    op.uploads.clear();
                    op.cleanup_complete = op.authored.is_none();
                }
                Err(ClientError::Rejected { code, .. })
                    if matches!(
                        code.as_str(),
                        "INVALID_REQUEST"
                            | "UNAUTHORIZED"
                            | "SCOPE_DENIED"
                            | "NOT_FOUND"
                            | "CONFLICT"
                            | "IDEMPOTENCY_CONFLICT"
                            | "CAPABILITY_UNKNOWN"
                            | "CAPABILITY_UNSUPPORTED"
                    ) =>
                {
                    op.state = OperationState::Rejected
                }
                Err(_) => op.state = OperationState::Unknown,
            }
        }
        if let Err(error) = self.save_operations() {
            if let Some(previous) = previous {
                self.operations.insert(slot.into(), previous);
            }
            return Err(error);
        }
        Ok(())
    }

    pub fn submission(
        &self,
        thread: Uuid,
        agent: Option<Uuid>,
        group: bool,
        text: String,
    ) -> anyhow::Result<Operation> {
        let mut op = Operation::command(
            if group {
                format!("/v1/groups/{thread}/messages")
            } else {
                "/v1/runs".into()
            },
            json!({}),
            Some(thread),
        );
        let files = self.files(thread);
        let mut content = text.clone();
        for file in &files {
            let artifact = Uuid::new_v4();
            op.staged_ids.push(file.id);
            let bytes = fs::read(self.root.join(format!("{}.bytes", file.id)))?;
            op.uploads.push(Request{key:artifact,path:"/v1/message-uploads".into(),body:json!({"submission_id":op.request.key,"thread_id":thread,"agent_id":agent,"name":file.name,"media_type":file.media_type,"content_base64":STANDARD.encode(bytes)})});
            if content.contains(&format!("ngertiin://file/{}", file.id)) {
                content = content.replace(
                    &format!("ngertiin://file/{}", file.id),
                    &format!("ngertiin://file/{artifact}"),
                );
            } else {
                content.push_str(&format!(
                    "\n[{}](ngertiin://file/{artifact})",
                    file.name.replace(['[', ']', '\n', '\r'], " ")
                ));
            }
        }
        let mut ids: Vec<Uuid> = regex::Regex::new(r"ngertiin://file/([a-zA-Z0-9-]+)")
            .expect("Reference pattern")
            .captures_iter(&content)
            .filter_map(|c| c[1].parse().ok())
            .collect();
        ids.sort();
        ids.dedup();
        op.request.body = json!({"submission_id":op.request.key,"agent_id":agent,"text":content,"artifact_ids":ids});
        if !group {
            op.request.body["thread_id"] = json!(thread);
        }
        op.authored = Some(text);
        Ok(op)
    }

    pub fn clear_sent(&mut self, op: &Operation) -> anyhow::Result<()> {
        if let Some(thread) = op.thread {
            if op
                .authored
                .as_ref()
                .is_some_and(|text| self.draft(thread) == *text)
            {
                self.preferences.drafts.remove(&thread);
            }
            let ids = &op.staged_ids;
            if let Some(files) = self.preferences.files.get_mut(&thread) {
                files.retain(|f| !ids.contains(&f.id));
            }
            self.save_preferences()?;
            for id in ids {
                let path = self.root.join(format!("{id}.bytes"));
                if path.try_exists()? {
                    fs::remove_file(path)?;
                }
            }
        }
        for saved in self
            .operations
            .values_mut()
            .filter(|saved| saved.request.key == op.request.key)
        {
            saved.cleanup_complete = true;
        }
        self.save_operations()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn restart_retains_exact_input_bytes_and_recovers_acknowledged_cleanup() {
        let root = std::env::temp_dir().join(format!("ngertiin-journal-{}", Uuid::new_v4()));
        let thread = Uuid::new_v4();
        let agent = Uuid::new_v4();
        let slot = format!("message:{thread}");
        let mut store = Store::open(root.clone()).unwrap();
        store.bind("http://127.0.0.1:1/", "owner").unwrap();
        assert!(Store::open(root.clone()).is_err());
        store.save_draft(thread, "Hello 😀".into()).unwrap();
        store.select(thread).unwrap();
        store
            .stage(
                thread,
                "source.txt".into(),
                "text/plain".into(),
                b"original bytes".to_vec(),
            )
            .unwrap();
        let operation = store
            .submission(thread, Some(agent), false, store.draft(thread))
            .unwrap();
        store.prepare(&slot, operation.clone()).unwrap();
        store
            .finish(&slot, operation.request.key, &Err(ClientError::Unavailable))
            .unwrap();
        drop(store);
        let mut store = Store::open(root.clone()).unwrap();
        assert_eq!(store.selected(), Some(thread));
        assert_eq!(store.draft(thread), "Hello 😀");
        let restored = store.pending(&slot).unwrap();
        assert_eq!(restored.request.key, operation.request.key);
        assert_eq!(restored.request.body, operation.request.body);
        assert_eq!(restored.uploads[0].body, operation.uploads[0].body);
        assert_eq!(
            STANDARD
                .decode(restored.uploads[0].body["content_base64"].as_str().unwrap())
                .unwrap(),
            b"original bytes"
        );
        store.bind("http://127.0.0.1:2/", "owner").unwrap();
        assert!(store.bind("http://127.0.0.1:2/", "other-owner").is_err());
        store
            .finish(&slot, operation.request.key, &Ok(json!({"accepted":true})))
            .unwrap();
        drop(store);
        let mut store = Store::open(root.clone()).unwrap();
        assert!(store.pending(&slot).is_none());
        assert!(store.draft(thread).is_empty());
        assert!(store.files(thread).is_empty());
        store.save_draft(thread, "Hello 😀".into()).unwrap();
        drop(store);
        let store = Store::open(root.clone()).unwrap();
        assert_eq!(store.draft(thread), "Hello 😀");
        drop(store);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn certain_rejection_keeps_files_but_next_intent_has_new_upload_identity() {
        let root = std::env::temp_dir().join(format!("ngertiin-journal-{}", Uuid::new_v4()));
        let thread = Uuid::new_v4();
        let mut store = Store::open(root.clone()).unwrap();
        store
            .stage(thread, "report.txt".into(), "text/plain".into(), vec![42])
            .unwrap();
        let first = store
            .submission(thread, Some(Uuid::new_v4()), false, "Read this".into())
            .unwrap();
        store.prepare("submission", first.clone()).unwrap();
        store
            .finish(
                "submission",
                first.request.key,
                &Err(ClientError::Rejected {
                    code: "CONFLICT".into(),
                    message: "Refresh".into(),
                }),
            )
            .unwrap();
        let second = store
            .submission(thread, Some(Uuid::new_v4()), false, "Read this".into())
            .unwrap();
        assert_ne!(first.uploads[0].key, second.uploads[0].key);
        assert_eq!(first.staged_ids, second.staged_ids);
        drop(store);
        fs::remove_dir_all(root).unwrap();
    }
}
