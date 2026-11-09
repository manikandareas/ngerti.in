# NMA-071 integrated native completion — 2026-11-09

Status: **Done**. Completion follows the [owner's focused scope](../../development/nma-071-closure-scope-2026-11-09.md): comprehensive component implementation, useful native journeys, focused regression checks and a local macOS ARM64 development bundle. Muse API-key execution remains a separate follow-up.

The current Tauri desktop and web-client assistant-studio remain the reference. [Coverage](assistant-studio-coverage.json) maps **8 categories / 67 states** to production Rust paths; [reference hashes](completion-reference-hashes.json) identify the exact local source. All 67 are source-audited; they are not 67 separately executed native captures or a pixel-equality claim.

## Delivered UI and behavior

- Replies retain Markdown, code and tables inside one bubble. Bubble headings use body sizing. The later [conversation presentation amendment](conversation-layout-2026-11-09.md) makes tables fill the bubble's content width, replacing the original bounded 384px minimum. Sorting, filtering, selection, copy, download and Focus use the displayed data. Header, conversation and composer share available width.
- Assistant names are omitted from bubbles. Group portraits open member profiles. Loading/subtitles require the current thread; questions, ordinary queue/publication and normal handoff do not create redundant status bubbles.
- Context tabs are centered and proportionate. Hover uses solid shades. The desktop button is a compact full-width row; date dividers have vertical clearance. Compact navigation bounds its roster/footer without overlapping controls. Model selection uses available models, original provider marks and supported reasoning controls.
- Approval shows bounded, readable decision fields and decoded file text before Approve/Reject; command IDs and encoded text are hidden. Settled history removes decision controls. Multi-choice custom text is additional when the request permits multiple answers.
- Unconfirmed free-text replies lock Send/Steer/attachments and expose a status check; an ordinary message cannot bypass that response. Native preedit also blocks Send/Steer until composition commits. Actionable failures explain connection/model/billing problems and provide Settings; eligible adjacent Goal milestones use disclosure without hiding blocked events or Routine.
- The sidebar app-connection action routes to scoped Apps and dismisses the compact sheet. Settings retains its separate destination. Apps uses service tiles, title/status rows, compact actions, debounced search, a connected-only filter, catalog paging and scoped effect disclosure.

The earlier [report](prior-report-2026-11-08.md) retains the original ten requested corrections, historical test cohorts and live-discovered table parser/final-paint fixes. Exact prior binaries remain identified; subsequent checks do not retroactively rerun an earlier provider journey.

## Executed evidence

| Cohort | Result | Boundary |
| --- | --- | --- |
| Native workspace UI | **17/17 passed** | [Workspace tests](native-comprehensive-workspace-tests.log): DM/group rich replies, streaming, sort/filter/state, widths, tabs/focus, compact sheet, question navigation, approval fields, uncertainty lock, Goal batching and native preedit/commit. |
| Approval preview | **1/1 passed** | [Preview test](native-comprehensive-details-tests.log): Unicode, binary, invalid encoding and size bound. Included in the 18 unique focused cases above/below, not a full workspace rerun. |
| Final sidebar correction | **1/1 passed**, repeated affected case | [Navigation test](native-closure-navigation-tests.log): compact Apps and Settings actions close the sheet and reach their distinct destinations. This repeats one of the 17 cases after its final extension. |
| Strict compilation and rendering ownership | Passed | [Clippy](native-closure-clippy.log), [boundary check](native-comprehensive-boundaries.log). No React/Lexical application UI or TypeScript avatar runtime. |
| Real API native journeys | **16/16 observed cases passed**, plus final Apps catalog/search/filter observations | [Native proof](native-comprehensive-proof.json): 19 successful POST receipts; one excluded file-execution fixture setup attempt is separately recorded. The control transport is deterministic local harness code. |
| Real provider | Retained completed Codex inference, useful `ngertiin.read_run_context`, eight-model catalog and selected/effective subscription | [Provider proof](codex-current-provider-proof.json), [native rendering](native-streamed-render-proof.json), exact `1f9e281d` binary. No additional identical inference was run for these presentation/navigation changes. |
| Earlier native/browser regressions | Retained **78/78 native**, **54/54 browser** | [Native log](native-final-source-tests.log), [browser log](web-final-source-regressions.log), exact prior revision; current delta uses the focused checks above. |
| Final local app bundle | Resource/backend integrity and native navigation observation | [Manifest](delivery-manifest.json), [bundle probe](bundle-check.json), [runbook](runbook.md). Exact source hashes and macOS ARM64 development executable retained. |

The integrated native journey exercised Goal and Routine Pause → Resume → Stop, Unicode DM memory correction, app-owned skill read/disable, CSV Focus/filter/context submission, local source preview without upload, withheld committed upload acknowledgement, Quit/relaunch, identical retry, queued Edit/Delete, accepted queued Steer, confirmed Stop, group question and approval, private Library, profile navigation, unavailable Working files and light/dark provider Settings.

[Apps proof](native-apps-proof.json) confirms 20 catalog entries, the service-row layout, Gmail filtering and the empty connected-only inventory. No external authorization was attempted. The reviewed Apps binary is `9c263f2d`; final delivery differs only by a Clippy-equivalent conditional collapse. Final source/resource verification and bundled-backend boot passed at `e4f5b944`.

The upload used **two attempts / one operation key / one additional artifact / one linked message**. The composer and staged file survived relaunch, then cleared after admission. Stop intent is followed by a deterministic transport confirmation and authoritative cancelled state. The first attempt to execute previously queued CSV feedback had no working fixture machine driver and failed before native acceptance; it is retained as a setup limitation, not successful file reading. Plain-text control admission subsequently passed.

[Current approval](native-current-approval.jpg), [group Library](native-current-group-library.jpg) and [dark Settings](native-current-settings-dark.jpg) show the actual native app at binary `d2d07490`. Their data is disposable; no token or provider credential is retained.

## Reused unchanged journeys and limits

[NMA-069](../nma-069/README.md) supplies retained native Markdown/CSV/700-line source/static HTML/two-page PDF, nested Back, original-byte download, actual shared-machine tree, contextual rejection, skill versioning and scope evidence. [NMA-070](../nma-070/README.md) supplies retained native real viewer/takeover/input/handback, visibility cleanup, menu/editing/zoom, owned/external backend crash and lifecycle evidence. Those unchanged paths were inspected and are reused with their original source/conditions; they are not recounted as new current-binary runs.

The native input-handler test verifies preedit/commit against the actual textarea handler. Physical OS IME candidate UI, physical sleep/wake, timed native viewer rollover and abrupt termination during an external effect were not driven. Existing journal/owned-backend crash tests cover their recorded narrower conditions. Live Composio authorization and Muse inference are not inferred from fixture forms. The Apps native reference was additionally reviewed at its exact recorded binary. No unresolved material defect remains in the executed focused journeys.

The historical frozen matrix remains **0 / 3,684 configurations executed**. Exhaustive Cartesian screenshots and paired Tauri/native performance are no longer closure prerequisites under the owner's instruction. No material stall was observed in these journeys; comparative frame/latency/memory performance remains unmeasured. The retained [hidden-window measurement](hidden-native.json) has its original limited conditions; native superiority is not assumed.

Repository documentation has eight pre-existing broken imported GPUI skill links, with no affected documentation link errors. See [docs check](docs-check.log). The [difference register](differences.md), local backlog, specifications and acceptance scope agree. Private profiles, credentials, viewer tickets and journals remain excluded from retained artifacts and the bundle.

This is a local macOS ARM64 development delivery. Windows/Linux, fresh-device installation, signing/notarization/updating, product-wide NMA-063/NMA-064 and replacing the active Tauri host remain separate gates.
