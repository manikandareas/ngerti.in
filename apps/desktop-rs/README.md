# Ngertiin native desktop foundation

An independent Cargo workspace for [NMA-066](../../docs/backlog/NMA-066.md) and [NMA-067](../../docs/backlog/NMA-067.md), both Done under the [2026-11-08 owner decision](../../docs/development/nma-066-067-closure-2026-11-08.md). The default entry point opens the API workspace implemented for [NMA-068](../../docs/backlog/NMA-068.md); the explicit gallery retains avatar/composer/message/rich-content/document components and optional read-only snapshot attachment. NMA-068 is Done; its focused native/API delivery evidence is retained. Remaining technical verification is non-blocking; [foundation evidence](../../docs/verification/nma-066/README.md) retains actual outcomes and limitations. Tauri remains the active product client; integrated desktop parity has its own later gate.

## Run and verify

On the reference macOS ARM64 host, with Rust/Cargo and Xcode Command Line Tools installed:

```sh
bun run dev:desktop-rs
bun run gallery:desktop-rs
bun run check:desktop-rs
bun --cwd apps/desktop-rs build
bun --cwd apps/desktop-rs bundle:dev
```

The app opens the workspace; the `gallery` example explicitly opens the component gallery. `NGERTIIN_RS_GALLERY=1` also selects the gallery. `Cmd+D` switches theme; `Cmd+Q` quits. The generated unsigned development bundle is `dist/Ngertiin Rust Development.app`. Native PDFKit integration currently targets macOS only. Other-platform builds, signing and fresh-device installation are separate work.

The default Cargo output is `.dev/desktop-rs-target` at the repository root. `NGERTIIN_RS_TARGET_DIR` may select an existing compilation cache; it changes neither runtime profiles nor backend state. During the recorded verification, `.dev/gpui-experiment-target` was reused to avoid rebuilding the same pinned native dependencies.

### Native Rust hot reload

`bun run dev:desktop-rs` runs Dioxus CLI **0.7.10** with GPUI Fast's optional `hot-reload` feature and `dx serve --desktop --renderer native --hot-patch --locked`. A tiny `desktop-dev` launcher package calls the existing desktop library: dx 0.7.10 excludes its entry package from library replay, so putting the entry point in its own package lets desktop-library edits be patched. Its binary requires the opt-in feature and is skipped by ordinary workspace builds/checks. The launcher downloads the official macOS ARM64 CLI archive on first use, verifies its pinned SHA-256 and caches the executable in `.dev/desktop-rs-tools/dioxus-0.7.10`. Rustup-managed Cargo must be available; dx may install nightly Cargo for its build-planning query. The first hot-reload build has its own Cargo profile/cache and takes longer than later edits. The `desktop-dev` Cargo profile leaves the application unoptimized for iteration while inheriting the existing renderer optimization overrides.

Save Rust rendering code to apply a patch to the running native app. Supported patches retain view state. Changes that cannot be patched require a full rebuild/restart; press `r` in the development terminal to rebuild, or stop with `Ctrl+C` and run the command again. Hot-patching is experimental upstream. It applies to Rust code, not backend TypeScript or automatic asset refresh. Development builds read assets and the configured backend from the checkout because dx's temporary app bundle does not stage those resources.

Extra CLI arguments are forwarded, for example `bun run dev:desktop-rs --interactive false`. `NGERTIIN_RS_GALLERY=1` selects the gallery under the same hot-reload launcher. `gallery:desktop-rs`, `build` and `bundle:dev` retain their ordinary Cargo behavior; hot reload is opt-in at the Cargo feature boundary and is disabled in release GPUI code. Only the development CLI listens on loopback; the backend's lifecycle, profiles and attachment rules are unchanged. See [hot-reload verification](../../docs/verification/desktop-rs-hot-reload/README.md).

## Ownership

`desktop` composes `bootstrap`, `shell`, `features`, stateless `ui`, `host`, `platform` and `storage` modules. Feature Entities own input, selection, tasks and subscriptions. Controls accept explicit presentation inputs and return normal builders/callback surfaces, so the caller can apply a final style override. `client` and `avatar` have no GPUI or platform dependency. `scripts/check-boundaries.ts` verifies the entire transitive dependency direction and confines WebView construction to `platform/embedded.rs`.

