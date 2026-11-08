//! Native profile state. Projection cursors are deliberately never persisted.
mod journal;
pub(crate) use journal::{Operation, OperationState, Store};
pub fn description() -> &'static str {
    "Isolated development profile"
}
