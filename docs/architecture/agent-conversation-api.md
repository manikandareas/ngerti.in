# Persistent agents and conversation API

NMA-079 amendment: the [2.0.0 server-organizations consumer contract](server-organizations-api.md) and [verification report](../verification/nma-079/README.md) own current account-mode authentication, scope, normal native dispatch and readiness. Earlier versioned examples and pending-gate statements below retain their captured scope. Web/Tauri UI and deployment remain later milestones.

Planned November 12 amendment: [the server-organizations plan](server-organizations-plan-2026-11-12.md) and NMA-072–083 define PostgreSQL, authenticated organization/user scope, private Team-agent interactions and explicit connections. This guide retains its current/recorded implementation boundary until the new NMA-079 API gate verifies the changed contract; its owner-only examples do not establish multi-user authorization.

Application contract **1.3.0** extends the harness-first backend with product identity, atomic Tobi setup, conversational configuration and conversation reads. This is the NMA-052 implementation. [NMA-050](../backlog/NMA-050.md) and the NMA-060 API gate are Done under the accepted Muse API-key billing scope; Muse subscription remains unverified. This guide records the original backend milestone; current UI and distribution status is maintained in [the local backlog](../backlog/README.md).

## Identity and setup

`bun run setup` and the server bootstrap call `Conversations.setup()` before serving requests. One SQLite transaction stores the subscription-selected Codex connection, Tobi, its primary DM, an authored English welcome and the durable setup receipt. The welcome has `author=agent`, Tobi's `author_agent_id`, and `run_id=null`. It never calls a model. The stable internal setup key plus database uniqueness constraints prevent duplicate Tobi/DM records on concurrent requests, retry or restart.

Setup selects `native_login`/`subscription` explicitly, with unknown credential/inference readiness and `model_id=null`. It does not import a global account or choose a model/billing fallback. The owner selects an available connection/model through the API before execution. Credentials, login and model discovery remain the native adapter's responsibility. `POST /v1/setup` with `{}` returns stable `agent_id`, `thread_id` and `welcome_message_id`; these identifiers remain stable after configuration edits.

Every agent has product-owned name, handle, avatar, soul, instructions, source-qualified skill references, harness, connection, model, reasoning, workspace reference and revision. The same product record is used in DM and groups. Skill references distinguish `harness` and `application`; this ticket does not load skill packages, modify native skills or implement NMA-054. Native sessions and transcript context remain per thread. Creation validates the connection's existence, active state and harness match. Handles are unique; an omitted handle receives a stable generated value.

## Commands and examples

All installation API mutations require the private bearer token and a UUID `Idempotency-Key`. Exact retries return the original receipt; changed input under the same key returns `IDEMPOTENCY_CONFLICT`. The MCP endpoint accepts a run lease rather than the installation token.

| Method and path | Body or result |
| --- | --- |
| `POST /v1/setup` | `{}`; atomic setup receipt |
| `POST /v1/agents` | Agent profile; returns the created product agent without running a model |
| `POST /v1/agents/{id}/configuration` | `expected_revision` and nonempty `changes`; returns the saved profile |
| `POST /v1/agents/{id}/dm` | `{}`; returns the same primary DM on every call |
| `POST /v1/threads` | DM creation also deduplicates by agent; groups retain explicit membership |
| `GET /v1/threads/{id}/snapshot` | Consistent event cursor, thread, current profiles, binding history, runs and latest messages |
| `GET /v1/threads/{id}/history?limit=50&before={message_id}` | Oldest-to-newest page preceding the exclusive message ID; `has_more` and `next_before` |
| `GET /v1/events?after={cursor}&limit=100` | Durable owner event replay; apply entity ID/revision without appending duplicate messages |
| `GET /v1/contracts` | Entity, command, event, conversation projection and history query JSON schemas |

Example create body (replace UUIDs with records from this installation):

```json
{
  "name": "Researcher",
  "handle": "researcher",
  "avatar": "🔎",
  "soul": "A careful researcher who distinguishes evidence from assumptions.",
  "instructions": "Cite primary sources in research reports.",
  "skills": [{ "source": "application", "name": "research", "revision": 1 }],
  "harness": "codex",
  "connection_id": "11111111-1111-4111-8111-111111111111",
  "model_id": "a-model-from-this-connection-catalog",
  "reasoning": null
}
```

Example update body:

```json
{
  "expected_revision": 1,
  "changes": { "name": "Research Partner", "instructions": "Keep reports concise and cite sources." }
}
```