`client` exposes version-checked API reads/commands, ordered event projections and bounded SSE wakeups. Workspace reads and writes use separate bounded workers with 16 MiB stacks; retiring a scope stops queued reads and the next dependent read after an active bounded request. The original gallery snapshot worker retains its 8 MiB stack and one queued slot. Neither client starts a backend or owns its model loop. This avoids recursive schema compilation on AppKit's small dispatch stacks. Snapshot bodies are bounded at 16 MiB; redirects/proxies are disabled and installation credentials stay in native transport state.

`avatar` ports the versioned recipes, original catalog/geometry/seeded material, expression/action/loading/motion and transparent exports. The desktop adapter shares one native clock and bounded cached compositor with independent eye layers. Exported web portraits are not runtime state assets. See the NMA-067 components below for the executed evidence and retained limitations.

## Explicit backend attachment

The isolated profile is `~/Library/Application Support/Ngertiin Rust Development`. It is distinct from the Tauri profile. The NMA-070 host may import the existing Tauri configuration paths into a new native profile with a fresh manager identity. Preferences, credentials, backend database and pending operations are not copied. The native host references the existing installation and creates only its own private configuration, window state, drafts, operation journal and diagnostics.

Set `NGERTIIN_RS_BACKEND_ORIGIN`, `NGERTIIN_RS_TOKEN_FILE` and `NGERTIIN_RS_THREAD_ID`, or create a private mode-0600 `attachment.json` in that isolated profile:

```json
{
  "origin": "http://127.0.0.1:8000",
  "token_file": "/absolute/path/to/private-installation-token",
  "thread_id": "an-existing-thread-uuid"
}
```

The token file contains the installation bearer, is a regular private file, and is never copied into the application bundle. Only literal loopback HTTP origins are accepted. The client checks contract **1.31.0** and its pinned conversation schema before decoding a snapshot. Environment configuration takes precedence; invalid configuration produces an actionable error instead of choosing another backend. Retry rereads configuration. The gallery and explicitly attached clients perform no admission and start no backend. Ordinary workspace startup uses the native supervisor described below.

For a disposable real-API fixture, run `bun apps/desktop-rs/scripts/fixture-server.ts` from the repository root. Its ignored `.dev/desktop-rs-fixture/connection.json` supplies the three attachment values. It registers zero executors and starts no scheduler or machine. Stop it after the probe. `reference-server.ts` builds an isolated launcher around the existing Tauri binary/current web build for reference captures; its backend fallback executable is `/usr/bin/false` so a lost fixture cannot start a production runtime. `fault-server.ts` supplies deterministic transport failures without domain storage.

## Reference and adoption

The [versioned reference manifest](verification/reference-v1/manifest.json) freezes source hashes, current surface/state owners, product-consumed controls and gallery-only controls. `scripts/freeze-reference.ts` explicitly refreshes this baseline; review its diff before accepting a new reference. `prepare-reference-assets.ts` imports original product Hugeicons and representative Material Icon Theme assets from the built current client. Fonts retain their original OFL files. The original icon SVGs, Material associations and licenses remain local; native probe rasters are generated from those originals.

Selected pins are GPUI Kit/WebView **0.9.0**, GPUI Fast **0.1.13**, lb-wry **0.53.3**, resvg **0.46.0**, objc2-pdf-kit **0.3.2**, reqwest **0.12.28** and jsonschema **0.33.0**; `Cargo.lock` owns all checksums/transitive versions. `platform/pdf.rs` now owns a continuous GPUI viewport with a Quartz raster worker and PDFKit text selection. Its original AppKit-view spike is retained in foundation evidence. `platform/embedded.rs` accepts typed sanitized static HTML with restrictive CSP/disabled JavaScript and blocked navigation, plus ticket-scoped Cua Computer content. Native transport authentication stays outside both browser surfaces; the Computer IPC accepts bounded, exact-session media-health reports only.

Upgrades must repeat cold snapshot decoding from a small-stack caller, malformed/version/shape/HTTP/redirect cases, native input/token/clipboard/IME, focus and keyboard names, image resampling/independent eyes, PDF layout/selection/zoom, child-view geometry/retirement and native overlays. The [source-adoption guide](../../docs/development/source-adoption.md) and verification report distinguish selected candidates from fully proved capabilities.

## NMA-067 components

