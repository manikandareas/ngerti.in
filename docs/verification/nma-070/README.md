# NMA-070 native host and Computer verification

Completed on 2026-11-08 for the [NMA-070](../../backlog/NMA-070.md) native Computer, host and lifecycle scope on macOS ARM64. The current Tauri desktop was opened as the visual and interaction reference. Compact preview, shared-desktop dialog, controller wording, takeover/handback, native overlays and application lifecycle are implemented in the Rust client. Tauri remains the active reference host; NMA-071 integrated parity and NMA-063/NMA-064 acceptance/distribution remain separate.

## Source and ownership

The implementation adapts `apps/desktop/src-tauri/src/supervisor.rs`, `profile.rs`, `log.rs` and the commands/lifecycle policy in `host.rs` at repository revision `d01b3cf9d9a3e5cf78732d9b626fd00f3f11a6f2`. The native client uses its own profile, manager identity, lock, focus socket, window state and diagnostics. Existing backend state is referenced, never copied or reset. Only an actual retained child is owned; a discovered backend remains external even when its manager identifier matches a prior native host.

`apps/web-client/src/features/conversation/components/machine-section.tsx`, `machine-viewer.tsx` and `lib/computer-view-session.ts` at the same revision supply the Computer workflow and wording. The preview, dialog, takeover controls, errors, navigation and focus are Rust/GPUI. Only ticket-scoped Cua viewer content and isolated static HTML documents instantiate WebViews, through `platform/embedded.rs`.

Pins: GPUI Kit/GPUI WebView 0.9.0, lb-wry 0.53.3, tray-icon 0.25.1, consumer contract 1.31.0; the lockfile pins the remaining dependency closure. The retained machine reports spacesd 0.8.0 and Driver 1. The client neither provisions nor deletes the retained machine, and Quit never stops it.

The native transport alone holds the installation credential. Embedded viewer content receives its current scoped capability URL. Main-frame navigation, IPC source URL, viewer identity, status and bounded health payload are checked at the native seam; the IPC accepts media-health reports only. Static document JavaScript/navigation/download restrictions remain independent. No shell, filesystem or generic native invocation API is exposed to either surface.

## Build and reproducibility

[Platform](platform.json): macOS 26.3 ARM64, Rust 1.99.1, Bun 1.3.10. The unsigned development bundle is `apps/desktop-rs/dist/Ngertiin Rust Development.app`. The [delivery manifest](delivery-build-manifest.json) records all 1,460 build inputs and the executable SHA-256 `055631806390d953800996429a88b7efc23d2f4602b12b08edb1d4b1c12115c6`. All recorded input hashes matched the final source/assets after verification. [Closure checks](closure-checks.json) retain the final denominators and continuity checks; [artifact integrity](integrity.json) hashes the retained evidence files.

Native journeys used an ignored proof bundle with the identical executable/assets, a distinct bundle identifier and a launcher setting `NGERTIIN_RS_PROFILE=nma070-proof` and `NGERTIIN_RS_DIAGNOSTICS=1`. This references the existing installation through an isolated private native profile. The earlier [manifest](build-manifest.json) identifies the build used for the first journeys; the final delivery build additionally fixes AppKit child-view visibility after Minimize/Show. Delivery-prefixed observations below use the final executable. The default native profile, Tauri configuration, credentials and backend data were not reset.

From the repository root:

```sh
bun run check:desktop-rs
bun apps/desktop-rs/scripts/cargo.ts test --locked -p ngertiin-desktop host::
bun --cwd apps/desktop-rs bundle:dev
bun apps/desktop-rs/verification/nma-070/viewer-api.ts
bun apps/desktop-rs/verification/nma-070/checkpoint.ts observation-label nma070-proof
bun run docs:check
```

The retained-machine scripts require the existing private `.dev/harness-first` installation/runtime files. They export public observations, counts and hashes, never installation credentials or viewer capability URLs. `checkpoint.ts` reads a last-written native diagnostic file; its `native` field is a saved observation, not proof that a process is still running after Quit. The `machine` field is freshly fetched from the authenticated backend for each checkpoint.

## Automated and API results

