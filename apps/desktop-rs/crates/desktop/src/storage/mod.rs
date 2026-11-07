//! This foundation has no domain database, event cursor or imported Tauri preferences.
//! Drafts and operation journals are introduced with their NMA-068 recovery semantics.
pub fn description() -> &'static str {
    "Isolated development profile · no domain writes"
}
