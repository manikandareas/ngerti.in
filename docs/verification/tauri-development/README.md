# Tauri development verification

Recorded 2026-11-05 (Asia/Makassar; raw tools use UTC). Scope: the user-authorized macOS ARM64 Tauri development trial on base commit `807bfa08b984cdbaa3feb9387b661f1e02b2e873`, with uncommitted local implementation. This is not production or NMA-064 acceptance. See [runtime/setup](../../architecture/tauri-development.md), [original design](../../architecture/tauri-desktop-design-2026-11-04.md), and [structured results](verification.json).

## Automated checks

| Command / cohort | Result | Evidence boundary |
| --- | --- | --- |
| `cd apps/web-client && bun test verification` | 49 pass, 0 fail, 8,889 assertions | Includes hidden/resume state, avatar clock, bounded file reads and background-launched WK visibility regression. |
| `cd apps/server && bun test tests` | 397 pass, 0 fail, 2,450 assertions | Includes unused-rollout recovery, used/unknown session fencing, lifecycle, adapters, tools, machine and API regressions. |
| Backend typecheck and lint | Pass, Biome checked 188 files | Public API schemas and error codes unchanged. |
| Web `bun run typecheck` and `bun run lint` | Pass, Biome checked 277 files | Static validation. |
| `bun run test:desktop` | 6 Bun + 5 Rust tests pass | Rust tests exercise actual backend discovery, private auth, streaming bytes/SPA/origin boundaries, concurrent startup, immediate shutdown, crash recovery and exact viewer handback. Bun tests retain Electron baseline coverage. |
| `bun run lint:desktop` | Pass | Biome 32 files, Rust fmt and Clippy all targets with warnings denied. |
| `bun run typecheck:desktop` | Pass | TypeScript and Cargo check. |
| Conversation Playwright desktop cohort | 38/38 pass, no skips/flakes | [Summary](conversation-summary.json); isolated fixture backend and Chromium. |
| Work Playwright desktop cohort | 34/34 pass, no skips/flakes | [Summary](work-summary.json); isolated fixture backend and Chromium. |
| `bun run package:desktop` / final `bun run tauri build --bundles app` in desktop workspace | Pass | Release package uses bundled Bun/runtime/assets. Final native show/unhide correction rebuilt before installation. |

A package-only startup failure was also reproduced after stopping the external Electron backend: the original isolated Bun dependency links pointed into a hidden `.bun` directory omitted by Tauri’s resource traversal; workspace directory symlinks were also skipped. Packaging now uses the hoisted dependency layout and materializes the avatar workspace package as a real directory and runs an authenticated readiness smoke test against the actual shipped Bun/backend with private temporary state and no credentials. External attachment alone is not sufficient package proof.

The web cohorts support regressions in shared UI behavior; they do not replace native WebKit checks. The existing Vite warning about chunks above 500 kB remains. The later engine bug fix described below changes internal session recovery; public API schemas/error codes remain unchanged.

Two meaningful regressions were reproduced and fixed during implementation: shutdown tests exposed a retained child zombie causing false process-liveness results; a focused visibility test exposed WKWebView `document.hidden` pausing workspace initialization during background launch. Child reaping and native window visibility now cover these paths.

## Native observations

Used Cua to operate the locally built app, native menus, Finder, and WKWebView. The final app is installed at `~/Applications/Ngertiin Tauri.app`; the original Electron installation is preserved.

- Authenticated attachment to the existing backend succeeded. The final launch log reports packaged runtime resources and external backend ownership. History and the existing ChatGPT subscription model selection loaded. The initial shell checks submitted no inference; the later engine correction is recorded below.
- Entered a disposable plain draft without sending; Quit and Finder relaunch restored it. Cleared the disposable draft afterward. No chat message, Goal or Routine was created by this verification.
- Details/Library/Computer surfaces remain present. The Computer viewer showed actual decoded Linux desktop video in WKWebView, including the XFCE desktop and Cua controls. Human takeover changed the UI to “You have control”.
- Native Hide removed the viewer while JavaScript could be suspended. An authenticated backend read showed the human lease revision 13 became `holder:none`, revision 14. The retained machine remained ready. Show Workspace reconciled the current state instead of restoring a stale human lease.
- Native table CSV export downloaded through a same-origin blob URL. The resulting local file had 463 bytes and seven CSV rows. This test did not alter the source artifact.
- Native Quit stopped the Tauri UI while the externally owned backend stayed alive. Full relaunch used the same stable native origin/storage. Owned shutdown/restart cases were additionally tested against an isolated actual Bun backend through Rust integration tests.
- Launching the installed final build loaded the main UI without requiring Finder activation. The host explicitly shows the macOS application as well as its window, and observes only the main window’s minimize events.

Provider authentication/inference, physical sleep/wake, uploads across a full native restart and every Settings/Composio interaction were not freshly repeated in WKWebView. Their existing backend/shared UI evidence retains its own scope.

## Resource observations

Host: MacBookAir10,1, 8 GiB RAM, macOS 26.3. Inspectors were closed and build/browser-test jobs had finished before the following samples. Both apps displayed the same persisted Tobi conversation with Detail closed and no active inference/viewer. Electron had been running longer and had visited another conversation. The installed Electron UI is the prior revision; Tauri includes this change’s frontend optimizations. These are exploratory process snapshots, not a matched fresh-profile benchmark.