| Check | Executed / passed | Evidence and boundary |
| --- | --- | --- |
| Dependency/rendering ownership, formatting, strict all-target Clippy and workspace tests | 58 / 58 tests; checks passed | [Full check](desktop-check.log): 8 avatar, 3 client, 12 read-only transport, 1 worker and 34 desktop tests. This completed before the final visibility adapter correction. |
| Final delivery formatting and strict all-target Clippy | Passed | [Formatting](format-delivery.log), [Clippy](clippy-delivery.log); the changed prepaint adapter was then reproduced in the actual native app. |
| Disposable real-Bun host and native state tests | 9 / 9 | [Host tests](host-tests.log): concurrent start, actual owned crash/restart/data retention, child-only stop, external and same-manager external attachment, incompatible live authority, missing discovery with a held backend authority lock, shutdown during startup, private/symlink/instance fencing, redaction/URL policy and exact-revision cleanup. Some cases contain multiple assertions. No retained installation was terminated. |
| Original downloads | 1 / 1, included in the 58 | Original-byte equality, sanitized filename and create-new collision behavior; no existing file is overwritten. |
| Current retained-machine ticket lifecycle | 8 / 8 | [API result](viewer-api.json): readonly grant, HTML 200, no installation token in HTML, renewal 200, revoke 200, retired HTML/renewal 401 and unauthenticated machine 401. Machine identity and lease remain unchanged. This is API renewal evidence, not a ten-minute native rollover observation. |
| Development bundle | Passed | [Bundle log](bundle.log), final source/input/binary hashes. Unsigned local bundle only. |
| Verification-script formatting/lint | 2 / 2 files | [Biome](biome.log), using the repository Biome configuration with a temporary include for the normally excluded verification directory. |
| Repository documentation | Baseline failure unchanged | [Docs check](docs-check.log): eight existing broken links in imported GPUI skill references. No changed product/backlog/evidence link or milestone consistency error. These unrelated skill files are unchanged. |

The host suite also checks both cleanup outcomes: release the exact human revision issued to this client, and preserve a newer human lease. The workspace's existing durable-journal restart/acknowledgement tests passed in the full check. Computer command intents reconcile against current operation receipts instead of blindly replaying a mutation after a lost acknowledgement; an actual OS kill during that acknowledgement window was not induced.

## Native reference and journeys

The compact/expanded reference captures are [Tauri compact](tauri-compact.png) and [Tauri shared desktop](tauri-expanded.png). Native captures show the corresponding [light compact preview](native-compact-light.png), [final dark compact preview](delivery-compact-dark.png) and [final expanded desktop after Minimize/Show](delivery-minimize-show.png). The same original Computer icon, theme tokens, text, black media canvas, rounded viewer, native status/actions and compact-to-dialog workflow are retained. Different capture window sizes and native rendering are not a pixel-equality measurement.

Twelve native journey cases were executed and passed on the reference OS. Three additional observation categories below were not executed; they are not counted as passes.

| Case | Observed outcome | Evidence |
| --- | --- | --- |
| Compact preview in light and dark | Actual changing retained-machine frames; native read-only preview and View desktop affordance | Compact screenshots above; [final accessibility tree](delivery-accessibility.txt); [delivery handback](delivery-handback.json) has compact `frames_decoded: 3`. |
| Expanded desktop and native controls | Actual decoded frames; native dialog/status/Take control/Close remains outside the media view | [Expanded](native-expanded-dark.png), [final expanded](delivery-minimize-show.png). |
| Human takeover, keyboard/pointer input and handback | Confirmed human revision 21, release to 22; final build confirms human 25 with 91 decoded frames and release to 26. A harmless address-field edit was visible; the browser was returned to local `about:blank`. No search or message was submitted. | [Takeover](after-takeover.json), [handback](after-return-control.json), [input](native-interactive-input.png), [delivery interactive](delivery-interactive.json), [delivery handback](delivery-handback.json). |
| Read-only input rejection | After handback, attempted remote address selection/typing did not replace the prior `x` address edit | [Read-only rejection](native-readonly-input-rejected.png), separate from the API readonly grant checks. |
| Hide while holding control, then Show | Human revision 23 became none/24 while hidden; Show reconnected with fresh readonly media and retained draft | [Before Hide](before-hide.json), [after Hide](after-hide.json), [after Show](after-show.json). |
| Close and Show Workspace | Close hid the native window without ending the external backend; Show returned to the same workspace/draft | [After Close](after-native-close.json), [Show](native-show-workspace-draft.png). The early Show capture precedes the authoritative refresh; later checkpoints establish readiness. |
| Minimize and Show | Final build restores the expanded viewer with no compact child WebView reappearing above it | [Delivery capture](delivery-minimize-show.png), [checkpoint](delivery-after-minimize-show.json). |
| Native Edit/clipboard and Reload | Select All/copy/paste/undo restored the exact local draft; Reload preserved it and reconciled without sending | [Reload/draft](native-reload-draft.png), final accessibility tree; draft `NMA-070 local draft — do not send`. |
| Zoom, Actual Size and fullscreen | Native menu zoom changed UI scale, Actual Size restored it, fullscreen entered/exited. The final View menu has one OS fullscreen item. | [Zoom](native-zoom-in.png), [fullscreen](native-fullscreen.png). |
| Native diagnostics overlay | Developer Tools opened a native dialog, suspended/revoked viewer surfaces and returned through Escape; no embedded runtime bridge | [Diagnostics](native-diagnostics.png), native source seam. |
| Quit and relaunch | Draft, selection and on-screen bounds restored; supervisor attached to the same external backend | [Relaunch](delivery-relaunch.json), [window geometry](native-window.json), [redacted supervisor log](native-desktop-rs.log). |
| Final Quit and backend/machine continuity | Proof process exited. The authenticated backend still served the same instance/PID, machine was ready and human lease was none/26 | [After Quit](delivery-after-quit.json), compared with [before native journey](before-final-native.json). |

