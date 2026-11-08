# Acceptance and readiness gates

A document, source module or green fixture is not completed product acceptance. [The local backlog](../backlog/README.md) is the status authority; [product decisions](../product/feature-decisions.md) define required versus optional/deferred scope. Preserve captured evidence, failed iterations and explicit unknowns.

## Evidence to record

The [Desktop Rust plan](../architecture/desktop-rs-plan-2026-11-07.md) adds NMA-066–071 as a separate native parity sequence. NMA-066/NMA-067 are **Done** under the [2026-11-08 owner acceptance decision](nma-066-067-closure-2026-11-08.md): their implemented foundation/components are accepted and remaining technical verification is non-blocking. [Foundation](../verification/nma-066/README.md) and [component evidence](../verification/nma-067/README.md) retain actual pass/fail/inconclusive/unexecuted results; closure does not assert blanket native parity. NMA-068 is Done for the implemented native workspace/conversation with bounded native/API evidence; NMA-069 is Done for native contextual workflows with [bounded evidence](../verification/nma-069/README.md); NMA-070 is Done for native Computer/host lifecycle with [bounded evidence](../verification/nma-070/README.md); NMA-071 remains Backlog with its own integrated acceptance. NMA-071 covers integrated native parity and a local macOS ARM64 development bundle. NMA-063 product-wide real-API acceptance and NMA-064 fresh-device installation remain separate. Tauri remains the active reference host until an explicit replacement decision.

Native parity also requires a [rendering ownership audit](../architecture/desktop-rs-plan-2026-11-07.md#rendering-ownership-contract): the main UI, composer, avatar, panels, Settings, files and PDF controls/rendering must use Rust/GPUI/native adapters. Only HTML document content and scoped Computer viewing may instantiate WebViews. A web-client wrapper can match a screenshot while failing this architecture criterion; inspect the actual source, bundle and running native interaction path.

For each responsibility slice record source/module/commit, dependency/CLI/SDK/config versions, setup/command, planned/executed denominator, pass/fail/skip, observed output, unknown outcomes and limitations. Distinguish product decision, source observed, contract/fixture tested, native/live verified, API readiness, UI acceptance and distribution.

Provider login, model catalog, completed inference and a useful scoped product-tool round trip are different proof stages. Build/typecheck or static screenshots do not prove browser/native behavior. Backend milestones use HTTP/events/native clients or headless scripts; frontend acceptance uses real API state/events/receipts and actual desktop/mobile journeys.

## Engine/API gate — NMA-060

The original gate is Done under the accepted Codex ChatGPT subscription + explicitly selected Muse API-key billing configuration. Muse subscription remains unverified. A later contract change must establish its own affected acceptance before UI consumes it.

Required proof includes:

- All required backend dependencies, including NMA-065 creation/personalization, completed with explicit contract and operation ownership.
- Both required adapters: executable/minimum/tested versions, honest capabilities, effective billing and completed inference plus useful product tools through the application.
- Persistent Tobi/DM identity/history, queue/edit/delete/steer, contextual cancellation, native stop confirmation and recovery.
- Durable agent/group creation with random-name collision/concurrency, one visible human-owned automatic opener, defaults, retry/lost acknowledgement/reconnect/restart, failure recovery and scoped configuration updates. Reopening existing chat invokes no inference.
- Mixed-harness groups, semantic selected-member routing, handoff/review/HITL, author/mention integrity, membership/grant rechecks and DM privacy.
- Scoped memory and inherited/app-owned skills, with app writes restricted to app-owned packages.
- Automatic durable Goals, multiple responsibilities, Routine/offline-tab/quiet behavior, suitable completion evidence and stop Goal versus stop run.
- Useful files/artifacts/coding, sourced research, Composio and advertised visual input under capability constraints.
- Shared Cua machine tools and retained browser/desktop binding; view-only versus human input, lease transfer/revocation/expiry, file/process attribution, persistence, cancellation and unknown-effect reconciliation. Saved metadata stays scoped while working files/attachment copies are shared. Earlier browser-use/VNC acceptance covers only its original implementation.
- Concurrent scope/revocation, credential failures/redaction, crash/lost acknowledgement, replay/dedup and unknown effects. No silent billing fallback or legacy Hermes executor.

Initial evidence: [final API cohort](../verification/nma-060/final-cohort/README.md). Machine delta: [shared-machine report](../verification/shared-machine/README.md). The installed executable export and [consumer contract](../architecture/api-consumer-contract.md) establish the contract actually consumed.

## Product/UI gate — NMA-063

Status remains Backlog; NMA-060, NMA-061 and NMA-062 completion does not close it. Validate current API versions, including creation and subsequent machine/interaction deltas, against real backend receipts/events.

- Walk desktop/mobile conversation navigation: left agent/group/chat list, + creation, contextual Detail/Goals/Routine, Library, Computer, closable panels and a clear return path. Earlier File/Agent labels map to these surfaces.
- Exercise agent and group creation, single opener, personalization that can be skipped, scoped tool updates, duplicate submit, lost acknowledgement, restart, unavailable defaults and failed initial response.
- Use Codex/ChatGPT and Muse Code, including mixed groups. Only the selected member speaks; no pass bubbles, mass greetings, mandatory Goal activation or private profile rewrites.
- Exercise busy input/FIFO/edit/delete/steer/stop, current human questions/options/approval and failed-response Retry. Bind UI states to actual eligibility, revisions and receipts; unknown effects are not blindly repeated.
- Verify Goals/Routine/quiet continuation, files/artifact provenance, shared Computer viewing/takeover/recovery, sourced research, Composio and supported visual inputs. Scope/revoke and native skill ownership remain enforced.
- Include failure, limit, login/credential, capability, reconnect and restart cases. Record denominators, exact versions and skipped/unverified conditions. Do not infer readiness from screenshots or source availability.

The result establishes development product readiness only. A Tauri development app, local packaging or retained browser evidence does not complete distribution or production acceptance.

## Distribution — NMA-064

Start after NMA-063 is Done. Choose supported OS/package/installer based on actual development-runtime proof. A fresh local device must open the conversation UI, detect/connect a harness, complete DM/tool/Goal work and preserve identity/state across restart. Creation recovery must not repeat an opener or add a new onboarding wizard.

Document data/secret directories, process ownership, OS/support matrix, diagnostics, update and uninstall behavior using real tests. Binaries/containers do not automatically inherit host CLI/login. VPS is optional; remote enrollment, general native-client release and full access login/pairing are separate decisions. Normal upgrades preserve new-runtime user data; no old development-data migration is required.

## Done and maintenance

Mark Done only when scope, acceptance, dependencies and relevant gates are fulfilled with traceable evidence. Otherwise preserve the actual Backlog/In Progress/Review/Blocked state and a concrete remaining condition. Optional/deferred features are not hidden gates. Historical Done applies to its captured scope.

Write backend code, authored runtime text and technical instructions in English; preserve user content in its original language. Update the local milestone, backlog status/index and affected product/API guides together. Use [the local workflow](workflow.md) for ongoing work.
