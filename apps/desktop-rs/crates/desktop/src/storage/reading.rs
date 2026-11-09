//! A presentation checkpoint, scoped to the native profile and backend thread.
//! Event cursors and authoritative conversation data are never stored here.
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReadingPosition {
    pub row: String,
    pub sequence: Option<u64>,
    /// Offset within the row in rem units, so interface zoom stays meaningful.
    pub offset: f32,
    pub following: bool,
}
impl ReadingPosition {
    pub fn is_valid(&self) -> bool {
        self.row.len() <= 512 && self.offset.is_finite() && self.offset >= 0.
    }
}
