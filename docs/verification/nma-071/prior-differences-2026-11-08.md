# NMA-071 surface coverage and difference register

The baseline is `apps/desktop-rs/verification/reference-v1/manifest.json`. This run uses the reviewed [2026-11-08 scope delta](../../development/nma-071-scope-2026-11-08.md), not an implicit replacement of that manifest. Capture dimensions, live fixture times and animation phases differ where recorded in `captures.json`; those observations cannot establish pixel equality.

| Surface family | Current cohort evidence | Remaining gate |
| --- | --- | --- |
| Workspace/sidebar | Integrated native DM/groups, compact sheet bounds/actions and context keyboard test | All default/overflow/loading/error/retry/resize/unread/portrait states across the frozen dimensions/scales/themes |
| Creation/composer/queue | Existing durable submission/journal tests; actual native Codex Send; native agent/group creation POST receipts; native question composer and atomic answer test; uncapped header-aligned conversation/composer bounds | Creation concurrency/failure/recovery and queue edit/delete/steer/concurrent Stop native API journeys; current IME, attachment/upload and exact-retry captures |
| Messages/chronology/Markdown/activity | Native/Tauri rich-reply observations, six-heading browser matrix, thread-scoped activity tests and idle/active groups | Full long/empty/failure/retry/stream-follow/reading-history/joined-bubble state matrix and selection/copy coverage |
| Interactions | Current single/multiple choice and native wizard tests; human and native lost-ack API proofs; Back/journal restoration | All approval/question/submitted/expired/resolved/retry visual pairs, including actual provider-native requests |
| Avatar | Existing compositor test and current web activity/identity regressions; one confirmed hidden native sample | Matched recipe/face/gaze/blink/phase captures and full 1/10/30-avatar performance comparison |
| Detail/Library/Goals/Routine | Current centered tabs/focus test; panel observations; prior NMA-069 retained slice | Complete integrated read/edit/conflict/pause/stop/scope/retry comparisons using current source |
| Memory/skills/apps/Settings | Existing native context/host implementation and prior NMA-069 tests | Current full native API journeys and state pairs; live app authorization is not inferred from fixture UI |
| Focus/files/tree/source/table/PDF/HTML | Zed-style native inline tables in one reply bubble, bounded 384px short-table minimum, actual sort/copy proof and native DM/group filter/selection tests; prior NMA-067/069 retained rendering and tree evidence | Current integrated nested Back/original download/long content/selection/format/security-state and complete bounded virtualization matrix |
| Computer/host | Compact button and activity presentation; current isolated attach/own/quit; prior NMA-070 retained real viewer/lease proof | Full current-state comparison, timed grant rollover/physical lifecycle cases and matched visible/hidden performance |

## Open differences

| ID | Severity | Reproduction / exact source | Outcome |
| --- | --- | --- | --- |
| P71-01 | Gate | Execute the baseline manifest's 307 states × 12 environment combinations | Open. Focused captures/tests are retained individually; the complete comparison denominator is not passed. |
| P71-02 | Gate | Run the agreed matching startup/stream/history/tree/source/table/PDF/avatar workloads from NMA-066 | Open. One correctly hidden 60s native CPU sample passed; other frame/latency/memory comparisons are unexecuted. |
| P71-04 | Visual/state coverage | Compare current group rich content and all assistant-studio tool/card variants, especially long nested content and failures | Open until actual matched states are reviewed. No blanket component parity claim follows from the DM rich-reply screenshot. |
| P71-05 | Gate | Native IME, current full integrated file/upload/recovery and contextual lifecycle matrix | Open. Unit/component/broker proof and earlier milestone observations retain their narrower boundaries. |
| P71-06 | Follow-up | Connect Muse through local Settings, then run the same API-key login/catalog/inference/tool/billing observations | Explicitly separate under the owner's decision; not a pass or an inferred Muse result. |

## Corrections closed by this cohort

| ID | Correction and retained result |
| --- | --- |
| P71-03 | Inline table headers now cycle ascending/descending/original order. Native DM/group tests cover filtering, state retention, cell/select-all copy and current action snapshots. The actual native [sorted capture](native-table-sorted-dark.jpg) and [clipboard proof](native-table-copy-proof.json) show `Beta,7` before `Alpha,42` and the same CSV in an unsent composer. |
| P71-07 | [Normal Finder startup](native-startup-proof.json) passed with retained and fresh isolated profiles, without resize, Reload or Show Workspace. Earlier background/occluded Connecting captures remain retained as failed observations. Both first-snapshot refresh trials were ineffective and removed. This closes the reproduced functional startup condition on this display; measured cold/warm performance remains P71-02. |
| P71-08 | [Native relaunch proof](native-width-geometry-proof.json) confirms the same 1680×931 viewport and origin across two quits, with a matching [relaunch capture](native-width-relaunch-light.jpg). Persisting viewport size removes repeated title-bar growth. This is one display/geometry case. |
| P71-09 | Live-introduced tables now update the Markdown parser configuration, and completion flushes incremental text layout to the authoritative final reply. Partial-header/code-fence regression assertions and [actual current-bundle Codex rendering](native-streamed-render-proof.json) confirm the wide native table, Unicode code and final paragraph without relaunch. Earlier provider runs exposed both failures; they are not counted as visual passes. |

Thread-global activity propagation, repeated visual assistant names, inherited oversized button/tab text, uncentered tab triggers, sidebar duplicate inset/overflow, low-opacity header hover, tall shared-desktop launch button, narrow date spacing, empty partial reply bubbles, unnecessary normal publication/handoff controls, duplicate free-text question inputs, single-answer payload shape, missing native Back/partial persistence and lost-ack draft cleanup were corrected. The retained tests/API receipts/captures in the [report](README.md) identify the level of evidence for each correction. Any newly observed material variance remains open until fixed or explicitly decided.

The initial [dark minimum sheet](native-sheet-dark-initial.jpg) shows the long-roster footer below the window. The corrected [light sheet](native-sheet-light.jpg) retains footer actions inside the viewport. The new native regression uses 32 conversations and checks the viewport boundary as well as the sheet boundary. Question history also now retains native request order instead of sorting question IDs alphabetically; the updated GPUI test uses the actual submitted broker record.
