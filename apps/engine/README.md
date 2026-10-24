# Isolated Hermes adapter

This package implements the runtime boundary specified by [NMA-006](https://app.notion.com/p/402abdd6187381d899d0c98b4bf081d7), following ADR-01 and ADR-03. Native execution remains private and **not enabled for production**; the configuration-only product API is documented below. Agent configuration CRUD is documented below. Durable run cancellation, replay and recovery are implemented below. Goals, causal handoffs and group routing remain their ordered downstream slices.

## Ownership and deployment

One process and durable **local** volume per account partition. The entry point installs a `GatewayRunner` subclass before native bootstrap. Native bootstrap owns reservation, epoch, session execution, workers, shutdown and recovery. The subclass attaches a private Unix request socket after native startup and closes it before shutdown. It adds no scheduler and imports no legacy backend. No upstream source file is patched; this subclass seam is an explicit Ngertiin integration that upgrades must retest.

Run with the pinned Hermes environment (Python 3.14.9). `runtime-pin.json` records source and upstream dependency-lock hashes; startup checks them, Python, FTS5 and JSON support. The adapter's `uv.lock` covers its own zero-runtime-dependency package; Hermes's `uv.lock` and `pm/lock.json` remain the actual runtime dependency locks. Do not install Hermes into `apps/backend`.

Required server-controlled environment:

- `HERMES_SOURCE`: verified upstream source directory.
- `HERMES_HOME`: exclusively owned account state volume; use a short path (e.g. `/state`) for the Unix socket.
- `NMA_OWNER_ID`: account UUID, provisioned by the authenticated control plane.
- `NMA_SERVICE_KEY_FILE`: private file containing at least 32 random bytes, shared only with the API signer.
- `NMA_BINDINGS_FILE`: private JSON array of the integration bindings below. This is temporary server provisioning for this slice, not a public configuration API.
- Native provider credentials: supplied through the account's secret environment. Never put keys into bindings or command payloads.

```json
[{
  "agent_id": "11111111-1111-4111-8111-111111111111",
  "thread_id": "22222222-2222-4222-8222-222222222222",
  "config_revision": "1",
  "context_generation": "1",
  "model": "configured-model",
  "provider": "custom",
  "base_url": "https://provider.example/v1",
  "toolsets": [],
  "cwd": "/workspace"
}]
```

Bindings are persisted immutably by their agent/thread/config/context identity. Changing the same revision's model/tool selection fails startup. A new revision or thread has a distinct native session. Paths, models and capabilities come only from this server-owned manifest. Identity/soul/MCP/scoped memory provisioning is not implemented by this temporary manifest; NMA-007–009 replace it with authoritative domain configuration.

The Dockerfile separates the `foundation` runtime from the `verify` test environment. Use an owner-specific container, mount only its volume and authorized workspace, do not publish native gateway ports, and keep the Unix socket accessible only to the trusted forwarding API. Full executor/credential isolation is still NMA-023; a profile directory is not a sandbox. Do not use shared network SQLite volumes or concurrent active replicas. Move a partition only after fencing and proving exclusive volume ownership.

```sh
python3 apps/engine/fetch_runtime.py apps/engine/.runtime/source.tar.gz
docker build --target foundation -t ngertiin-engine:foundation apps/engine
```

To verify Linux without exporting/unpacking an image twice on a constrained Docker disk:

```sh
docker build --target evidence --output type=local,dest=.dev/nma-006-linux apps/engine
```

The evidence target launches the foundation interpreter as a non-root user from a separate pytest environment, and exports the test log and both installed-distribution inventories. It does not deploy a service.

### Foundation dependency profile

`build_runtime.py` exports the pinned upstream lock through Hermes PM, then builds a
fresh requirements environment with ACP/MCP extras. It neither patches upstream
source nor rewrites its lock. The explicit packaging deviations are:

- Exclude `pillow-heif`: its bundled GPL codec wheel is not part of this foundation
  artifact. HEIC/HEIF image input is outside this profile; JPEG/PNG and the tested
  text/tool/MCP paths do not require that wheel.
- Exclude `fetch-use` and its dependent `browser-harness`: the pinned fetch-use
  source/wheel lack a distributable notice and the declared repository is
  unavailable. Native Browser Use is outside this profile; do not advertise it.
- Keep `firecrawl-anydoc` and ship its exact 0.2.4 source-archive MIT notice under
  `/opt/ngertiin/notices`, with source/archive/member hashes in `provenance.json`.
- Import Hermes from its verified source tree rather than installing its full-app
  distribution metadata, which would require the deliberately excluded packages.
  The profile manifest records the upstream revision, lock hash and requirements.

The build fails if an excluded package returns or an installed distribution has
no packaged/supplemental notice. The source tree retains its upstream notices.
`HERMES_DISABLE_LAZY_INSTALLS=1` keeps the deployed dependency set fixed; changes
require rebuilding and rerunning the inventory gate. This is a packaging choice,
not an agent initiative policy. Reintroducing excluded capabilities requires their
own dependency/source-notice review and runtime acceptance.

For a local foundation environment, run `build_runtime.py --source <verified-source>
--out <new-environment>`. Add `--tests` only for a separate test runner. Set
`NMA_TEST_RUNTIME_PYTHON=<foundation-environment>/bin/python` when running pytest
from that runner to exercise the actual application interpreter.

## Internal command boundary

One newline-delimited JSON request/response per connection to `$HERMES_HOME/nma.sock`, mode `0600`. `contracts.sign` creates the internal HMAC-SHA256 envelope. It binds owner, actor, audience, expiration, canonical body and digest; wrong owner, signature, expiry and unsupported schema fail closed. Signer keys must be unique per partition. This is private service authentication, not browser authentication or the public HTTP implementation.

Body fields are `schema_version: nma.v1`, UUID `command_id`, `type`, `expected_revision: null`, `payload`. The currently negotiated internal capabilities are:

- `runtime.describe`: empty payload; reports authority epoch and `production_ready: false`.
- `runtime.submit`: agent/thread UUIDs, decimal-string config/context revisions and text. Only provisioned bindings are accepted. Returns product run identity and a durable admission receipt, not model success.
- `runtime.read`: run ID; maps native queued/started/unknown/terminal receipts to queued/running/indeterminate/succeeded/failed/cancelled.
- `run.cancel`: run ID; commits a durable run fence before native queued cancellation or generation-specific interrupt, including queued-to-claimed races. Pending delivery resumes after restart. It does not stop unrelated goals.
- `runtime.events`: run ID, nullable replay epoch and decimal-string last sequence. Reads committed owner-partition events filtered by run, in pages of at most 256 events. The stream incarnation survives process restart; a different incarnation requires a snapshot and a future sequence returns `CURSOR_AHEAD`. Partition gaps from filtering are legal. Events are retained without pruning in this slice.
- `runtime.snapshot`: run ID; returns authoritative status, current text/draft, identities and `through_sequence`/`replay_epoch` from one SQLite transaction. Replay strictly after that cursor. A final `message.completed` replaces the draft for that run, rather than appending another response. Public HTTP/SSE routing belongs to NMA-011.

Mutations store canonical command digest and pending outbox identity before native dispatch, then mark applied and append a domain receipt event in one extension transaction. Native admission uses the same operation ID on retry. Identical retries return the stored receipt; changed bodies conflict. An acknowledgement timeout is unknown, so retry the **same** command ID. Pending outbox rows are retained; no background semantic retry loop is introduced. NMA-010 adds run crash reconciliation and durable stop fences; causal descendant propagation belongs to the goal/handoff slices.

The gateway's writer owns all `nma_*` mutations and checks the native epoch and partition. Migration 1 is additive, checksum-versioned and transactionally applied. Foreign keys are required. `nma_adapter_bindings/runs` are temporary integration mappings, not replacements for the full domain tables assigned to later slices. Foundation thread identity APIs are documented below; message delivery and PostgreSQL projections remain downstream.

## Operations, provenance and upgrade

Upstream: [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent/tree/7489b22af47ce91b366dde81d5831ea422577498), commit `7489b22af47ce91b366dde81d5831ea422577498`, root MIT. Archive SHA-256 and integration module hashes are in `src/ngertiin_engine/runtime-pin.json`. The archive fetcher verifies its hash before extraction. The [retained MIT notice](../../docs/research/evidence/nma-001/HERMES-LICENSE.txt) also covers imported upstream test helpers. No upstream code is vendored here. Local source patches: none. Runtime adaptation: runner subclass plus calls to the pinned session/store APIs.

Upgrading requires reviewing all pin hashes and the subclass seam, regenerating both upstream locks only through upstream's process, retaining source/dependency notices, testing the actual target image, rerunning adapter and native recovery suites, and reviewing any changed native wire/actor/profile contract. Never change a pin solely to make a failing test pass.

Before migration/upgrade: stop ingress, drain or quarantine runs, shut down the native owner, back up root SQLite **and** subordinate state/secret references/workspaces consistently, verify restore to a disposable partition, then start one owner. Unknown newer schema or changed migration checksum refuses startup. Rollback preserves the entire new partition; never delete extension tables or import its runs into the legacy engine. No existing application database migration or cutover occurs here.

The earlier full-app verification image retains its historical packaging blockers.
The foundation profile addresses those specific blockers by exclusion and the
versioned supplemental notice above. This does not clear the excluded packages,
other platforms, optional extras or the product's remaining production gates.

## Agent lifecycle and configuration (NMA-007)

Migration 2 adds `nma_agents`, append-only `nma_agent_configs`, and durable
`nma_agent_run_fences`. The gateway is still the only writer. Agent UUIDs are shared
across scoped thread bindings; no configuration is stored in legacy persona rows.
The public page is `/agents`. The authenticated API forwards `GET /api/agent-engine/v1/agents`
and `POST /api/agent-engine/v1/commands` to provisioned partitions; unprovisioned accounts
receive `503 ENGINE_UNAVAILABLE`, with no legacy fallback or API-local acceptance.

Set `NMA_PARTITIONS_FILE` on the backend to a private server-owned JSON map:

```json
{
  "<authenticated-account-uuid>": {
    "socket": "/state/account/nma.sock",
    "key_file": "/secrets/account-service-key"
  }
}
```

Set `NMA_MODELS_FILE` on each engine to a private server-owned model catalog:

```json
{
  "research": {
    "label": "Research model",
    "model": "configured-provider-model",
    "provider": "custom",
    "base_url": "https://provider.example/v1",
    "cwd": "/workspace"
  }
}
```

The browser sends only a catalog ID. Endpoints/workspace paths are resolved server-side,
frozen into each immutable configuration revision, and omitted from public responses.
Keep credentials in the existing provider secret environment. Catalog changes affect future
configuration revisions. `NMA_BINDINGS_FILE` is now optional; retain it only for adapter
contract fixtures. New agent bindings resolve from authoritative configurations. Capability
assignments remain NMA-008; new domain agents start with an empty toolset.

Agent commands use the NMA-005 envelope. Create payload is
`{display_name, handle, config: {soul, instructions, model}}`; configure adds `agent_id`
and requires the current decimal-string `expected_revision`. Disable/archive take `agent_id`;
restore also takes `status: active | disabled`. Restore retains the UUID and creates a new
configuration snapshot so revoked bindings cannot revive. Handles remain reserved while archived.
Exact retries replay their stored receipt/rejection; a different body under the same command ID
conflicts. The UI retains the same command ID while retrying an uncertain save.

Composition order is identity, soul, instructions. It is frozen through the pinned native
`stage_local_session(..., skills_prompt=...)` seam, not appended to the user's message.
`ignore_rules` disables profile-wide soul/memory/context files; the runner subclass suppresses
profile-level prompt overrides for these marked sessions. Actual model requests verify this seam.
This is not a claim that the managed-worker `ignore_user_config` path is supported: that experiment
failed native adoption and was removed. No native source is patched.

Configure affects future admissions; existing runs retain their snapshot. A fresh admission naming
an old config revision fails. Archive/disable commits generation and unfinished-run fences, then
uses native cancellation. Completed history remains readable. Unfinished fenced output is suppressed
and cancellation is redelivered on startup. Restart-before-dispatch/tool fencing is covered by NMA-010 below. Causal descendants and
full tenant isolation remain downstream gates; no goals or wakes exist in this slice.
Production remains disabled pending those downstream gates. Foundation packaging
and its historical full-app exclusions are documented above.

Before upgrade, stop ingress and native execution, back up the complete owner volume, then let
one gateway apply the additive checksummed migration. The predecessor-version test preserves
existing commands and passes FK checks. A checksum mismatch/newer schema refuses startup; do not
edit migration checksums in deployed databases or downgrade by dropping tables. Restore the full
consistent backup for rollback and preserve newer state for reconciliation. PostgreSQL projections
and durable SSE are deferred to their runtime/replay slices; these configuration reads go directly
to the authority and cannot lag its committed state.

Pending submit retries reconcile an existing native admission using the original stored binding
before current revision/access checks. They preserve the original run snapshot without submitting
new work. A pending command with no native receipt still obeys current admission checks.

Wire budgets apply to encoded canonical JSON: 2 MiB per signed request and 16 MiB per response.
Canonical encoding and command hashes remain stable. The API rejects oversized requests with
HTTP 413 (`REQUEST_TOO_LARGE`, `retryable=false`) before opening the engine socket. Agent listing
also caps each page at 4 MiB; a page may contain fewer rows than requested, so follow `next_cursor`.

## Per-agent capabilities (NMA-008)

Agent `config` accepts optional `tool_grants`, `mcp_grants`, and `skill_refs` arrays
of server catalog IDs (at most 16 unique IDs per category). Omitted arrays mean no
grants. `agent.configure` replaces the complete config; retain the arrays on an
unrelated edit. `/agents` exposes these selections under **Kemampuan agent**. The
agent listing exposes catalog IDs/labels only. Clients cannot supply server paths,
headers, connector URLs, toolset names, or secret values as capability definitions.

Set `NMA_CAPABILITIES_FILE` to an owner-partition-specific private catalog, for example:

```json
{
  "tool_grants": {
    "tasks": {"enabled": true, "label": "Task list", "toolset": "todo"}
  },
  "mcp_grants": {
    "research": {"enabled": true, "label": "Research connector", "server_file": "/secrets/research.json"}
  },
  "skill_refs": {
    "citations": {"enabled": true, "label": "Citations", "content": "Cite original sources for factual claims."}
  }
}
```

The separate private connector file uses the pinned native HTTP specification:

```json
{
  "type": "http",
  "name": "research",
  "url": "https://connector.example/mcp",
  "headers": [{"name": "Authorization", "value": "Bearer SERVER_MANAGED_SECRET"}]
}
```

Provision actual credentials outside Git and outside public request bodies. Keep
catalog and credential files owner-readable only and replace them atomically.
Server names must be unique within an assigned set. URLs with embedded userinfo,
query strings, or fragments are refused. The current supported native toolset is
`todo`; MCP uses HTTP; assigned skills are bounded instruction text, composed after
identity/soul/instructions. Host terminal/files/browser, MCP stdio/SSE, executable
skill assets and a public credential-management UI are not implemented here. These
are explicit transport/executor coverage boundaries, not a new initiative policy.
NMA-022/023 must review additional capabilities against their executor/isolation
contracts before extending this support matrix.

The foundation builder selects upstream-locked ACP/MCP extras. Native
session-scoped MCP registration depends on ACP schema types even though the
product does not expose an ACP client. Test dependencies belong to the separate
verification environment. See the foundation packaging profile above and its
platform inventories for the exact shipped set.

Assignment revisions snapshot catalog fingerprints, toolsets and skill text in the
existing immutable config JSON; secrets stay in memory and private credential
files. This needs no new table or modification to migration 1/2 checksums. Each
agent/thread/config/context binding gets its own native MCP scope and generated
tool names. The native session manifest is stored, but transport credentials are
not. On restart the runner reattaches only the matching live private specification.
Discovery failure returns `CONNECTOR_UNAVAILABLE` instead of silently omitting an
assigned server. The pinned native preflight can time out against a HEAD-405/GET-SSE
endpoint; expose a bounded HEAD response or treat that connector as unavailable.

Adding grants affects new config revisions only. Removing any grant atomically
increments `access_generation`, records unfinished-run fences and then requests
native cancellation. Old snapshots cannot override those fences. The runner checks
live generation and catalog/credential fingerprints before model execution; the
final native tool dispatch checks them again before calling a handler. A credential
file missing/changed or a disabled/changed catalog entry denies new resolution.
Observed queued revocation records a durable cancellation fence before returning.
An external effect already dispatched before revocation cannot be undone. Do not
restore an identical removed credential as a revocation workflow: remove the agent
grant first so its durable generation advances, then remove/rotate credentials;
regrant explicitly in a new config revision when intended. Full external credential
lifecycle, group membership and effect reconciliation remain NMA-023/010.

Exact known connector header values are redacted from native logs and tool results
before they enter model context. This is not a claim to detect arbitrary transformed
secrets from malicious remote services. Only provision trusted connectors. The
private service and owner-partition boundary remain mandatory; no host sandbox or
multi-tenant process isolation is claimed by a native profile or session scope.

Upgrades must re-review `session_local_mcp`, `model_tools._execute_tool`,
`GatewayRunner._run_agent`, and the registry/transport paths in addition to earlier
seams. Source hashes are pinned. Run the real runtime capability tests, HTTP tests,
and browser walkthrough before rollout. Back up the full owner volume plus catalog
and credential references consistently. Rollback preserves configs and fences;
older code must not interpret capability-bearing configs as unrestricted sessions.


## DM/group identity consumers and migration 3

Migration 3 adds owner-bound `nma_threads` and `nma_memberships` without modifying
migration 1/2 or native session history. `thread.create` accepts only `kind`,
`title` and ordered `agent_ids`: one active agent for DM, 2–6 distinct active agents
for a group. The owner is implicit in the signed request; other humans and foreign
agent identities cannot be supplied. Accepted and rejected create receipts are
idempotent; changing a body under the same command ID conflicts.

The authenticated API exposes `POST /api/agent-engine/v1/commands` for
`thread.create`, `GET /api/agent-engine/v1/threads?after=<uuid>` for summaries,
and `GET /api/agent-engine/v1/threads/<uuid>` for current identities. Lists use
50-item cursor pages. Reads resolve the same authoritative agent records used by
configuration CRUD; no channel-specific profile copy is stored. Archive preserves
identity on existing rosters and blocks new work. Registered runtime bindings
validate membership and context generation before admission. Public callers still
cannot submit private runtime commands or provision the foundation test bindings.

The `/agents` DM/group setup and detail dialogs consume these APIs and display
shared profile changes after reload/restart. They explicitly do not offer message
sending yet. DM streaming/replay remains NMA-011; membership edits, durable
multi-author transcript and queued membership revocation remain NMA-017. These
identity consumers do not implement or claim those downstream contracts.

Before upgrading a schema-2 partition, stop ingress and its native owner and take
an offline consistent backup of the complete state/secret references/workspaces.
Startup applies migration 3 through the existing epoch-fenced writer. Unknown or
changed checksums refuse startup before ownership is advanced. Earlier binaries
refuse schema 3; rollback means restoring a complete pre-upgrade backup into an
isolated partition after fencing the current owner, never dropping the new tables
or mixing old code with the newer database. No production migration was run.

## MCP discovery credential boundary

The integration also wraps the pinned native `session_local_mcp._borrowed` seam.
Exact known connector header values in discovered names/descriptions/schemas are
rejected with the native discovery-failure code before staging, refreeze or
execution can consume them. The guard covers initial discovery and post-restart
rediscovery, while preserving native schema fingerprints and dispatch ownership.
A connector must correct secret-bearing metadata before it is usable; metadata
is not silently rewritten into a different callable schema. Result/log redaction
continues to protect exact known values in returned data and errors.

This does not promise detection of transformed/encoded secrets from a malicious
connector. Only trusted server-provisioned connectors are supported. Earlier
verification databases containing synthetic leaked fixture values are historical
reproduction artifacts, not production partitions. No real credential was used
in the regression. See the closure report for the current support matrix and
initial-discovery/restart checks covering SQLite/WAL, logs and provider requests.

## Scoped memory and transcript context (NMA-009)

Migration 4 adds `nma_memory_entries`, `nma_scope_grants`, finalized text
`nma_messages`, native-result reconciliation receipts and context run fences.
Migration 1–3 checksums and all existing/native records remain unchanged.
`agent_private` memory is available only in that agent's DMs. `thread_shared`
memory and transcript are available only to active members of their exact thread.
Another DM of the same agent shares its private memory, not its transcript or
thread memory. Groups never implicitly read agent-private memory or profile files.

The private signed owner service adds these commands (not browser commands or
model-callable tools):

- `context.read`: `agent_id`, `thread_id`; returns authorized memories, selected
  grants and finalized transcript with author/run/source identity. The requesting
  owner can inspect their own scopes; execution always uses the server-bound scope.
- `memory.create`: `scope_kind`, nullable `agent_id`, nullable `thread_id`,
  `content`, `source_message_ids`; requires 1–32 existing source messages. Private
  memory requires only `agent_id` and sources in that agent's DMs. Shared memory
  requires only `thread_id` and sources from that exact thread. Text is 1–16,000
  characters. It does not silently promote facts into reusable persona config.
- `memory.delete`: `memory_id` and the envelope's `expected_revision`; retains a
  tombstone and advances revision/generation.
- `scope.grant`: `source_kind` (`memory` or `message`), `source_id`, decimal-string
  `source_revision`, `target_thread_id`, `source_message_id`, and `reason`.
  This is an explicit authenticated owner instruction selecting one source, not
  an agent authorization. The instruction source must be an existing user message;
  an assistant message cannot authorize transfer. The command is the trusted
  owner's authorization; no model interprets intent or self-grants access here.
  Only selected content and provenance identifiers enter the target, not the
  source conversation. Artifact grants remain the artifact integration slice.
- `scope.revoke`: `grant_id` and `expected_revision`; retains provenance and a
  revocation tombstone. Creates/grants require a null expected revision.

Mutation receipts, errors and same-command payload conflicts survive restart.
General events contain command identity, not private memory text. Native settled
results reconcile once into owner/thread-bound immutable text messages; their
source IDs are stable across retries/restart. Native execution is never replayed
by this reconciliation. This is finalized-text context, not the full durable
streaming/multi-author delivery protocol owned by NMA-010/011/017.

The execution hook rechecks membership and context generation, then hydrates only
that thread's current-generation finalized text plus authorized memory/grants.
Config changes retain authorized thread history. Native profile-wide rules and
memory loading remain disabled through the pinned `ignore_rules` path. Memory is
resolved at execution, not copied into immutable agent config. The final tool
dispatch also checks context generation. No new scheduler or initiative policy
is introduced.

Deleting memory or revoking a grant advances affected thread context generations,
atomically fences unfinished runs and requests native cancellation. Startup
redelivers those cancellations. Old-context output/events are suppressed for
fenced work; already completed results retain their original status. A new binding
starts from current-generation text, so stale context cannot return through a
cached session. Earlier transcript remains owner-readable as historical evidence;
revocation is not deletion of content already shared or delivered. Previously
executed external effects cannot be undone. Native historical messages remain in
the owner volume, which is not an agent-accessible file capability.

Before upgrade, stop ingress and the owner process, then back up the complete
state volume, private catalog/credential references and workspaces consistently.
Migration 4 invalidates existing product-thread sessions by advancing their
context generations and fencing unfinished work; old bindings and native history
are retained. Clients must obtain the current thread generation for fresh work.
Do not resume an older-generation pending run under a new command ID. The engine
rejects unknown or altered migration checksums before native startup. Rollback
requires fencing the new owner and restoring the complete schema-3 backup into an
isolated partition; older binaries reject schema 4. No production migration was
performed for this implementation.

Foundation retrieval returns the complete authorized finalized-text set; semantic
ranking, large-history pagination/compaction, automatic memory extraction, public
memory UI, model responsibility tools and artifact sharing are not claimed by
this scope slice. No live provider or OS/tenant sandbox proof is implied by the
loopback model tests. See [verification and provenance](../../docs/research/nma-009-scoped-context.md).


## Durable execution boundaries (NMA-010)

Migration 5 adds run stop tombstones, a durable stream incarnation, indexed run/event
mapping, terminal reconciliation receipts and external tool dispatch receipts. It does
not change migration 1–4 checksums or native tables. Existing final native results are
reconciled without execution; pre-upgrade volatile deltas cannot be reconstructed.

The gateway remains the only execution owner. Native reservation, authority epochs,
claim generations and turn leases remain authoritative. The adapter checks the native
claim/epoch and product fences before tool dispatch and event publication. Durable event
writes occur under the native stream lock before native delivery; extension writes use
Hermes's fenced transaction writer. No additional scheduler, lease timer or retry worker
is introduced. Store errors cannot produce an acknowledged product event.

Pending submit intents resume at startup under the original command identity. A native
receipt is consumed before mutable admission checks; new work still passes current
checks. Semantic revocation failures are stored as rejected receipts, while storage or
unclassified failures preserve pending state and fail startup. Claimed work whose outcome
is unknown stays indeterminate; startup never reruns that model turn. Terminal native
results reconcile once to final product events even when the process died before publish.

`run.cancel` commits its fence and delivery intent atomically. Restart redelivers an
unfinished native interrupt; the fence already prevents tool dispatch, response events
and transcript publication. Completed native history is not retroactively cancelled.
No causal child/goal/trigger tables exist yet; their propagation is NMA-014/018, and those
slices must inherit this fence before admitting children.

The final native `_execute_tool` boundary records a stable operation identity and intent
digest before calling a tool, then retains its redacted return receipt. A dispatch without
a receipt remains indeterminate, even if the process died before the request left. Exact
operation reentry returns the confirmed receipt or refuses an uncertain dispatch. A late
receipt may be retained after stop but cannot revive conversation output. Native internal
agent-loop primitives such as `todo_list` do not use this external dispatch boundary.
Provider-specific idempotency keys and reconciliation APIs are not fabricated: this is
not an exactly-once external-effect guarantee. An indeterminate run is inspectable but
has no automatic retry/resolution command in this slice.

Before upgrading, stop ingress and the owner, then back up the complete local state
volume, native stores, workspace and credential references consistently. Upgrade with
one owner and verify integrity/foreign keys. Older binaries refuse schema 5. Rollback
requires fencing the new owner, preserving newer work for reconciliation, and restoring
an isolated complete schema-4 backup; never drop tables or replay old accepted operations.
Events, compact identities and stop tombstones must not be manually pruned. No production
volume or PostgreSQL projection was migrated. Browser DM transport/projection remains
NMA-011; this package exposes the authenticated private replay/snapshot source.

See [fault-injection evidence](../../docs/research/nma-010-durable-execution.md).

## Direct-message HTTP and SSE (NMA-011)

The existing authenticated backend forwards DM commands to the provisioned owner gateway.
It never starts a model, owns a run, or falls back to legacy execution. A new `message.send`
uses the DM's server-resolved agent, current configuration and context generation:

```json
{
  "schema_version": "nma.v1",
  "command_id": "00000000-0000-4000-8000-000000000011",
  "type": "message.send",
  "expected_revision": null,
  "payload": {
    "thread_id": "00000000-0000-4000-8000-000000000012",
    "text": "Continue the research.",
    "attachment_ids": [],
    "request_key": "00000000-0000-4000-8000-000000000013",
    "expected_membership_revision": "1"
  }
}
```

Send to `POST /api/agent-engine/v1/commands`. First admission returns 202; exact command
or request-key retries return 200 with the same message/run identities. Keep both IDs after
an uncertain transport failure. Changed payload under an existing identity returns 409.
Text is nonblank and at most 100,000 characters. Attachments are not wired in this slice;
nonempty attachment IDs and caller-supplied agent/owner/config/path fields are rejected.
Groups are not accepted by this DM ingress. Rejected commands remain rejected on retry.

Every new DM message durably fences unfinished runs in that DM, retains their user messages,
and requests native cancellation before delivering the new run. Other DMs are unaffected.
The source message, request key, execution intent, interrupted set, cancellation outbox and
initial events commit together. Native admission uses a stable derived identity in its own
transaction; recovery reconciles that receipt. A new run uses prior scoped transcript only,
excluding its already-persisted source message and later messages from its history.

Use `run.cancel` with `{"run_id":"...","reason":"Optional explanation"}` and null
expected revision to stop a run. The cancellation event/fence is durable before native
interrupt. Completed results remain completed. User input does not erase previous external
effects or resolve an indeterminate external operation.

Read endpoints:

- `GET /threads/{id}/snapshot`: authoritative DM messages, their runs, thread identity and
  `through_cursor` in one engine database transaction. Newest messages are returned in
  ascending order, at most 100 and a combined 4 MiB message/run budget. Fetch older pages
  with `?before_message_seq={next_before_message_seq}`. Merge by message ID; use the initial
  snapshot cursor for live catch-up while loading older history. Goals are currently empty.
- `GET /runs/{id}`: current status, partial/final text and stable terminal error code.
- `GET /commands/{id}`: durable accepted/rejected receipt or pending admission state.
- `GET /events?thread_id={id}`: SSE; send `Last-Event-ID` from the snapshot or last consumed
  frame. The opaque cursor binds owner, thread, stream incarnation and decimal sequence.
  It never grants authorization. Wrong owner/thread or malformed cursors return 422;
  future sequence and wrong incarnation return 409 (`CURSOR_AHEAD` / `CURSOR_RESET`).

SSE frames carry stable event IDs and decimal `seq`. `run.delta` updates the run draft;
`message.created` upserts the committed message by ID and replaces that run's draft.
`run.completed`, `run.failed`, `run.cancelled` and `run.indeterminate` describe outcomes.
Terminal failure uses safe codes, not raw provider errors. Additional native progress
frames remain informational; `message.completed` is not a second committed message.
A transport failure after headers emits `stream.error` and closes without changing the
last durable cursor. Reconnect with that cursor, or resnapshot after `CURSOR_RESET`.
Disconnecting SSE does not cancel execution. No event pruning is enabled.

The HTTP stream polls retained events only (250 ms when caught up, pages bounded to 128
frames / 4 MiB); this is transport delivery, not another execution scheduler. These reads
use the authoritative engine directly, following the existing agent/thread API approach.
No PostgreSQL read projection/checkpoint consumer is introduced or claimed here. If such
a consumer is added later, ADR-03's atomic projection/checkpoint contract still applies.

Migration 6 adds only `nma_dm_requests`; migration 1–5 checksums, native tables, messages,
run receipts and fences are preserved. Stop ingress and the gateway, take a consistent
backup of the complete owner volume and registry/secret references, then upgrade under
one owner. Verify readiness, SQLite integrity/foreign keys, persisted identities, snapshot
and replay before reopening ingress. Earlier binaries reject schema 6. For rollback, fence
and stop the new owner, preserve its complete volume/new work, and restore a complete
predecessor backup in an isolated partition; never drop receipts or reuse old cursors
against a different live store. No automatic destructive downgrade is provided.

## Direct-message web experience (NMA-012)

The authenticated `/agents` page opens or creates a DM for a saved agent without
requiring another configuration form. `/dm/{thread_id}` consumes the snapshot,
SSE, message and cancellation endpoints above. Thread listing now includes the
nullable `dm_agent_id`; deploy this additive engine response before the web client.
No schema migration is required. Existing group setup and legacy chat routes
remain available; group messaging and engine cutover are separate work.

The UI preserves pending message command/request IDs across reload in per-tab,
owner/thread-scoped session storage, retries uncertain sends with the same body,
and resnapshots after cursor reset or browser online recovery. If browser storage
is unavailable, pending intent is retained only in memory. Server transcript and
native run recovery remain authoritative. Rollback changes UI/API code only;
never delete persisted threads, messages or command receipts to roll back the UI.

## Conversational responsibility capture (NMA-013)

Ordinary product DM turns receive the `responsibility` tool automatically. The
agent selects `create`, `update`, `stop` or `list` using the current conversation
and stored goals; there is no activation form or separate classifier. This is
Ngertiin-authored capture over the pinned Hermes tool loop. It does not enable a
Kanban dispatcher, schedule, goal continuation or another execution owner.

The server binds owner, responsible agent, home thread, source run and source
user message. Tool arguments cannot choose these identities. Corrections require
`expected_revision`; stale writes return `REVISION_CONFLICT` and the agent can
refresh with `list`. `stop` acts on the current goal and increments its revision
and generation. Stopped identities remain visible and cannot be updated or
recreated using the same semantic `creation_key`. Semantic matching across
*different* keys is model-dependent; transport/tool replay is transactionally
idempotent. The original source message remains on the goal, and each operation
retains its own message/run provenance and result.

Migration 7 adds `nma_goals`, `nma_goal_operations` and the scope index. Mutation,
receipt and `goal.changed` event commit in one gateway epoch-fenced transaction.
There is no intermediate external effect for a local goal mutation. A crash before
commit leaves none of them; after commit the stored result survives even if the
native run becomes indeterminate. Recovery never reruns an unknown model turn.
The existing thread snapshot includes goals at its consistent watermark; SSE
publishes their IDs and complete state. No goal UI or browser-only mutation API
is added in this slice.

Upgrade: stop ingress and the owner, back up the **complete** partition volume,
registry and secret references, then upgrade under exclusive ownership. Verify
schema 7, all migration checksums, SQLite integrity/foreign keys, snapshot and
replay before resuming ingress. Native state and migration 1–6 checksums remain
unchanged. Existing sessions gain the domain tool dynamically; no conversation
or configuration revision is rewritten by migration. Older binaries reject
schema 7. Rollback must preserve new work and restore an isolated complete
predecessor backup, never drop live goal tables or receipts.

This capture slice supports active/stopped goals only. NMA-014 owns execution-unit
mapping, active descendant/trigger cancellation, progress/evidence, wait, completion,
resume/reopen and proactive continuation. A captured goal is not evidence that
work has been scheduled or completed. Group capture and shared goal ownership
remain downstream work. Current retrieval supplies the full scoped goal set;
large-history goal pagination/compaction is not established.

Focused acceptance: run `apps/engine/tests/test_goals.py` with the pinned runtime
as documented above. Paid-provider dataset evaluation is explicitly opt-in with
`NMA_TEST_LIVE_ENV` pointing at a file containing `OPENAI_API_KEY`, `OPENAI_MODEL`
and optional `OPENAI_BASE_URL`; run `apps/engine/tests/test_goals_live.py` and set
`NMA_TEST_LIVE_OUTPUT` to the desired JSON evidence path. Only the inputs in the
spike dataset reach the model; expected labels are evaluated outside its context.
