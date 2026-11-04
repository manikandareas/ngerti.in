# Electron development verification

Date: 2026-11-04. Target: macOS 26.3 ARM64. Electron 45.2.2, Electron Forge 8.0.1, Bun 1.3.10 and build Node 25.8.0. Backend consumer contract remains 1.30.0; no domain route/schema change was required.

## Icon and interaction update

The subsequent native audit, measured improvements, remaining first-open cost and updated application icon are recorded in [Desktop icon and interaction audit](ui-performance-2026-11-04.md). That report identifies the checks run against the newer build. Initial lifecycle cohort hashes below remain historical; [UI-SHA256SUMS](UI-SHA256SUMS) records the updated installed bundle.

## Cleanup verification

The final source cleanup separates icon generation and startup-page rendering from the Electron bootstrap, consolidates Quit handlers, and replaces the Markdown cache's JSON parsing round trip with typed reference projections. Generated application PNG, ICNS and tray PNG hashes are unchanged from the accepted icon. Four existing legacy connection files received formatting/import-order fixes so the repository root check passes.

- `bun run check`: lint/typechecks and **393 backend tests passed**.
- `bun test verification` in `apps/web-client`: **44 passed**, including real Markdown rendering and the modal avatar clock regression.
- Desktop typecheck/lint and **6 process/gateway tests passed**; web-client lint and build passed.
- Fresh-profile Electron source GUI: **3 passed, 1 skipped** (retained Computer configuration not selected).
- Fresh-profile packaged GUI: **2 passed, 2 skipped** (Vite is source-only; retained Computer configuration not selected).
- Frozen installation made no dependency changes. Package build passed. UI large-chunk and Vite script-tag warnings remain documented by their original/cleanup cohorts; deliberate renderer faults can abandon an event stream.
- Documentation validation retains the same **85 historical broken references (75 unique source/target pairs)**, with no additions relative to the captured pre-cleanup baseline. These reference retired source paths and are outside this cleanup slice.

Temporary profiling entrypoints and the CPU trace were removed. This cleanup's GUI runs use disposable profiles; the installed application and its user data were not replaced during cleanup. Historical native icon/performance observations remain attached to their original artifacts. [Cleanup receipt](cleanup.json), [current source/package hashes](CLEANUP-SHA256SUMS), [source GUI log](cleanup-source-e2e.log), and [packaged GUI log](cleanup-packaged-e2e.log) identify this final validation cohort.

## Initial lifecycle cohort results

| Layer | Final observed result |
| --- | --- |
| Backend regression | 393 passed, 0 failed across 43 files. Includes bootstrap/discovery/authority/restart coverage and existing cancellation, receipt, Goal/Routine and harness fixtures. |
| Desktop process/gateway tests | 6 passed, 0 failed; 29 assertions. Origin protection, binary upload, streaming before response completion, stable origin, private files/log redaction, owned/external processes, backend crash/recovery, startup interruption and revision-scoped human handback. |
| Source Electron GUI | 4 passed, 0 failed. Close/reopen, duplicate launch, renderer reload/crash, backend identity retention, pending-operation storage through full restart, Vite UI/HMR WebSocket and native Cua read-only viewer. |
| Packaged Electron GUI | 3 applicable cases passed; 1 Vite-only case intentionally skipped. Test profiles deliberately point at unavailable local Bun and source-checkout paths, proving packaged runtime/UI resource use. |
| Development launcher | Real Bun launcher reached readiness, served Vite HTML and shut down its owned backend cleanly on termination. Electron is placed in a separate process group so terminal signals do not bypass its managed shutdown. |
| Static checks | Desktop/server/web-client typechecks and scoped lint passed. Frozen workspace installation and whitespace checks passed. |
| Package privacy | Authored resources/ASAR were scanned for the existing installation token with no exact-value matches. Runtime payload excludes installation state and repository environment files. See the JSON denominator. |

The installed user application was opened through the normal macOS launch path. Its workspace loaded existing conversations from the selected development profile. No messages were submitted during this read-only check.

Source and packaged GUI tests use temporary profiles and fresh application data, with no provider credentials copied and zero fresh provider inference requests. The explicitly selected Computer test copies only private local Cua configuration into its temporary profile, opens a view-only ticket and closes that viewer on hide. It does not send mouse/keyboard input, import working files, reset the machine or create native provider sessions.

An isolated workspace screenshot was visually inspected. Production UI was reused rather than redesigned. Package tests exercise actual Electron processes; simulated suspend/resume signals exercise event handlers but are not a physical laptop sleep/wake test.

## Reproduce

```sh
bun install --frozen-lockfile
bun run test:server
bun run test:desktop
bun run typecheck:desktop
bun run lint:desktop
bun --filter @ngertiin/desktop test:e2e
bun run package:desktop
```

For the local native viewer case, set `NGERTIIN_TEST_MACHINE_STATE` to an existing configured installation directory when running the GUI suite. Without that explicit input, the native case is skipped. `NGERTIIN_PACKAGED_EXECUTABLE` selects a packaged executable for the same suite; Vite HMR is then inapplicable and skipped. The JSON summary records the executed native cohort, not the default skipped configuration.

Profile setup and the installed development app:

```sh
bun run setup:desktop
open "$HOME/Applications/Ngertiin Dev.app"
```

The source package remains at `apps/desktop/out/Ngertiin Dev-darwin-arm64/Ngertiin Dev.app`. User data remains outside either bundle.

## Iterations and proof boundaries

Earlier development attempts found and corrected the bundled preload path, explicit Electron binary installation, the test fixture's Bun lookup, frozen filtered runtime packaging and development-launcher process-group handling. Cold UI assertions allow startup/initial dependency compilation rather than assuming a five-second first launch. After an intentional renderer crash, Playwright retains a crashed CDP Page; recovery is verified through the replacement renderer's real DOM and a native capture. Final results do not claim first-attempt clean passes.

Intentional renderer/reload faults may produce `ERR_INCOMPLETE_CHUNKED_ENCODING` for the abandoned event stream. Development mode also reported a React script-tag warning while all workflow/HMR assertions passed; this report does not classify that warning as a proved historical baseline or repair it.

Not established by this cohort: physical sleep/wake, multi-hour soak, fresh subscription/login/inference or useful native model/tool round trips through Electron, native interactive takeover under Electron, other OS/architecture support, fresh-device installation, code signing/notarization, automatic updates, production readiness or NMA-063/NMA-064 completion. Existing provider/Cua evidence retains its original scope.

Machine-readable summary: [verification.json](verification.json). Captured source/package hashes: [SHA256SUMS](SHA256SUMS). Raw final GUI/process logs: [source](source-e2e.log), [packaged](packaged-e2e.log), [process/gateway](desktop-tests.log). Operational behavior: [architecture and setup](../../architecture/electron-development.md).

Captured logs retain their exact CLI output, including prefix whitespace on blank lines. [EVIDENCE-SHA256SUMS](EVIDENCE-SHA256SUMS) records their bytes; whitespace validation excludes only captured logs that contain this intentional formatting.
