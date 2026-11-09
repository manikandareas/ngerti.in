# Desktop Rust hot reload

Date: 2026-11-09. Scope: the owner's request to run `dev:desktop-rs` with native Rust hot reload. Source base: `945685327abafe87359b8ae621ce8c5ce4431ed2` plus this working-tree change. This is a development-tooling change, not a new parity, provider or distribution acceptance gate.

## Configuration

- macOS 26.3 ARM64, Rust 1.99.1, Bun 1.3.10.
- GPUI Kit 0.9.0, GPUI Fast 0.1.13, Subsecond/Dioxus transport 0.7.10; exact Cargo dependencies/checksums remain in `apps/desktop-rs/Cargo.lock`.
- Official Dioxus CLI 0.7.10 (`57d6794`), `dx-aarch64-apple-darwin.tar.gz`, SHA-256 `342c92bc33dca60dadd725ed5e249923f049ae2e1e50b7477f4968d56695b425`. The Bun launcher downloads release asset `496015761` from the official GitHub API and checks the archive before extraction.
- A feature-gated `ngertiin-desktop-dev` package calls the existing desktop library. The `desktop-dev` profile retains renderer optimizations and uses application opt-level 0. No UI implementation is copied into the entry package.
- Only debug hot-reload builds use checkout assets/configured backend paths. Ordinary bundle validation remains strict about incomplete staged backends.

## Executed observations

| Case | Result | Evidence |
| --- | --- | --- |
| First-use CLI setup and argument forwarding | Pass | Moved the cached tool aside, ran `bun run dev:desktop-rs --help`, observed the download, checksum-gated extraction and dx help/`--hot-patch`, then restored the verified cache. |
| Gallery render patch | Pass | Native AX button changed from `Dark` to `Hot reload verified`; selected Read-only snapshot tab remained selected. CLI reported 2929 ms; native PID remained 40118. |
| Gallery retained input and reverse patch | Pass | Entered `kept-across-hot-reload` and unchecked Remember choice. Restored the source label; AX button returned to `Dark`, with the field and checkbox unchanged. CLI reported 2570 ms; PID remained 40118. |
| Real workspace startup | Pass | A private `hot-reload-workspace-probe` profile used a new empty backend state directory and empty configuration, with no copied owner credentials. The dx-generated app opened the native Tobi conversation/welcome through its owned backend. Warm launch build reported 17.26 s. |
| Workspace patch with an unsent draft | Pass | Entered `hot-reload draft remains unsent`; temporarily changed the header's accessibility label. AX changed to `Detail Tobi · hot reload verified`, while the composer value remained unchanged. CLI reported 2864 ms; PID remained 42098. No message was submitted. |
| Source restoration | Pass | Both temporary presentation edits were restored byte-for-byte (`git diff --exit-code` for gallery/chrome). CLI also built the reverse workspace patch, reporting 7808 ms while other Rust checks were running. |
| Signal forwarding and cleanup | Pass | Sent SIGINT to the Bun launcher. The command exited 0; dx/native PIDs disappeared. The workspace's owned test backend PID 42101 also exited. No existing installation was stopped. |

These patch timings describe the captured edits on this host, not a latency guarantee. Native UI was inspected through the macOS accessibility tree and a gallery screenshot. An additional final AX observation encountered a CUA native-pipe startup failure after the successful workspace observation; shutdown was verified through process inspection.

## Repository checks

- Cargo metadata with the default workspace selection: GPUI `hot-reload` is absent. Selecting `ngertiin-desktop-dev/hot-reload` enables it; the development binary has `required-features = ["hot-reload"]`.
- Biome for the launcher/package script, Rust formatting, dependency/rendering ownership and `git diff --check`: passed.
- `CARGO_BUILD_JOBS=2 bun run check:desktop-rs`: passed, including strict workspace/all-target Clippy and **85 tests** (8 avatar vectors, 4 client unit tests, 12 client workspace tests, 1 small-stack worker test and 60 desktop tests). The desktop suite's exhaustive compositor test completed; the full desktop test phase took 240.10 s. The temporary accessibility-label probe was restored while this suite was compiling; strict workspace/all-target Clippy was rerun successfully after restoration.
- All **42** local links across the three changed Markdown files passed a focused check.
- Global `bun run docs:check` still reports **8 existing links** in the imported `.agents/skills/gpui-kit` and `gpui-kit-design-guides` references. Those files were not changed; no additional broken links were reported.

## Integration correction and limits

An initial same-package entry point produced a patch without changing the running UI. dx 0.7.10's `workspace_hotpatch_replay_order` excludes the entry **package**, including its library; merely renaming the binary did not fix it. The separate development package made the desktop library appear in the replay order and the resulting patch became visible. This native smoke test must be repeated on CLI upgrades.

Hot-patching is experimental upstream. Type/layout/registration changes can need a full rebuild and restart; use interactive dx's `r` command or stop/relaunch. Rust rendering edits were exercised; backend TypeScript, automatic asset refresh, every Rust change category, release builds, other platforms and provider inference were not part of this probe. Normal gallery/build/bundle scripts retain their existing Cargo paths.