The **Avatar** scene offers fixed frames and 1/10/30 continuous portraits using the independent Rust engine, one native visibility-aware clock, pointer gaze, independent eyes/blink, loading/actions and reduced motion. Material/texture preparation runs on a bounded worker; replaced GPU images are explicitly retired. The component benchmark records actual image deliveries alongside GPUI draw/work/missed-refresh metrics; redraw callbacks alone do not establish animation cadence.

**Composer** implements atomic agent/user/file/skill tokens, validated metadata clipboard, Unicode/grapheme edits, bounded undo/redo and suggestions. It emits typed submission/file intents without network policy. **Messages** supplies native DM/group/user/assistant attribution, file-only rows, safe activity, clocks/day markers and revision-bound question/approval/retry controls. NMA-068 binds these components to durable operations and the real API.

**Content** has a read-only virtual source editor with precomputed Syntect highlights in the original syntax palette, literal find/wrap/line numbers; a variable-height virtual table with stable sorting/filtering/range copy and an expanded native dialog; native selectable Markdown/GFM; and bounded native image decoding/fit/zoom/copy. Original download bytes are distinct from rendered/copy formats. Limits remain 128,000-byte text preview, 100,000 highlighted UTF-16 units, virtual source above 500 lines, PDF 16 MiB/500 pages and five bounded nearby PDF rasters. Unsupported/incomplete documents retain actionable download states.

**Native PDF** uses Quartz page rasters and PDFKit text with GPUI continuous pages, selection, paging, fit/50–200% zoom, reading anchors, error/retry and original downloads. **Static HTML** mounts only a sanitized document body in the isolated adapter; GPUI owns surrounding controls and overlays. Shell/composer/messages/Markdown/source/table/image/PDF never load React, Lexical, PDF.js or the TypeScript avatar runtime.

[Component verification](../../docs/verification/nma-067/README.md) records actual native interactions, eight original-download hash checks, source vectors and failures/corrections. The owner accepts the implemented components with remaining CJK, exhaustive visual/control and performance checks non-blocking under the recorded decision. NMA-066/NMA-067 are Done; NMA-068 is Done; NMA-069 is Done for contextual workflows; NMA-070 is Done for native Computer/host lifecycle with bounded evidence; NMA-071 is Done for integrated native development acceptance under the [focused November 9 scope](../../docs/development/nma-071-closure-scope-2026-11-09.md), with [retained evidence and limitations](../../docs/verification/nma-071/README.md). Tauri remains the active reference host; signing, fresh-device installation and general distribution remain separate.

A Rust executable generates transparent SVG/PNG from either a new seed or a stored recipe, without TypeScript or a browser:

```sh
# Run from the repository root; exporter arguments are relative to apps/desktop-rs.
bun apps/desktop-rs/scripts/cargo.ts run -p ngertiin-avatar --example export -- verification/nma-067/new-seed-request.json ../../.dev/avatar-export
```

The output prefix's parent directory must exist. Exports include the resulting recipe JSON; requested PNG sizes are bounded to 32–2048 pixels. PNG rasterization applies the pinned resvg 0.46.0 displacement workaround; standalone SVG retains the original filter. `scripts/avatar-reference.ts` refreshes development-only source vectors explicitly; ordinary checks consume the frozen vectors and never invoke the TypeScript renderer. NMA-067 is Done for the accepted component scope; unexecuted native checks keep their actual status in the evidence report.

## NMA-069 contextual work

Detail, scoped group/member profiles, Goals/Routine, saved results, memory, inherited/app-owned skills, provider configuration and Composio connection/grant forms use native GPUI controls. Settings retains General/Providers/About and selected provider in place; System/Light/Dark is stored independently from the effective appearance. Provider login, catalog discovery, inference and effective billing remain separate backend observations.

Working files uses lazy per-folder reads, append pagination, retry/refresh, retained tree/scroll/focus state and the complete pinned Material Icon Theme assets. Its [Zed-inspired native refinement](../../docs/verification/nma-069/zed-tree/README.md) adds flat aligned rows, branch guides, folder-first grouping and a retained virtual list. Focus composes the existing native Markdown/source/table/image/PDF adapters, native header/menu/download/context chip/composer and isolated static HTML body. Working files and table snapshots become uploads only on Send; a durable retry retains the same copy identity. Local/sent attachment previews use the same viewer.

