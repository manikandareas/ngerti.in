//! Version-pinned backend consumption. The server retains all domain authority.
mod connection;
mod contract;
mod live;
mod projection;
mod sse;
mod worker;

pub use connection::ReadOnlyClient;
pub use contract::{ClientError, Snapshot, check_contract, decode_snapshot};
pub use live::{ApiClient, ApiWorker, EventFeed};
pub use projection::{Conversation, EventPage, rows, text};
pub use sse::SseDecoder;
pub use worker::SnapshotWorker;
pub const CONTRACT_VERSION: &str = "1.32.0";