`changes` contains only explicitly supplied fields: create defaults never reset omitted patch fields. Concurrent writes at the same expected revision allow one success. Stale revisions return `CONFLICT`; identity, system role and configuration access cannot be injected through either profile schema. Handle collisions conflict. Missing IDs return `NOT_FOUND`, mismatched/revoked connections or inaccessible resources return `SCOPE_DENIED`. Model availability and reasoning compatibility are rechecked against the native catalog before dispatch.

## Product tools and scope

Both native adapters advertise/forward these tools through the application HTTP MCP bridge:

- `ngertiin.describe_tools({})` returns exact tool schemas.
- `ngertiin.read_run_context({})` returns the current input, run/agent/thread identifiers and frozen agent snapshot.
- `ngertiin.list_agents({})` returns permitted profiles/revisions and secret-free connection choices/catalogs. It does not return transcripts or credential references.
- `ngertiin.create_agent({command_id, profile})` atomically creates an agent, its DM and its receipt, without admitting work.
- `ngertiin.update_agent({command_id, agent_id, expected_revision, changes})` atomically updates configuration and records the receipt/events.

Tobi has server-owned `configuration_access=owner` so it can configure the owner's agents. Other agents start with `self` and can inspect/edit their own profiles. The bridge verifies the owner/connection/agent/thread/run/binding lease, membership, current grants and product-tool capability at each call. The configuration tools separately enforce the target scope and expected revision. Mutation command fingerprints include owner, actor, target and operation; retries across runs reuse the same receipt and cannot reapply the effect. Neither a tool nor a profile patch can grant owner configuration access. No universal approval checkpoint is introduced.

## Configuration and native sessions

Queued runs have no effective profile snapshot yet. Immediately before claim, the background dispatcher prepares the native session for the current profile. Claim atomically stores `agent_snapshot` including its product revision, connection/model/reasoning and profile fields. Configuration changes then affect the next claim; they do not rewrite an active snapshot or kill its old connection. Current membership/grants/connection capabilities are still checked, so a genuine revoke fences future dispatch and tool calls.

Preparation is bounded by dispatcher concurrency. Active or unknown lanes are not prepared again. Configuration changes invalidate the cached session only when the lane is eligible for new work. Provider/account/model changes are explicit selection changes; there is no automatic billing fallback. Binding revision/generation and `active` distinguish the current mapping from retained native mappings. An unchanged profile resumes the exact native ID after restart.

The pinned Openbot source documents that Codex can retain old developer instructions on resume. A changed profile therefore starts a replacement native session instead of claiming resume applies its new identity. The previous mapping remains persisted with `active=false`; the new binding records `agent_revision` and a higher generation. Both adapters receive the same current product identity. Replacement context contains completed product messages from that thread only, with explicit authors, within a 40,000-character JSON-entry budget and an omitted-message count. Pending/unknown work is not replayed. The full product history remains stored even when the native context window is bounded. No DM transcript is copied to a group.

Muse receives profile context and the user's actual text as separate input blocks. Its terminal read replaces ephemeral item state with authoritative native history; obsolete deltas do not become duplicate text in the saved answer.

## Reads and replay

Snapshots are taken in one database transaction with the event high-water cursor. History defaults to the latest 50 messages and supports 1–100 per page; an exclusive `before` ID must belong to that same thread. Messages explicitly identify user/agent/Routine authors and their owning run. To reconnect, retain message IDs/revisions, obtain a snapshot, and replay events strictly after its cursor. Profile and run state are projections, not success inferred from answer prose. Reading snapshots/history, reopening a DM or replaying events never creates runs, bindings or messages.

Storage remains the existing single-authority Bun/SQLite store. New fields have schema read defaults and the active-binding uniqueness index is updated transactionally. No data reset or historical-evidence rewrite is performed. Old development compatibility is not an acceptance commitment; the normal-operation restart of newly written identities/configuration/history/bindings is tested.

## Source and verification

Openbot revision `01e4b18e238e5de72a3570162c9f4275bb585786`: `agent-service.ts`, `agent/profile-tools.ts`, `agent/thread-lifecycle.ts`, and `agent/developer-instructions.ts`. Local changes use existing Ngertiin domain schemas, atomic command receipts, per-thread native processes and server-side tool leases. Openbot's required initial model message, desktop/cloud dependencies and provider fallback are omitted. Exact hashes, adopted flows, versions and upgrade steps are in [provenance](../verification/nma-052/provenance.json).

See [verification and remaining dependency](../verification/nma-052/README.md). Contract/process fixtures, subscription Codex evidence and API-key/dev-credit Muse evidence are separate. API readiness, UI, installer and production acceptance remain outside this ticket.
