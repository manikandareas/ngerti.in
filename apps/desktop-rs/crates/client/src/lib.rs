//! Read-only backend consumption. This crate cannot admit work or start a backend.
mod connection;
mod contract;
mod worker;

pub use connection::ReadOnlyClient;
pub use contract::{ClientError, Snapshot, check_contract, decode_snapshot};
pub use worker::SnapshotWorker;
pub const CONTRACT_VERSION: &str = "1.31.0";
