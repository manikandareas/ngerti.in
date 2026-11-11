use serde::Deserialize;
use serde_json::Value;
use std::{fmt, sync::LazyLock};
use uuid::Uuid;

pub(crate) static CONTRACT: LazyLock<Value> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../../../docs/contracts/1.32.0.json"))
        .expect("The retained API contract must be valid JSON")
});
static SNAPSHOT_VALIDATOR: LazyLock<jsonschema::Validator> = LazyLock::new(|| {
    jsonschema::validator_for(&CONTRACT["projections"]["conversation"])
        .expect("The retained conversation schema must compile")
});

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ClientError {
    Unavailable,
    Unauthorized,
    Http(u16),
    Malformed,
    TooLarge,
    VersionMismatch,
    ShapeMismatch,
    InvalidConnection,
    WrongThread,
    Busy,
    Rejected { code: String, message: String },
}
impl fmt::Display for ClientError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        if let Self::Rejected { message, .. } = self {
            return f.write_str(message);
        }
        f.write_str(match self {
            Self::Unavailable => "Backend unavailable. Start or select a compatible local backend, then retry.",
            Self::Unauthorized => "Backend authentication failed. Check the private attachment credential, then retry.",
            Self::Http(_) => "The backend request failed. Try the same request again.",
            Self::Malformed => "The backend returned malformed JSON. Check the backend version, then retry.",
            Self::TooLarge => "The response exceeds the 16 MiB preview limit. Open a smaller snapshot.",
            Self::VersionMismatch => "Backend contract version differs from 1.32.0. Select a compatible backend.",
            Self::ShapeMismatch => "The backend response differs from the pinned contract. Refresh the contract before continuing.",
            Self::InvalidConnection => "Select an explicit loopback HTTP origin and a valid installation credential.",
            Self::WrongThread => "The snapshot belongs to a different thread. Reattach to the intended conversation.",
            Self::Busy => "A snapshot read is already pending. Wait for it to finish, then retry.",
            Self::Rejected { .. } => unreachable!(),
        })
    }
}
impl std::error::Error for ClientError {}

/// Full shape is validated before this deliberately small presentation projection is decoded.
#[derive(Debug, Deserialize)]
pub struct Snapshot {
    pub cursor: u64,
    pub thread: Thread,
    pub agents: Vec<Agent>,
    pub messages: Vec<Message>,
    pub has_more: bool,
    pub next_before: Option<Uuid>,
}
#[derive(Debug, Deserialize)]
pub struct Thread {
    pub id: Uuid,
    pub name: Option<String>,
}
#[derive(Debug, Deserialize)]
pub struct Agent {
    pub id: Uuid,
    pub name: String,
}
#[derive(Debug, Deserialize)]
pub struct Message {
    pub id: Uuid,
    pub text: String,
    pub state: String,
    pub author: String,
}

pub fn check_contract(bytes: &[u8]) -> Result<(), ClientError> {
    let remote: Value = serde_json::from_slice(bytes).map_err(|_| ClientError::Malformed)?;
    if remote["version"] != super::CONTRACT_VERSION {
        return Err(ClientError::VersionMismatch);
    }
    if remote["projections"]["conversation"] != CONTRACT["projections"]["conversation"] {
        return Err(ClientError::ShapeMismatch);
    }
    Ok(())
}

pub fn decode_snapshot(bytes: &[u8]) -> Result<Snapshot, ClientError> {
    let value: Value = serde_json::from_slice(bytes).map_err(|_| ClientError::Malformed)?;
    if !SNAPSHOT_VALIDATOR.is_valid(&value) {
        return Err(ClientError::ShapeMismatch);
    }
    serde_json::from_value(value).map_err(|_| ClientError::ShapeMismatch)
}
