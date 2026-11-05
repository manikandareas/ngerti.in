# Tauri development application

Date: 2026-11-05. Tauri is the sole desktop implementation following the user-authorized removal of Electron and the legacy `apps/web` workspace. This is a macOS ARM64 development application; it does not close NMA-063/NMA-064 or establish production distribution readiness. The Bun backend remains the sole application lifecycle authority.

## Run and build

From the repository root, with Bun 1.3.10, Rust stable (minimum 1.90), and Xcode Command Line Tools installed:

```sh
bun install --frozen-lockfile
bun run setup:desktop
bun run dev:desktop
```

The launcher locates Cargo on PATH or at `~/.cargo/bin/cargo`. It builds/stages assets, starts Vite, then launches the Rust host with UI HMR. Restart the command after Rust/backend changes. Run only one host per desktop profile.

To create the local application:

```sh
bun run package:desktop
open "apps/desktop/src-tauri/target/release/bundle/macos/Ngertiin Tauri.app"
```

The package includes the Rust host, target-specific Bun executable, existing backend source, required production dependencies, and built UI assets from `apps/web-client`. Staging uses `.dev/tauri-stage`. The filtered production dependency closure uses Bun’s hoisted layout and a materialized avatar workspace package so the bundle does not depend on hidden `.bun` directories or workspace directory symlinks. Packaging then starts the shipped Bun/backend with isolated temporary state and no credentials and checks authenticated readiness. No repository `.env`, credentials, installation database, machine state, or profile is bundled. The packaged application references external development state/configuration and existing Codex/Muse executables. It is not a fresh-device installer.

The default Tauri profile is `~/Library/Application Support/Ngertiin Tauri/profile.json`. Setup preserves existing profiles and references `.dev/harness-first` and `.env` by default. Its new manager UUID and stable UI port provide separate WKWebView storage. On macOS 14+, the UUID also identifies the native WebKit data store. An explicit absolute `NGERTIIN_DESKTOP_HOME` overrides the home for setup and launch; set `NGERTIIN_STATE_DIR` during setup to select separate backend data.

Plain Tauri text drafts survive a full Quit/relaunch. Files and pending upload/submission operations retain the existing IndexedDB mechanism. The TypeScript helpers in `apps/desktop/scripts/profile.ts` provide setup and tooling validation; the Rust host owns runtime profile validation and supervision.

Electron source, dependencies, scripts and tests have been removed. Its historical profile and any separately installed application are untouched; browser storage is not imported into WebKit. The retired implementation is available at Git revision `6de957e7145c0367a52b10f5fd19bbd91c50e458`. See the historical [Electron architecture](electron-development.md) and [original trial evidence](../verification/tauri-development/README.md) for their recorded scope.

## Runtime and lifecycle

The host owns one main WKWebView and an asynchronous Rust loopback gateway. Existing React screens, in-place Settings, Details/Library/Computer, API/event contracts, model/authentication semantics and product tools remain on their existing paths. No domain backend was rewritten in Rust.

| Action | Behavior |
| --- | --- |
| Launch | Authenticate and attach to a compatible discovered backend, or start one owned Bun backend. The backend authority lock remains independent. |
| Second launch | A private host lock prevents a second UI authority and requests focus at the saved origin. |
| Close / Hide / Minimize | Suspend UI presentation and avatar animation; retire projection events/polling; revoke this host’s viewer tickets and release only its exact current human-control revision. Backend work continues. |
| Reopen / Wake | Restore native visibility, read authoritative workspace state and reconnect events; do not resubmit prompts. |
| Reload | Keep backend alive, revoke prior viewer tickets, preserve stable-origin browser storage. |
| Backend exit | Bounded restart with backend receipt recovery. An unresponsive live authority is not replaced blindly. |
| Quit | Gracefully stop only owned services, with a bounded shutdown. An external backend is left alive. Goal/Routine definitions are retained. |
| OS sleep / forced exit | Sleep handback is best effort. Local work cannot execute during physical sleep; forced exit does not prove clean native cancellation. |

The existing retained Cua machine is started when configured, never provisioned, deleted or stopped by desktop Quit. Its viewer still uses the existing ticketed media protocol and separate media listener. No extra browser engine or noVNC viewer is introduced. The foreground lease is learned from authenticated `/v1/machine/view` responses, rather than trusting a renderer report. Native callbacks revoke tracked tickets even when JavaScript is suspended.

## Presentation changes

- One shared native/browser visibility subscription suspends avatars, workspace events and Computer polling/viewers while hidden. Resume reconciles authoritative state. WKWebView native visibility handles background-launch `document.hidden` behavior.
- Streaming interpolation is bounded to 60 ms; existing event projection batching remains 40 ms. Final/history/reduced-motion text bypasses interpolation. This is a scheduling bound, not a measured end-to-end latency guarantee.
- Text previews retain at most 128 KiB plus one detection byte and cancel the remaining response. Unsupported preview formats cancel their body. Full downloads retain their original bytes; raster previews still use the existing image path.
- Plain text drafts use persistent localStorage in addition to sessionStorage; attachment state retains its prior rules.

Historical Markdown memoization, event coalescing and avatar texture caching are reused. There is no React rewrite, new global state manager, or new per-token native IPC channel. Content-heavy first-open work remains a profiling opportunity.

## Native boundary

The gateway binds only to `127.0.0.1` at a saved UI port. It validates Host/Origin/fetch metadata, blocks path traversal, injects installation authentication in Rust, and streams HTTP/SSE/uploads/downloads with backpressure. Static responses include the existing restrictive CSP; Vite HMR is a development-only path. Missing WKWebView fetch metadata does not bypass exact-origin checks.

The renderer has no Tauri capability permissions, custom native commands, shell/filesystem grants, or generic native opener. Its frozen main-frame bridge supplies visibility only. Viewer iframes do not receive that bridge. External navigation is handled by the native host, and authenticated same-origin `/v1/` downloads and same-origin blob exports use native download handling. Native menus provide editing, zoom, full screen and development inspection without granting these operations to page content.

Profiles/configuration use private file validation and atomic writes. Logs use a bounded queue, 2 MB rotation, secret/key/Bearer redaction and bounded structured backend records. Unstructured or oversized backend records are omitted from the desktop log; backend persistence/receipts remain authoritative.

## Validation and remaining scope

See [verification and resource observations](../verification/tauri-development/README.md). Tested versions: Tauri core 2.12.5, CLI 2.12.4, Rust 1.99.1, Bun 1.3.10, macOS 26.3 ARM64 on an 8 GiB MacBookAir10,1. The current WK data-store implementation sets macOS 14 as its minimum.

Signing/notarization, update delivery, fresh-machine onboarding, Windows/Linux builds, a separate persistent background service, physical sleep/wake validation, and long-duration workload/animation benchmarks remain unverified. Native chat history/model discovery is not a new provider inference/billing proof. No ticket is marked Done by this local trial.
