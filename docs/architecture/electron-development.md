# Electron development application

Date: 2026-11-04. The user selected Electron after the Electrobun readiness review and authorized implementation. This is a macOS ARM64 development host, not production distribution or completion of NMA-063/NMA-064. Ngertiin remains the sole application lifecycle authority.

> Default desktop commands now launch the [Tauri development application](tauri-development.md). This document records the retained Electron baseline. Use the explicit `dev:electron`, `build:electron` and `package:electron` scripts in `apps/desktop` for comparison.

## Start and package

From the repository root:

```sh
bun install --frozen-lockfile
bun --filter @ngertiin/desktop dev:electron
```

The historical Electron setup created a private profile at `~/Library/Application Support/Ngertiin Dev/profile.json`. It references the current development state (`.dev/harness-first` by default), the repository environment file and absolute executable paths. It does not copy provider credentials, reset data, or replace an existing profile. An existing retained development Muse binary is selected if available and no explicit executable is configured. Harness capability/version checks remain in the backend.

To create the locally runnable application:

```sh
bun --filter @ngertiin/desktop package:electron
open "apps/desktop/out/Ngertiin Dev-darwin-arm64/Ngertiin Dev.app"
```

The build installs the exact pinned Electron binary if it is absent, compiles main/preload, builds the existing web client, and packages Electron, the Bun runtime, server source/resources, and only the backend production dependency closure. Workspace manifests and the repository lockfile are used with a frozen filtered installation. No repository `.env`, installation database, connection directory, runtime record, or desktop profile is copied into the bundle. Native modules and the PDF extraction subprocess retain their source-relative layout outside ASAR.

The packaged app uses its bundled Bun and backend/UI resources. The referenced development state and environment file remain external. Finder launches do not require an inherited terminal PATH. The UI development server is only used by `dev:desktop`; UI hot reload leaves backend runs intact. Changes to the Electron host or backend require a controlled quit/restart of the development launcher.

For an isolated profile, set both `NGERTIIN_DESKTOP_HOME` and `NGERTIIN_STATE_DIR` before setup. Keep `NGERTIIN_DESKTOP_HOME` set when launching that profile. The default profile is shared by source and packaged launches, including Chromium storage and its saved UI port. Do not run two desktop modes for the same profile concurrently; the second launch focuses the first.

## Lifecycle

| Action | Behavior |
| --- | --- |
| Open | Authenticate and attach to a compatible existing backend, or start an owned backend on an ephemeral API port. |
| Second launch | Electron's single-instance lock focuses the first window. The Store authority lock separately protects installation data. |
| Close window / hide | Keep the desktop host/backend alive. Close the desktop's viewer and release only the human-control revision reported by this desktop. |
| Reopen | Restore the window and reconnect projections/events. No new user prompt is submitted. |
| UI reload / renderer crash | Keep the backend alive; reload the UI. Pending operations remain under the same origin and Chromium profile. |
| Backend crash | Bounded supervisor restart; application recovery reconciles native receipts and unknown effects. The supervisor never resubmits prompts. |
| Quit / Cmd-Q | Request cancellation and shutdown through the backend for owned services; preserve Goal/Routine definitions. An externally managed backend is left running. |
| Sleep / resume | Best-effort viewer handback on suspend and health/reconnect on resume. The machine cannot execute local work while physically asleep. |
| Forced exit / host shutdown | Recovery treats this as an unclean interruption. Clean cancellation is not claimed without a native receipt. |

The retained Cua machine is not stopped or deleted by desktop Quit. Startup may run Docker Compose `start` for the configured project, which does not recreate containers or import files. Initial provisioning still uses `bun run setup:machine`; migration/import is an explicit separate operation. Missing Docker/machine capabilities leave the conversation workspace usable with Computer unavailable.

## Implementation

- `apps/desktop/src/main.ts`: native window, tray, menus, visibility/power events, permission policy and asynchronous Quit.
- `profile.ts`: private profile validation, runtime environment and executable lookup.
- `supervisor.ts`: backend discovery, ownership, authenticated readiness, restart policy, human handback and shutdown.
- `gateway.ts`: stable loopback origin, streaming API bridge, built assets/Vite and HMR forwarding.
- `startup.ts`: startup/reconnect page and retry polling script served by the gateway.
- `preload.ts`: a main-frame-only visibility subscription and validated viewer revision reporting. No generic filesystem, process, shell or raw IPC interface is exposed.
- `apps/desktop/scripts/generate-icons.ts`: application/Retina and monochrome tray icon generation, separate from main/preload compilation.
- `apps/server/src/main.ts`: reusable `startApplication().stop()` bootstrap while retaining CLI operation.
- `apps/server/src/runtime-record.ts`: private atomic discovery record. It does not replace the database authority lock or domain persistence.

`runtime.json` records an instance identity, PID, owner identity, loopback endpoint, contract version and desktop manager identity. Discovery requires the installation token and a compatible authenticated readiness response. Quit revalidates the saved identity before signaling an adopted owned process. A live unresponsive authority is not automatically replaced. A legacy manually launched API can be attached at the configured `NGERTIIN_API_URL` or the default loopback port 8000 after successful authentication.

The UI gateway port is saved once, preserving localStorage drafts and exact durable-operation keys through full restarts. A port conflict is an explicit startup failure; the app does not kill its occupant or silently change origins.

The backend still uses API contract 1.30.0. No domain route/schema change was needed: desktop discovery is private installation metadata, and readiness uses the existing authenticated endpoint. Backend/bootstrap verification preceded Electron UI verification.

## Local trust and security

Electron renderer settings enable sandbox/context isolation and disable Node integration and webview tags. Gateway traffic binds to loopback, validates Host/Origin/fetch-site, and injects the installation bearer token on the host. Streams and request bodies are piped without whole-body buffering. The packaged UI has a restrictive CSP. New windows are denied; allowed external HTTP(S) links open in the system browser, with HTTP restricted to loopback. Untrusted previews do not receive a native bridge.

Only a message from the current main frame at the gateway origin can report a Computer revision. Handback checks that the backend still has that exact active human revision, avoiding release of unrelated or newer control. Ambiguous handback does not manufacture success; normal backend fencing/expiry/reconciliation still applies.

The private profile directory is 0700, JSON records are 0600 and atomically replaced, and logs rotate with secret redaction. This is a same-user local development trust model, not an adversarial isolation claim against software running as the owner.

## Verification and limits

See [desktop evidence](../verification/electron-development/README.md). Production signing/notarization, auto-update, fresh-device distribution, other OS targets, and an independently installed background service remain later work. Existing web acceptance and provider/billing evidence retain their original scope. No framework migration, implicit provider billing fallback or new global approval flow is introduced.
