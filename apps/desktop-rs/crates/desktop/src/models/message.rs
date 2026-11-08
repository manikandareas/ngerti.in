//! Safe presentation data. There is deliberately no raw observation/command field.
use chrono::{DateTime, Datelike, FixedOffset, Local};
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ActivityKind {
    Thinking,
    Reading,
    Searching,
    Working,
    Waiting,
    Failed,
    Settled,
}
impl ActivityKind {
    pub fn label(self) -> &'static str {
        match self {
            Self::Thinking => "Thinking it through…",
            Self::Reading => "Reading the relevant files…",
            Self::Searching => "Looking for useful sources…",
            Self::Working => "Working on your request…",
            Self::Waiting => "Waiting for your input",
            Self::Failed => "Could not finish this step",
            Self::Settled => "Finished",
        }
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PublicationTime {
    pub date: String,
    pub day_label: String,
    pub clock: String,
    pub accessible: String,
}
impl PublicationTime {
    pub fn local(iso: &str) -> Result<Self, &'static str> {
        let time = DateTime::parse_from_rfc3339(iso).map_err(|_| "Invalid publication time.")?;
        Self::new(iso, time.with_timezone(&Local).offset().local_minus_utc())
    }
    pub fn new(iso: &str, offset_seconds: i32) -> Result<Self, &'static str> {
        let time = DateTime::parse_from_rfc3339(iso).map_err(|_| "Invalid publication time.")?;
        let offset = FixedOffset::east_opt(offset_seconds).ok_or("Invalid time zone offset.")?;
        let local = time.with_timezone(&offset);
        // These calendar words and punctuation mirror the current id-ID formatter.
        let month = [
            "Januari",
            "Februari",
            "Maret",
            "April",
            "Mei",
            "Juni",
            "Juli",
            "Agustus",
            "September",
            "Oktober",
            "November",
            "Desember",
        ][local.month0() as usize];
        let weekday = [
            "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu",
        ][local.weekday().num_days_from_monday() as usize];
        let clock = local.format("%H.%M").to_string();
        Ok(Self {
            date: local.format("%Y-%m-%d").to_string(),
            day_label: format!("{} {month} {}", local.day(), local.year()),
            accessible: format!(
                "{weekday}, {:02} {month} {} pukul {clock}",
                local.day(),
                local.year()
            ),
            clock,
        })
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InteractionState {
    Current,
    Submitting,
    Submitted(AnswerValue),
    Resolved(AnswerValue),
    Uncertain,
    Checking,
    Failed,
    Expired,
}
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct AnswerValue {
    pub choices: Vec<String>,
    pub text: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CustomAnswer {
    Disabled,
    Alternative,
    Additional,
}
#[derive(Clone, Debug)]
pub struct AnswerRules {
    pub minimum: usize,
    pub maximum: Option<usize>,
    pub custom: CustomAnswer,
    pub text_limit_utf16: usize,
}
impl Default for AnswerRules {
    fn default() -> Self {
        Self {
            minimum: 1,
            maximum: Some(1),
            custom: CustomAnswer::Disabled,
            text_limit_utf16: 500,
        }
    }
}
#[derive(Clone, Debug)]
pub struct Choice {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
}
#[derive(Clone, Debug)]
pub struct Interaction {
    pub request_id: String,
    pub revision: u64,
    pub question: String,
    pub choices: Vec<Choice>,
    pub approval: bool,
    pub multiple: bool,
    pub rules: AnswerRules,
    pub state: InteractionState,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct InteractionReply {
    pub request_id: String,
    pub revision: u64,
    pub choices: Vec<String>,
    pub text: Option<String>,
}
impl Interaction {
    pub fn reply_at(
        &self,
        request_id: &str,
        revision: u64,
        ids: Vec<String>,
        text: Option<&str>,
    ) -> Result<InteractionReply, &'static str> {
        if self.request_id != request_id || self.revision != revision {
            return Err("This request changed. Review its current choices before responding.");
        }
        self.reply(ids, text)
    }
    pub fn reply(
        &self,
        ids: Vec<String>,
        text: Option<&str>,
    ) -> Result<InteractionReply, &'static str> {
        if !matches!(
            self.state,
            InteractionState::Current | InteractionState::Failed
        ) {
            return Err("This request is no longer accepting a response.");
        }
        let text = text.filter(|text| {
            !text
                .trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}')
                .is_empty()
        });
        if text.is_some_and(|text| text.encode_utf16().count() > self.rules.text_limit_utf16)
            || (text.is_some() && self.rules.custom == CustomAnswer::Disabled)
            || (text.is_some() && self.rules.custom == CustomAnswer::Alternative && !ids.is_empty())
        {
            return Err("Enter a currently allowed answer within its text limit.");
        }
        let alternative = text.is_some() && self.rules.custom == CustomAnswer::Alternative;
        let count = ids.len() + usize::from(text.is_some());
        if (!alternative
            && (count < self.rules.minimum || self.rules.maximum.is_some_and(|max| count > max)))
            || (!self.multiple && count > 1)
            || ids
                .iter()
                .any(|id| !self.choices.iter().any(|c| c.id == *id))
        {
            return Err("Choose a currently offered answer.");
        }
        let unique: std::collections::HashSet<_> = ids.iter().collect();
        if unique.len() != ids.len() {
            return Err("Choose each answer once.");
        }
        Ok(InteractionReply {
            request_id: self.request_id.clone(),
            revision: self.revision,
            choices: ids,
            text: text.map(str::to_owned),
        })
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn publication_calendar_matches_the_current_client_vectors() {
        let reference: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../verification/nma-067/chronology-reference.json"
        ))
        .unwrap();
        for case in reference["cases"].as_array().unwrap() {
            let time = PublicationTime::new(case["at"].as_str().unwrap(), 28800).unwrap();
            assert_eq!(time.date, case["day"].as_str().unwrap());
            assert_eq!(time.day_label, case["label"].as_str().unwrap());
            assert_eq!(time.clock, case["clock"].as_str().unwrap());
            assert_eq!(time.accessible, case["title"].as_str().unwrap());
        }
    }
    #[test]
    fn publication_clocks_and_interactions_are_stable_and_revision_bound() {
        let time = PublicationTime::new("2026-11-06T17:05:00Z", 8 * 3600).unwrap();
        assert_eq!(time.date, "2026-11-07");
        assert_eq!(time.clock, "01.05");
        let mut q = Interaction {
            request_id: "q".into(),
            revision: 7,
            question: "Which source?".into(),
            choices: vec![Choice {
                id: "a".into(),
                label: "A".into(),
                description: None,
            }],
            approval: false,
            multiple: false,
            rules: AnswerRules::default(),
            state: InteractionState::Current,
        };
        assert_eq!(q.reply(vec!["a".into()], None).unwrap().revision, 7);
        assert!(q.reply_at("q", 6, vec!["a".into()], None).is_err());
        assert!(
            q.reply_at("another-request", 7, vec!["a".into()], None)
                .is_err()
        );
        assert!(q.reply_at("q", 7, vec!["a".into()], None).is_ok());
        assert!(q.reply(vec!["invented".into()], None).is_err());
        q.state = InteractionState::Submitted(AnswerValue {
            choices: vec!["a".into()],
            text: None,
        });
        assert!(q.reply(vec!["a".into()], None).is_err());
        for state in [
            InteractionState::Uncertain,
            InteractionState::Checking,
            InteractionState::Submitting,
            InteractionState::Expired,
            InteractionState::Resolved(AnswerValue::default()),
        ] {
            q.state = state;
            assert!(q.reply(vec!["a".into()], None).is_err());
        }
        q.state = InteractionState::Failed;
        assert!(q.reply(vec!["a".into()], None).is_ok());
        q.state = InteractionState::Current;
        q.rules.custom = CustomAnswer::Alternative;
        q.rules.text_limit_utf16 = 4;
        assert_eq!(
            q.reply(vec![], Some("😀😀")).unwrap().text.as_deref(),
            Some("😀😀")
        );
        assert!(q.reply(vec![], Some("😀😀x")).is_err());
        assert!(q.reply(vec![], Some(" \u{feff} ")).is_err());
        assert!(q.reply(vec!["a".into()], Some("text")).is_err());
        q.rules.minimum = 2;
        assert!(q.reply(vec![], Some("text")).is_ok());
        q.multiple = true;
        q.rules.custom = CustomAnswer::Additional;
        q.rules.minimum = 2;
        q.rules.maximum = Some(2);
        assert!(q.reply(vec!["a".into()], Some("text")).is_ok());
        assert!(q.reply(vec!["a".into()], None).is_err());
        q.rules.minimum = 0;
        assert!(q.reply(vec![], None).is_ok());
        q.rules.maximum = Some(3);
        assert!(q.reply(vec!["a".into(), "a".into()], None).is_err());
    }
}