The live backend remained PID 51336 / instance `2eb5d445-156d-4236-89aa-bf3e232e15b6`. Before and after the native journey, entity counts were **174 runs, 355 messages, 9 Goals and 7 Routine**. These checks establish that navigation, Reload, visibility and Quit did not admit another inference or change those retained definitions. They are not a fresh provider-inference or billing test. The retained machine stayed generation 1 and ready; no provision/delete/stop was requested. The host may start the already-configured retained Docker Compose project, matching the reference startup policy.

The three unexecuted observation categories are direct status-bar tray clicking (tray construction and its shared Show/Quit action targets were exercised through startup/native menus), physical sleep/wake, and a timed native ticket-expiry/renewal rollover. Sleep/wake callbacks use the same native ticket registry cleanup as Hide/Close, independently of page JavaScript; the actual physical transition is not inferred. API renewal/revocation and fresh readonly views after visibility changes were observed separately.

## Failures corrected and retained limits

- A development bundle attempt refused publication because source changed during compilation; [the failed log](bundle-source-changed.log) is retained. A later frozen build produced the delivery manifest.
- The initial long-profile launch exceeded macOS's Unix-socket path limit. The instance socket now uses a profile hash in an owner-private short runtime directory; the long-profile native launch and instance test passed.
- A control request could cancel a pending read and leave the Computer poll blocked. Read and control tasks now have separate owners; actual Take/Return control passed afterward.
- The dark theme's generic inverse token made the media canvas white. Computer now has a black semantic canvas in both themes, with native layer clipping at the same relative corner radius.
- AppKit could reshow a covered compact child view after Minimize/Show. The adapter now reasserts surface visibility during native prepaint; the delivery capture verifies the correction.

Only the static-document and scoped Computer constructors in `platform/embedded.rs` build WebViews. `scripts/check-boundaries.ts` passed; source inspection also confirmed no React/web-client application shell is loaded by the native workspace. Computer health messages are bounded to 512 bytes, current main-frame origin/path and viewer ID, with a fixed status vocabulary and nonnegative decoded-frame count. Downloads/new windows are denied in both browser surfaces. HTML documents additionally disable JavaScript and allow only their local document navigation.

Abrupt OS termination during a control acknowledgement, physical power/sleep transitions, timed native grant expiry, direct tray interaction, Windows/Linux, fresh-device installation, signing/notarization/update delivery and new provider inference are unexecuted. Consent/question controls retain the existing native, revision-bound NMA-068 path; this journey did not manufacture a live pending consent request. Full-application visual/control parity across every state belongs to NMA-071. No result from those categories is inferred from compilation, this bounded macOS journey or prior milestones.

## Local cleanup and commit preparation

On 2026-11-08 the stopped, duplicate proof bundle and temporary NMA-070 diagnostic/compiler/Biome files under `.dev/` were removed after verifying the retained evidence hashes and final delivery executable. The main development bundle, compilation cache, private native profiles, installation credentials and backend/machine state were preserved. The checkpoint helper now hashes the retained development bundle rather than depending on the disposable proof copy. This changes verification setup only; the 1,460 application build inputs and delivery executable remain identical to the native journey build. Commit-preparation checks are retained in [cleanup checks](cleanup-checks.json).

The [later cleanup checkpoint](cleanup-after-quit.json) records 176 runs and 359 messages on the still-running backend, with 9 Goals, 7 Routine, the machine ready and lease none/26. Those later totals are not the denominator for the earlier native journey's 174/355 comparison. Cleanup issued read-only API requests; it did not reset retained activity or infer a new provider outcome from these totals.

Original `desktop-check.log`, `host-tests.log` and `tests-initial.log` bytes retain their terminal blank line. Their SHA-256 hashes were verified before staging; only these three immutable logs are excluded from the ordinary Git whitespace check. All remaining staged paths pass that check.