[NMA-069 evidence](../../docs/verification/nma-069/README.md) records native journeys, exact builds, the five-case real-domain API probe and external outcomes not exercised. No provider inference or live Composio authorization is inferred from the fixture. NMA-070/NMA-071 retain Computer/host and full integrated parity acceptance.

## NMA-068 workspace attachment and recovery

Use the same explicit loopback origin and private installation-token file as the read-only attachment. `NGERTIIN_RS_THREAD_ID` or `attachment.json`'s `thread_id` is optional for the workspace: persisted selection or the existing Tobi DM is used when it is absent. With explicit attachment configuration, no backend is spawned. The full contract must equal the pinned 1.31.0 definitions before writes are enabled.

Native state lives under `~/Library/Application Support/Ngertiin Rust Development/workspace`, separate from Tauri and gallery evidence. It contains private preferences/plain drafts, staged original bytes and the exact pending-operation journal; an exclusive profile lock prevents simultaneous writers. Once bound, a profile accepts a changed loopback port for the same owner and refuses another owner. Selection and recipient/model/billing state do not silently switch on retry. A lost acknowledgement is recovered by retrying the retained operation; native answer replies instead require authoritative status reconciliation. Projection checkpoints are memory-only, so reopening reads a new atomic snapshot and does not submit inference.

The focused state checks and remaining native/API acceptance are recorded in [NMA-068 evidence](../../docs/verification/nma-068/README.md). Contextual Settings/Library/Focus is implemented in NMA-069; NMA-070 adds live Computer and the native application host.

## NMA-070 native host and Computer

On first ordinary workspace launch, the host imports configuration paths from the existing private Tauri profile into its separate native `profile.json`, assigning a new manager UUID. `NGERTIIN_DESKTOP_HOME` may select the reference installation during this first import. The existing Tauri profile and backend data are never rewritten. A private explicit `attachment.json` or `NGERTIIN_RS_BACKEND_ORIGIN`/`NGERTIIN_RS_TOKEN_FILE` takes precedence and remains attach-only. `NGERTIIN_RS_PROFILE=<name>` selects an isolated native profile under `profiles/` using 1–64 letters, digits, hyphens or underscores.

The native supervisor attaches to a compatible live backend or starts one owned Bun child using the imported project/Bun/config paths. Tauri need not remain running after setup. It refuses incompatible or unresponsive live authorities and relies on the existing backend's independent authority lock. Only a child retained by this host can be stopped by Quit; a discovered service remains external even when a prior manager ID matches. Crashed owned backends get bounded recovery through the existing receipt/persistence rules.

Close hides the window. Show Workspace, Dock reopen and second-launch focus restore the same native workspace; closing or reopening never resubmits a message. Hide/minimize/close and best-effort sleep cleanup revoke tracked Computer tickets and release only this client's exact issued human revision. Show/wake reads authoritative state and obtains fresh tickets. Quit drains native cleanup and stops only owned backend services. It never stops, provisions or deletes the retained shared machine. Native profiles and window state remain private; a hashed socket in an owner-private short `/tmp/ngertiin-rs-<uid>` directory avoids macOS's Unix-socket path limit.

The native menu/tray exposes Show/Quit, editing, Zoom/Actual Size, fullscreen and reconciliation. Reload refreshes authoritative state while preserving drafts. Developer Tools opens native diagnostics; it grants no runtime-execution or filesystem bridge to embedded content. Original exports go to Downloads with atomic collision-safe creation and preserved bytes. External links accept HTTPS or loopback HTTP without URL credentials.

Computer retains the Tauri compact preview, shared-desktop dialog, controller status, Take/Return/Reconnect control and readonly policy. Both viewer bodies use the existing scoped Cua protocol. Native overlays, navigation and controls remain GPUI. Per-surface grants, bounded decoded-frame health, renewal/replacement and exact-revision handback are owned outside JavaScript. Static HTML keeps its separate no-script policy. `NGERTIIN_RS_DIAGNOSTICS=1` enables a private `computer-status.json` containing status/frame counters and public machine/lease metadata, without tokens or viewer URLs.

[Native host evidence](../../docs/verification/nma-070/README.md) records source pins, isolated host tests, retained-machine/native journeys and physical/platform limits. Tauri remains the active reference client; NMA-071 integrated parity and NMA-063/NMA-064 acceptance/installation remain separate.
