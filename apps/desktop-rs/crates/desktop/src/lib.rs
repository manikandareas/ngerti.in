mod bootstrap;
mod features;
mod host;
pub mod models;
mod platform;
mod shell;
mod storage;
pub mod ui;
mod workspace;

pub use bootstrap::run;
pub fn run_gallery() -> anyhow::Result<()> {
    bootstrap::run_mode(true)
}
