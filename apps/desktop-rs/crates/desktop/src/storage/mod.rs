//! Native profile state. Projection cursors are deliberately never persisted.
mod journal;
mod reading;
#[cfg(test)]
mod reading_tests;
pub(crate) use journal::{Operation, OperationState, Store};
pub(crate) use reading::ReadingPosition;
pub fn description() -> &'static str {
    "Isolated development profile"
}