Used macOS `footprint --noCategories -f bytes -j <file> -p <pid> ...` for each group, plus `ps -axo pid,ppid,rss,pcpu,comm`. Included native Rust **and every newly created WebKit content/GPU/network process**, identified by a before/after launch PID snapshot. Unrelated WebKit processes present before launch were excluded. Electron uses its bundle process paths. The shared Bun backend is reported separately, as both clients attach to the same process. Footprint and RSS describe different accounting and must not be mixed.

| Process group | Native foreground sample | Subsequent baseline foreground sample |
| --- | ---: | ---: |
| Tauri host + WebKit footprint | 351.0 MiB | 459.4 MiB |
| Electron main + helpers + renderer footprint | 774.3 MiB | 768.6 MiB |
| Shared Bun footprint | 237.3 MiB | 238.5 MiB |
| Arithmetic UI + Bun total, Tauri | 588.3 MiB | 697.9 MiB |
| Arithmetic UI + Bun total, Electron | 1,011.6 MiB | 1,007.1 MiB |

[Native foreground sample](memory-tauri-visible.json), [subsequent baseline sample](memory-electron-visible.json) retain timestamps, PID attribution, RSS, footprint summaries, errors and warnings. Group-plus-backend arithmetic can count cross-group shared mappings; raw group footprint is the primary observation. The OS’s compressed/swapped/reclaimable accounting and foreground transitions affect these results. No denominator includes the Codex/Muse harness processes or Docker/retained Linux VM. This neither invalidates the reported 1–2 GB workload nor promises that an active complete installation fits below a fixed RAM ceiling.

The release bundle is 496.91 MiB in the Tauri bundler’s report. Most disk weight remains the existing backend production dependencies, especially the native Cua SDK, plus Bun; the Rust host executable is roughly 13 MiB. Disk size is not working memory. Electron development dependencies stay in the repository for baseline comparison but are not bundled in Tauri.

## Animation observation and remaining gate

A [20-second native rAF observation](native-frame-observation.json), entered through the native Inspector, sampled 952 intervals while opening/closing Detail. Median was 17 ms, p95 34 ms, maximum 205 ms, with 46 intervals above 34 ms. This small trace includes Inspector/native-menu perturbation and three main-document clicks; it is not an animation-only or matched Electron cohort. It **does not establish a 60 fps guarantee**. The implementation reduces hidden work and streaming buffering; the remaining spikes cannot be attributed from this trace alone. A subsequent [isolated observation](native-frame-isolated.json) with Electron hidden and a 5-second warmup sampled 1,192 intervals: median 17 ms, p95 20 ms, maximum 64 ms, and three intervals above 34 ms. It included only one main-document click. This supports lower contention when using one desktop client but still does not close the original strict repeated-animation gate.

Production signing/notarization and updates, fresh-machine onboarding, other OS targets, long-duration active workloads, forced-exit native recovery and physical sleep/wake remain outside this trial. No ticket has been marked Done. Electron browser-storage import and a persistent independent background service are also not implemented.

## Conversation engine correction

The user subsequently reported the visible conversation errors. Direct authenticated session opening reproduced HTTP 409 `NATIVE_REJECTED` for Tobi. A local native App Server probe confirmed initialization, ChatGPT authentication, and selected model availability, then returned JSON-RPC -32600: `no rollout found for thread id <requested session>`. Both Tobi and Bianca referenced prewarmed bindings with zero application dispatches; neither corresponding rollout file existed.

Codex does not persist an unused prewarmed thread until its first native turn. The fixture previously wrote every thread immediately, hiding the process-retirement/restart failure. It now retains unused threads only in process memory. A regression test failed with the original `NATIVE_REJECTED`, then passed with the correction.

The adapter now classifies only the exact missing-rollout response for the requested `thread/resume` ID into an internal typed error. The public diagnostic remains secret-free `NATIVE_REJECTED`. The broker first attempts normal resume; only that explicit failure on a Codex binding with no prior application dispatch allows a new native session. Lifecycle atomically checks the binding ID/revision and absence of any associated dispatch before replacing it. Used sessions, unknown acknowledgements, generic rejections and unsupported/unknown resume capabilities never take this path. Model/authentication/billing selection is preserved.

A private SQLite backup made through the backup API passed `PRAGMA integrity_check` before changing the live host. No active dispatch/running/unknown run was present at that point. No database reset or credential replacement was used.

The final installed package successfully started and owned the live backend after Electron was closed. Both original blocked user runs completed through the existing Codex/ChatGPT subscription connection with diagnostics cleared and exactly one public answer each. Native previews visibly changed to the completed replies. A full native Quit removed the owned runtime record; relaunch plus explicit session-open checks resumed the same used binding IDs and native identities without duplicate answers. The retained Computer remained ready. See [live recovery evidence](engine-live-recovery.json). No synthetic conversation message or billing-method change was submitted.

The Cua viewer was reopened after the final owned-backend restart and visibly decoded the retained Linux desktop in the foreground WKWebView. It was closed after verification, leaving the completed Tobi conversation open.
