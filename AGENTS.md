# Ngertiin repository guidance

Ngertiin is a persistent agent workspace with authenticated accounts, organizations, private DMs, groups, automatic Goals and Routine. Implement the user's current scope in `apps/server`, `apps/web-client` and `apps/desktop` (Tauri). Explicit user instructions take precedence.

## Development loop

1. Inspect the working tree and the affected implementation, then make the concrete change. Read only the documentation needed to resolve a relevant product, API or architecture question.
2. Verify the changed behavior directly. For UI work, use computer use in the running browser or Tauri app and exercise the affected flow against the real API. For backend work, use focused API/event requests or a native probe. Fix observed failures and repeat the affected flow.
3. Add focused automated checks when they resolve a concrete uncertainty. Choose full suites, builds or new tests only when the change, an observed failure or the user request warrants them. Stop verification once the affected behavior is established.
4. Report the implementation, the observed verification result and any remaining limitation briefly in chat. Keep routine iteration results in that response.

Update documentation only when requested or when a public contract or lasting product decision changes; edit the directly affected guide. Milestone status synchronization, formal evidence reports and [acceptance gates](docs/development/acceptance.md) apply to explicitly requested milestone closure, readiness audits or releases. Routine implementation finishes without that administrative work or a documentation check.

Use a named [milestone](docs/backlog/README.md) for its requested scope and acceptance criteria. Questions and audits remain read-only unless implementation or saving is requested. Product context is in [PRODUCT.md](PRODUCT.md); harness changes use the [ACP guide](docs/architecture/acp-harnesses.md), access/isolation changes use the [organization plan](docs/architecture/server-organizations-plan-2026-11-12.md), and desktop-host changes use [Tauri development](docs/architecture/tauri-development.md). Historical records describe their captured scope.

## Runtime and product invariants

- Ngertiin owns one application lifecycle: identity, admission, queue, persistence, events, scheduling, cancellation intent and recovery decisions. Harnesses own their inner model/tool loops; adapters own protocol/process/capability/native-session binding.
- Codex/ChatGPT, Claude, OpenCode and Pi use ACP. Muse Code retains SDK/MSP. The ACP migration records each profile's native verification scope. Additional runtimes and Hermes remain deferred; the active application has no legacy fallback.
- Authentication and effective billing are separate. Use only the selected connection and never silently switch subscription to API-key billing. Muse API-key billing is the accepted current gate scope; Muse subscription remains unverified.
- Product tools derive server-validated owner/agent/thread/run/binding scope and recheck current grants/membership/capabilities before dispatch. Reconcile unknown external effects before replay. Stop intent differs from confirmed native stop.
- Agent identity is persistent across DM/group use; native session, transcript, private memory and saved-artifact metadata retain their scope. Only the selected group member answers. Keep prompts, commands, raw observations and technical handoff instructions private.
- Goals capture durable responsibility or explicit tracking, not every request or multi-step run. Routine covers schedules/checks and may have no Goal. Stop run differs from stopping a responsibility and its continuation. Do not introduce a universal approval or initiative restriction without an agreed need.
- The single-owner baseline shares one retained Cua Linux desktop. The organization plan requires separate execution domains across users/organizations before claiming multi-user privacy; folder prefixes on a common sudo-capable OS are insufficient. Within one human's authorized domain, agents may cooperate, with one foreground input lease and concurrent terminal processes. Private backend records retain their own scope.
- Authentication always uses verified accounts; development supplies a private persistent secret and local email inbox. Tauri is an account client; the development launcher owns local server processes. See [authentication](docs/architecture/user-authentication.md) and [desktop lifecycle](docs/architecture/tauri-development.md).
- Composio supplies app connections. App-owned and inherited harness skills remain separate; agents only create/repair app-owned packages. Tauri is the sole macOS ARM64 development host; fresh-device distribution and other platforms remain separate.
- Optional/deferred features require an explicit scope decision before becoming implementation commitments. Upstream source availability does not expand scope.

## Delivery and data

Openbot is the primary application-flow source reference. Preserve provenance when adopting external source or dependencies; consult [source adoption](docs/development/source-adoption.md) for the dependency being changed. License administration is handled separately by the user.

Historical development data may be reset within the authorized scope without an old-data migration. Preserve unrelated work, credentials and retained evidence. New-runtime persistence/recovery/isolation remain mandatory. Rollback uses Git and verified backups. A commit request authorizes a scoped local commit, not push or deployment.

## Engine and backend language

Write all engine/backend code and authored technical/runtime text in English: names, API fields and bodies, errors, logs, comments, docstrings and agent prompts/instructions. Preserve user content and imported user decision text in its original language.

## Code discovery

Prefer available knowledge-graph MCP tools in this order: `search_graph`, `trace_path`, `get_code_snippet`, `query_graph`, `get_architecture`. Use `rg` for literals/configuration/non-code or when graph tools are unavailable or insufficient.
