use regex::Regex;
use serde_json::{Value, json};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::Path,
    sync::{LazyLock, mpsc},
};

#[derive(Clone)]
pub struct Log(mpsc::SyncSender<(String, Value)>);

impl Log {
    pub fn new(home: &Path, secrets: Vec<String>) -> Self {
        let path = home.join("tauri.log");
        let (sender, receiver) = mpsc::sync_channel::<(String, Value)>(128);
        std::thread::spawn(move || {
            while let Ok((event, detail)) = receiver.recv() {
                if fs::metadata(&path).is_ok_and(|m| m.len() > 2_000_000) {
                    let _ = fs::rename(&path, path.with_extension("log.previous"));
                }
                let detail = redact(detail, &secrets);
                let detail: String = detail.to_string().chars().take(8000).collect();
                let line = json!({"at": chrono::Utc::now().to_rfc3339(), "event": event, "detail": detail});
                let mut options = OpenOptions::new();
                options.create(true).append(true);
                #[cfg(unix)]
                {
                    use std::os::unix::fs::OpenOptionsExt;
                    options.mode(0o600);
                }
                if let Ok(mut file) = options.open(&path) {
                    let _ = writeln!(file, "{line}");
                }
            }
        });
        Self(sender)
    }

    pub fn event(&self, event: &str, detail: impl Into<Value>) {
        let _ = self.0.try_send((event.to_string(), detail.into()));
    }
}

fn redact(value: Value, secrets: &[String]) -> Value {
    static KEYS: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new("(?i)token|password|secret|api.?key|authorization|cookie").unwrap()
    });
    static BEARER: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r#"(?i)Bearer\s+[^\s"\\]+"#).unwrap());
    match value {
        Value::Object(values) => Value::Object(
            values
                .into_iter()
                .map(|(key, value)| {
                    let value = if KEYS.is_match(&key) {
                        json!("[redacted]")
                    } else {
                        redact(value, secrets)
                    };
                    (key, value)
                })
                .collect(),
        ),
        Value::Array(values) => {
            Value::Array(values.into_iter().map(|v| redact(v, secrets)).collect())
        }
        Value::String(mut text) => {
            for secret in secrets.iter().filter(|s| s.len() > 7) {
                text = text.replace(secret, "[redacted]");
            }
            Value::String(BEARER.replace_all(&text, "Bearer [redacted]").into_owned())
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_backend_credentials_without_losing_status() {
        let value = redact(
            json!({"status":"ready", "nested":{"api_key":"private"},
            "message":"Bearer generated-token and known-secret"}),
            &["known-secret".into()],
        );
        assert_eq!(value["status"], "ready");
        assert_eq!(value["nested"]["api_key"], "[redacted]");
        assert_eq!(value["message"], "Bearer [redacted] and [redacted]");
    }
}
