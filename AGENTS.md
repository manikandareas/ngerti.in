# Ngertiin repository guidance

Ngertiin is a persistent agent workspace with private DMs, groups, automatic Goals and Routine. The implemented baseline is single-owner; the planned central-server organization model is defined below. The repository is the authority for product decisions, scope, acceptance and delivery status. Explicit user instructions take precedence; record resulting scope changes locally.

## Read for the task

- Product/runtime design or implementation: read [PRODUCT.md](PRODUCT.md), the relevant [feature decisions](docs/product/feature-decisions.md), [architecture](docs/architecture/overview.md), and the applicable local API guide.
- PostgreSQL, authentication, organization/Workgroup access, personal/Team agents, or remote clients: read [the server-organizations plan](docs/architecture/server-organizations-plan-2026-11-12.md) and NMA-072–083. Focus implementation on web-client/Tauri; desktop-rs work is paused, with historical evidence retained.
- A named milestone: read its file in [the local backlog](docs/backlog/README.md), including acceptance and `Depends on`. NMA-051 is deferred; historical milestones are not an active queue.
- Readiness or completion claims: use [acceptance gates](docs/development/acceptance.md) and the relevant retained evidence. [The local workflow](docs/development/workflow.md) owns status and documentation maintenance.
- Machine changes: read [the shared-machine trust/implementation plan](docs/architecture/shared-machine-cua-plan-2026-11-04.md) and [setup/native evidence](docs/verification/shared-machine/README.md). Desktop-host changes use [Tauri development](docs/architecture/tauri-development.md).

Keep detailed policy in these documents; update the affected local specification, milestone/checklist, backlog status and evidence together when behavior or decisions change. Research, old planning text and historical Done apply only to their captured scope.

## Runtime and product invariants

- Ngertiin owns one application lifecycle: identity, admission, queue, persistence, events, scheduling, cancellation intent and recovery decisions. Harnesses own their inner model/tool loops; adapters own protocol/process/capability/native-session binding.
- Required harnesses are Codex/ChatGPT App Server and Muse Code SDK/MSP. ACP is an optional transport. Additional runtimes and Hermes remain deferred; the active application has no legacy fallback.
- Authentication and effective billing are separate. Use only the selected connection and never silently switch subscription to API-key billing. Muse API-key billing is the accepted current gate scope; Muse subscription remains unverified.
- Product tools derive server-validated owner/agent/thread/run/binding scope and recheck current grants/membership/capabilities before dispatch. Reconcile unknown external effects before replay. Stop intent differs from confirmed native stop.
- Agent identity is persistent across DM/group use; native session, transcript, private memory and saved-artifact metadata retain their scope. Only the selected group member answers. Keep prompts, commands, raw observations and technical handoff instructions private.
- Goals capture durable responsibility or explicit tracking, not every request or multi-step run. Routine covers schedules/checks and may have no Goal. Stop run differs from stopping a responsibility and its continuation. Do not introduce a universal approval or initiative restriction without an agreed need.
- The single-owner baseline shares one retained Cua Linux desktop. The organization plan requires separate execution domains across users/organizations before claiming multi-user privacy; folder prefixes on a common sudo-capable OS are insufficient. Within one human's authorized domain, agents may cooperate, with one foreground input lease and concurrent terminal processes. Private backend records retain their own scope.
- Composio supplies app connections. App-owned and inherited harness skills remain separate; agents only create/repair app-owned packages. Tauri is the sole macOS ARM64 development host; fresh-device distribution and other platforms remain separate.
- Optional/deferred features require an explicit scope decision before becoming implementation commitments. Upstream source availability does not expand scope.

## Delivery, data and evidence

Engine/backend precedes the NMA-060 API gate, followed by UI and NMA-063 product acceptance, then NMA-064 installation. Check current local status; later API deltas require affected verification before UI consumption. A development bundle or completed API gate does not imply installation or production readiness.

Use HTTP/events/native clients or headless probes for backend proof; use real API desktop/mobile journeys for UI acceptance. Record exact source/config/versions, setup, denominator, pass/fail/skip, unknowns and limitations. Distinguish login, catalog discovery, completed inference and useful product-tool execution.

Openbot is the primary application-flow source reference. Follow [source adoption](docs/development/source-adoption.md): record exact module/revision, reuse reasons, local adaptation, dependency pin and upgrade checks. License administration is handled separately by the user; preserve provenance.

Historical development data may be reset within the authorized scope without an old-data migration. Preserve unrelated work, credentials and retained evidence. New-runtime persistence/recovery/isolation remain mandatory. Rollback uses Git and verified backups. A commit request authorizes a scoped local commit, not push or deployment.

## Engine and backend language

Write all engine/backend code and authored technical/runtime text in English: names, API fields and bodies, errors, logs, comments, docstrings and agent prompts/instructions. Preserve user content and imported user decision text in its original language.

## Code discovery

Prefer available knowledge-graph MCP tools in this order: `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`. Use `rg` for literals/configuration/non-code or when graph tools are unavailable or insufficient.
