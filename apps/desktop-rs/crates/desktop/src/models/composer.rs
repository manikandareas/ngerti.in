use serde::{Deserialize, Serialize};
use std::{collections::VecDeque, ops::Range};
use unicode_segmentation::UnicodeSegmentation;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReferenceKind {
    Agent,
    User,
    File,
    Skill,
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Reference {
    pub kind: ReferenceKind,
    pub id: String,
    pub label: String,
    pub source: Option<String>,
    pub agent_id: Option<String>,
    pub version: Option<u64>,
}
fn identifier(s: &str) -> bool {
    !s.is_empty()
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
}
fn encode(s: &str) -> String {
    percent_encoding::utf8_percent_encode(s, percent_encoding::NON_ALPHANUMERIC)
        .to_string()
        .replace("%2D", "-")
        .replace("%5F", "_")
        .replace("%2E", ".")
        .replace("%7E", "~")
}
impl Reference {
    pub fn validate(&self) -> Result<(), &'static str> {
        if self.label.is_empty()
            || self
                .label
                .chars()
                .any(|c| c.is_control() || matches!(c, '\u{2028}' | '\u{2029}'))
        {
            return Err("Reference label is invalid.");
        }
        match self.kind {
            ReferenceKind::Skill
                if !self.id.is_empty()
                    && !self.id.chars().any(char::is_control)
                    && matches!(
                        self.source.as_deref(),
                        Some("application" | "harness" | "native")
                    )
                    && self.agent_id.as_deref().is_some_and(identifier)
                    && self.version != Some(0) =>
            {
                Ok(())
            }
            ReferenceKind::User
                if self.id == "owner"
                    && self.source.is_none()
                    && self.agent_id.is_none()
                    && self.version.is_none() =>
            {
                Ok(())
            }
            ReferenceKind::Agent | ReferenceKind::File
                if identifier(&self.id)
                    && self.source.is_none()
                    && self.agent_id.is_none()
                    && self.version.is_none() =>
            {
                Ok(())
            }
            _ => Err("Reference metadata is invalid."),
        }
    }
    pub fn url(&self) -> String {
        match self.kind {
            ReferenceKind::Skill => format!(
                "ngertiin://skill/{}/{}?agent={}{}",
                self.source.as_deref().unwrap_or("application"),
                encode(&self.id),
                encode(self.agent_id.as_deref().unwrap_or("")),
                self.version
                    .map_or(String::new(), |v| format!("&version={v}"))
            ),
            _ => format!(
                "ngertiin://{}/{}",
                match self.kind {
                    ReferenceKind::Agent => "agent",
                    ReferenceKind::User => "user",
                    _ => "file",
                },
                encode(&self.id)
            ),
        }
    }
    pub fn wire(&self) -> String {
        let label = self
            .label
            .replace('\\', "\\\\")
            .replace('[', "\\[")
            .replace(']', "\\]");
        format!("[{label}]({})", self.url())
    }
}
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Token {
    pub range: Range<usize>,
    pub reference: Reference,
}
#[derive(Clone, Debug, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Draft {
    pub text: String,
    pub tokens: Vec<Token>,
}
impl Draft {
    pub fn validate(&self) -> Result<(), &'static str> {
        let mut end = 0;
        for token in &self.tokens {
            token.reference.validate()?;
            if token.range.start < end
                || token.range.start >= token.range.end
                || token.range.end > self.text.len()
                || !self.boundary(token.range.start)
                || !self.boundary(token.range.end)
                || self.text.get(token.range.clone()) != Some(token.reference.wire().as_str())
            {
                return Err("Reference range is invalid.");
            }
            end = token.range.end;
        }
        Ok(())
    }
    fn boundary(&self, i: usize) -> bool {
        i == self.text.len() || self.text.grapheme_indices(true).any(|(j, _)| i == j)
    }
    pub fn normalize(&self, range: Range<usize>) -> Range<usize> {
        let start = range.start.min(self.text.len());
        let end = range.end.max(start).min(self.text.len());
        let mut from = self
            .text
            .grapheme_indices(true)
            .map(|(i, _)| i)
            .take_while(|i| *i <= start)
            .last()
            .unwrap_or(0);
        if start == self.text.len() {
            from = start;
        }
        let mut to = if start == end {
            from
        } else {
            self.text
                .grapheme_indices(true)
                .map(|(i, _)| i)
                .find(|i| *i >= end)
                .unwrap_or(self.text.len())
        };
        for token in &self.tokens {
            if from == to && token.range.start < from && from < token.range.end {
                from = token.range.end;
                to = from;
            } else if from < token.range.end && token.range.start < to {
                from = from.min(token.range.start);
                to = to.max(token.range.end);
            }
        }
        from..to
    }
    pub fn slice(&self, range: Range<usize>) -> Self {
        let range = self.normalize(range);
        Self {
            text: self.text[range.clone()].into(),
            tokens: self
                .tokens
                .iter()
                .filter(|t| range.start <= t.range.start && t.range.end <= range.end)
                .map(|t| Token {
                    range: t.range.start - range.start..t.range.end - range.start,
                    reference: t.reference.clone(),
                })
                .collect(),
        }
    }
    pub fn plain(&self) -> String {
        let mut s = String::new();
        let mut end = 0;
        for t in &self.tokens {
            s.push_str(&self.text[end..t.range.start]);
            s.push_str(&t.reference.label);
            end = t.range.end;
        }
        s.push_str(&self.text[end..]);
        s
    }
    pub fn replace(
        &self,
        range: Range<usize>,
        insert: &Draft,
    ) -> Result<(Self, Range<usize>), &'static str> {
        self.validate()?;
        insert.validate()?;
        let range = self.normalize(range);
        let delta = insert.text.len() as isize - range.len() as isize;
        let mut next = self.clone();
        next.text.replace_range(range.clone(), &insert.text);
        next.tokens = self
            .tokens
            .iter()
            .filter(|t| t.range.end <= range.start || t.range.start >= range.end)
            .map(|t| {
                let mut t = t.clone();
                if t.range.start >= range.end {
                    t.range = t
                        .range
                        .start
                        .checked_add_signed(delta)
                        .expect("Valid edit start")
                        ..t.range
                            .end
                            .checked_add_signed(delta)
                            .expect("Valid edit end");
                }
                t
            })
            .collect();
        next.tokens.extend(insert.tokens.iter().map(|t| Token {
            range: t.range.start + range.start..t.range.end + range.start,
            reference: t.reference.clone(),
        }));
        next.tokens.sort_by_key(|t| t.range.start);
        next.validate()?;
        let end = range.start + insert.text.len();
        Ok((next, end..end))
    }
    pub fn reference(reference: Reference) -> Result<Self, &'static str> {
        reference.validate()?;
        let text = reference.wire();
        let range = 0..text.len();
        Ok(Self {
            text,
            tokens: vec![Token { range, reference }],
        })
    }
}
#[derive(Clone, Debug, Default)]
pub struct Snapshot {
    pub draft: Draft,
    pub selection: Range<usize>,
    pub reversed: bool,
}
#[derive(Default)]
pub struct History {
    entries: VecDeque<Snapshot>,
    position: usize,
}
impl History {
    pub fn new() -> Self {
        let mut h = Self::default();
        h.entries.push_back(Snapshot::default());
        h
    }
    pub fn record(&mut self, snapshot: Snapshot) {
        if self
            .entries
            .get(self.position)
            .is_some_and(|s| s.draft == snapshot.draft)
        {
            self.entries[self.position] = snapshot;
            return;
        }
        self.entries.truncate(self.position + 1);
        self.entries.push_back(snapshot);
        let retained_bytes = |entry: &Snapshot| {
            entry.draft.text.len()
                + entry
                    .draft
                    .tokens
                    .iter()
                    .map(|t| {
                        t.reference.label.len()
                            + t.reference.id.len()
                            + t.reference.source.as_ref().map_or(0, String::len)
                            + t.reference.agent_id.as_ref().map_or(0, String::len)
                    })
                    .sum::<usize>()
        };
        let mut bytes = self.entries.iter().map(retained_bytes).sum::<usize>();
        while self.entries.len() > 1 && (self.entries.len() > 128 || bytes > 8 * 1024 * 1024) {
            bytes -= retained_bytes(&self.entries.pop_front().expect("Retained history entry"));
        }
        self.position = self.entries.len() - 1;
    }
    pub fn selection(&mut self, range: Range<usize>, reversed: bool) {
        if let Some(s) = self.entries.get_mut(self.position) {
            s.selection = s.draft.normalize(range);
            s.reversed = reversed;
        }
    }
    pub fn undo(&mut self) -> Option<Snapshot> {
        if self.position == 0 {
            return None;
        }
        self.position -= 1;
        self.entries.get(self.position).cloned()
    }
    pub fn redo(&mut self) -> Option<Snapshot> {
        if self.position + 1 >= self.entries.len() {
            return None;
        }
        self.position += 1;
        self.entries.get(self.position).cloned()
    }
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClipboardDraft {
    pub ngertiin_composer: u8,
    pub draft: Draft,
}
impl ClipboardDraft {
    pub fn decode(value: &str) -> Option<Draft> {
        if value.len() > 4 * 1024 * 1024 {
            return None;
        }
        let value: Self = serde_json::from_str(value).ok()?;
        (value.ngertiin_composer == 1 && value.draft.validate().is_ok()).then_some(value.draft)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn mention() -> Reference {
        Reference {
            kind: ReferenceKind::Agent,
            id: "tobi".into(),
            label: "@Tobi".into(),
            source: None,
            agent_id: None,
            version: None,
        }
    }
    #[test]
    fn atomic_copy_cut_paste_and_history_keep_metadata() {
        let token = Draft::reference(mention()).unwrap();
        let (draft, _) = Draft {
            text: "Hi 👩🏽‍💻 é\n".into(),
            tokens: vec![],
        }
        .replace(20..20, &token)
        .unwrap();
        let span = draft.tokens[0].range.clone();
        let copied = draft.slice(span.start + 2..span.end - 2);
        assert_eq!(copied, token);
        assert_eq!(copied.plain(), "@Tobi");
        let serialized = serde_json::to_string(&ClipboardDraft {
            ngertiin_composer: 1,
            draft: copied.clone(),
        })
        .unwrap();
        assert_eq!(ClipboardDraft::decode(&serialized), Some(copied));
        let (cut, _) = draft.replace(span.clone(), &Draft::default()).unwrap();
        assert!(cut.tokens.is_empty());
        let (pasted, _) = cut.replace(span.start..span.start, &token).unwrap();
        assert_eq!(pasted, draft);
        let mut history = History::new();
        history.record(Snapshot {
            draft: draft.clone(),
            ..Default::default()
        });
        history.record(Snapshot {
            draft: cut,
            ..Default::default()
        });
        assert_eq!(history.undo().unwrap().draft, draft);
        assert!(history.redo().unwrap().draft.tokens.is_empty());
    }
    #[test]
    fn history_retires_old_drafts_within_its_byte_budget() {
        let mut history = History::new();
        for index in 0..6 {
            history.record(Snapshot {
                draft: Draft {
                    text: format!("{index}{}", "x".repeat(2 * 1024 * 1024)),
                    tokens: vec![],
                },
                ..Default::default()
            });
        }
        assert_eq!(history.entries.len(), 3);
        assert!(history.undo().unwrap().draft.text.starts_with('4'));
        assert!(history.undo().unwrap().draft.text.starts_with('3'));
        assert!(history.undo().is_none());
        history.record(Snapshot {
            draft: Draft {
                text: "y".repeat(9 * 1024 * 1024),
                tokens: vec![],
            },
            ..Default::default()
        });
        assert_eq!(history.entries.len(), 1);
        assert!(history.undo().is_none());
    }
    #[test]
    fn graphemes_and_invalid_clipboard_are_never_split_or_trusted() {
        let draft = Draft {
            text: "é👩🏽‍💻x".into(),
            tokens: vec![],
        };
        assert_eq!(draft.slice(1..2).text, "é");
        assert_eq!(draft.slice(4..6).text, "👩🏽‍💻");
        let mut token = Draft::reference(mention()).unwrap();
        token.tokens[0].range.start = 1;
        assert!(token.validate().is_err());
        assert!(
            ClipboardDraft::decode(r#"{"ngertiin_composer":2,"draft":{"text":"x","tokens":[]}}"#)
                .is_none()
        );
    }
}
