# Domain, persistence and API contract — ADR-03

Date: 2026-10-23. Contract version: `nma.v1`.
Scope: [NMA-005](https://app.notion.com/p/402abdd61873818abd30d42ac276b671).
Authority: [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a),
documents 01–08 and [NMA-004](https://app.notion.com/p/402abdd6187381d49323cc471a97d2bf).

## ADR-03: decision and evidence

**Status:** accepted technical contract for downstream implementation. This ticket defines the
domain, schema/migration plan and wire behavior; it does not install the engine, apply migrations,
or claim integrated runtime acceptance. NMA-004 was read live and is Done. Its ADR-01/02/04/05
remain binding. This record closes ADR-03; ADR-06 remains NMA-026.

**Problem:** stable product agents and goals must survive session replacement without merging
private contexts, creating two execution owners, or losing stop/dedup state across restart.

**Sources:** Hermes `7489b22af47ce91b366dde81d5831ea422577498` (MIT), particularly
[room storage](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_rooms.py),
[transaction helpers](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_rooms_common.py)
and [driver](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_driver.py)
use root SQLite state, generation/lease predicates and independently opened transactions.
Nakama `ac0643f8196fdf9133e66f5a13eef86103c45d0c` (MIT)
[group store](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/agent-group-store.ts)
separates owner, group, session, author and private thread; its stored session explicitly excludes
in-memory activity. These are references, not imported schemas or evidence of durable Nakama runs.
Local `models.py:Account`, migration `0001_v1_baseline.py` and the NMA-003 audit establish the
existing PostgreSQL account identity and legacy ownership boundaries.

**Evidence:** NMA-001 previously exercised native two-agent handoff, settled restart and duplicate
receipt; NMA-002 previously demonstrated multi-session capture and archive/dedup gaps; NMA-004
reported 90 native policy/driver tests. Those are prior evidence, not rerun tests in this ticket.
Current work reads the pinned sources and reviews concrete payloads, constraints and crash traces.
No upstream code is copied. These domain extensions are Ngertiin-authored decisions, not claims
that unmodified Hermes supplies product goals, tenant isolation or this API.

**Alternatives:** PostgreSQL product state plus independent runtime lifecycle writes would require
a distributed coordination protocol on every goal/config/stop. Replacing all native stores with
PostgreSQL would depart from the tested native path. Treating native session goals/cards as product
goals loses identity and stop receipts. Select an owner-local domain extension in Hermes root
SQLite, preserving native stores and explicitly reconciling their independent transactions.

**Decision:** one account has one engine authority partition and isolated state volume. Its gateway
owns all pivot domain mutations, session mappings, admission, scheduling, cancellation and recovery.
Use `nma_*` extension tables in that partition's root `state.db`; native tables keep native names.
Agent/profile executors are subordinate to this authority, including native profile gateways where
required. They cannot independently admit pivot work. PostgreSQL retains `accounts` and stores only
reconstructable pivot read projections/checkpoints in a separate `nma` schema. The existing API
authenticates and forwards commands; it never runs a model or retries semantic work under a new ID.
Configuration is also authoritative in the engine store, avoiding a second config writer.

**Consequences:** migration/backup must cover the root database, subordinate session stores, object
manifests and secret references together. API projections can lag; command receipts are authoritative.
Initial deployment is one active writer per account partition on local durable storage, not concurrent
SQLite writers on a shared network filesystem. Failover requires exclusive volume ownership and a
monotonic authority epoch; do not run two instances and rely on process-local locks. NMA-006 must
prove this deployment and compatible Python/SQLite build before enabling work. Profile directories
are not a security boundary: executors receive only authorized mounts/capabilities, with no raw root
database or another account's secrets. NMA-023 proves this isolation.

## Identity, types and ownership

`owner_id` is the existing account UUID, resolved from verified authentication. Public bodies never
select an owner, runtime profile, filesystem path, lease or actor. The API signs a short-lived service
envelope containing owner, command ID, payload digest and authenticated actor; the engine validates
audience/expiry and partition binding. Agent tools receive server-bound run/agent/thread identity.
An owner can inspect all their entities; an agent can inspect only its authorized context. IDs alone
do not grant access. Cross-owner reads/mutations return `404 NOT_FOUND` without existence details.

Product IDs are UUID strings, allocated once on first successful command admission. Native IDs are
opaque mapped strings, never public identity. UTC timestamps use RFC3339 `Z`. Persist counters as
signed 64-bit integers; encode revisions, generations, sequence numbers, byte counts and usage totals
as nonnegative decimal strings in JSON. No JavaScript Number conversion. Mutable records carry
`revision >= 1`, `created_at`, `updated_at`; every mutation increments revision. Generations start at
1 and only increase. Lifecycle status is a checked text enum, not arbitrary model output.

Every owner-local table contains `owner_id`, bound to singleton `nma_partition(owner_id, authority_epoch,
schema_version)`. Entity keys and references are composite `(owner_id, id)`; cross-entity FKs include
owner. A database open verifies the authenticated partition before any query. Enable foreign keys
on every connection. Same-thread/source scope constraints require transactional validation in
addition to FKs. No cascading deletion of receipts, provenance or terminal state.

## Entity and table contract

Fields below are required unless marked nullable. JSON columns must contain validated versioned
objects; credentials are references, never secret values. The table names and semantic fields are
the implementation baseline; physical indexes and DDL are introduced with their owning slices.

| Entity/table | Fields beyond common identity/revision/timestamps | Invariants |
| --- | --- | --- |
| Agent / `nma_agents` | `handle`, `display_name`, `status`, `config_revision`, `access_generation` | Handle unique per owner including archived identities; `active`, `disabled`, `archived`. Identity is identical in DM/group; no human membership represented as agent. |
| Config / `nma_agent_configs` | `agent_id`, `config_revision`, `soul`, `instructions`, `model`, `tool_grants`, `mcp_grants`, `skill_refs`, `workspace_grants` | Immutable `(owner_id,agent_id,config_revision)`; grants reference server-managed capabilities/secrets. Old revisions retained for provenance, never authorize revoked access. |
| Thread / `nma_threads` | `kind`, `title`, `dm_agent_id` nullable, `status`, `membership_revision`, `context_generation`, `cancel_generation`, `next_message_seq` | `dm` requires one agent; `group` requires null DM agent. `open` or `archived`. Multiple DM threads may select the same agent. No cross-thread transcript merge. |
| Membership / `nma_memberships` | `thread_id`, `agent_id`, `position`, `status`, `joined_revision`, `removed_revision` nullable, `access_generation` | Unique thread/agent, active roster position unique per thread. DM exactly one matching agent. Group creation 2–6; later removal may leave fewer, but group execution is blocked until 2–6 active agents. Owner is sole implicit human. |
| Message / `nma_messages` | `thread_id`, `message_seq`, `author_kind`, `author_agent_id` nullable, `run_id` nullable, `parts`, `source_message_id` nullable | Unique thread/sequence; explicit `user`, `agent`, `system`. Agent author/run must match; user author is authenticated owner. Immutable finalized content; partial streams are run events. |
| Session binding / `nma_session_bindings` | `thread_id`, `agent_id`, `context_generation`, `config_revision`, `native_profile_id`, `native_session_id`, `status` | Unique thread/agent/context-generation/config-revision. Model/persona revision creates a new binding with only authorized thread context. Old bindings retained; product goals survive replacement. |
| Run / `nma_runs` | `thread_id`, `agent_id`, `trigger_id`, `execution_unit_id`, `goal_id` nullable, `parent_run_id` nullable, `status`, `config_revision`, `membership_revision`, `access_generation`, `context_generation`, `goal_generation` nullable, `thread_cancel_generation`, `cancel_generation`, `authority_epoch`, `lease_epoch`, `lease_expires_at` nullable, `native_task_id` nullable, `native_run_id` nullable, `terminal_event_id` nullable, `error_code` nullable | Unique owner/trigger/agent/execution-unit; native discussion task identity supplies group execution unit, DM uses the trigger identity. A run has at most one goal; independent goals use separate runs. Lease renewal/transition CAS all current fences. |
| Goal / `nma_goals` | `thread_id`, `responsible_agent_id`, `title`, `objective`, `status`, `generation`, `source_message_id`, `source_run_id` nullable for direct owner creation, `wait_condition` nullable, `blocked_reason` nullable, `completion_evidence_ids`, `archived_at` nullable | One home conversation and responsible agent; responsible agent must be active in that scope. Agent capture requires source run. Goal ID is independent of native cards/sessions. No implicit transfer from DM to group. |
| Goal operation / `nma_goal_operations` | `goal_id`, `operation_id`, `source_run_id` nullable, `source_message_id` nullable, `actor_kind`, `expected_revision`, `payload_digest`, `result_revision`, `result` | Unique owner/operation ID. At least one authenticated source required; agent capture includes both source run and conversation message. Replay returns recorded result, never a second interpretation. |
| Goal evidence / `nma_goal_evidence` | `goal_id`, `producing_run_id`, `source_message_id` nullable, `artifact_revision_id` nullable, `summary`, `criterion`, `accepted_by_agent_id` | At least message or ready artifact evidence; same authorized goal scope. Peers submit evidence; responsible agent accepts and completes. A successful model call alone is not completion. |
| Trigger / `nma_triggers` | `kind`, `source_key`, `payload_digest`, `thread_id`, `target_agent_id` nullable, `goal_id` nullable, `goal_generation` nullable, `thread_cancel_generation`, `source_payload_ref`, `intended_at` nullable, `status`, `coalescing_key` nullable, `coalescing_deadline` nullable, `superseded_by` nullable | Unique owner/kind/source-key. Same identity/different digest conflicts. A group input may target a roster via deterministic native discussion tasks. All accepted input remains durable. |
| Handoff / `nma_handoffs` | `source_run_id`, `source_message_id`, `target_agent_id`, `thread_id`, `discussion_id`, `native_task_id`, `goal_id` nullable, `goal_generation` nullable, `status`, `target_run_id` nullable | Unique owner/discussion/source-message/target/native-task. Same-thread active membership at admission and claim. Only attributed agent messages can cause peer handoff. |
| Artifact / `nma_artifacts` | `thread_id`, `producing_run_id`, `producing_agent_id`, `goal_id` nullable, `status`, `current_revision_id` nullable | Scope is producing conversation; `pending`, `ready`, `failed`, `deleted`. No fabricated legacy task FK. |
| Artifact revision / `nma_artifact_revisions` | `artifact_id`, `object_key`, `sha256`, `byte_count`, `media_type`, `filename`, `status` | Immutable bytes/metadata after ready; object keys private. Verified bytes precede ready visibility. Download authorization precedes signing. |
| Scope grant / `nma_scope_grants` | `source_kind`, `source_id`, `target_thread_id`, `source_revision`, `created_by_run_id` nullable, `source_message_id`, `status`, `generation` | Explicit authorized selected content transfer, with provenance. Revocation removes retrieval and invalidates affected sessions. No automatic owner-wide or whole-DM grants. |
| Memory / `nma_memory_entries` | `scope_kind`, `agent_id` nullable, `thread_id` nullable, `content`, `source_message_ids`, `status`, `generation` | `agent_private` requires agent and is usable only in that agent's DMs; `thread_shared` requires thread and current membership. `active`/`deleted` tombstone; retrieval indexes carry scope and generation. |

Agent configuration contains intentionally reusable persona instructions. Conversation-derived private
facts must be stored as scoped memory, not silently inserted into globally reusable soul/config.
Group tools cannot read private memory files just because a native profile normally loads them.
The adapter must filter/disable native profile-wide memory loading on group runs. NMA-009 proves this.
An explicit user instruction can share selected information/artifact into a group using a scope grant;
the model cannot self-grant access merely by mentioning private information. This access rule is not
an approval requirement for goal capture or ordinary proactive work. A DM goal remains private; a
group responsibility is separately created with authorized provenance, never relabeled in place.

Support tables: `nma_commands` (unique owner/command ID, canonical payload digest, actor, result);
`nma_events` (partition sequence, event ID, schema version, scope, payload);
`nma_runtime_outbox` (operation ID, native identity, generation, payload, pending/applied/rejected);
`nma_runtime_inbox` (native source/receipt ID, digest, mapped event IDs);
`nma_goal_units` (goal/generation to native card/task/session mapping);
`nma_effects` (run/operation, provider idempotency key, intent, status, receipt reference);
`nma_trigger_inputs` (coalesced trigger and contributing source trigger IDs);
`nma_tombstones` (entity kind/ID, minimum generation, terminal reason);
`nma_schema_migrations` (version/checksum/applied timestamp).
Trigger definitions use `nma_trigger_definitions` (ID, revision, kind, thread/agent/goal target,
goal generation, enabled/paused/deleted state, validated schedule/watch/webhook configuration,
timezone and missed-occurrence policy). Definition edits fence old-revision pending occurrences;
an already dispatched effect is reconciled, never erased. Secrets remain capability references.
Each support identity is unique within owner. Event sequence and event ID are independently unique.
Projected PostgreSQL `nma.entities`, `nma.events` and `nma.checkpoints` retain owner and source IDs;
checkpoint contains partition ID, stream incarnation, last contiguous sequence and schema version.

## State transitions, fences and control

| Entity | Allowed transitions and required action |
| --- | --- |
| Agent | `active → disabled → active`; either → `archived`. Disable/archive increments access generation, cancels related queued/active runs and wakes; affected goals become blocked with `AGENT_UNAVAILABLE`. Archive retains identity/history; restore is an explicit new revision. |
| Thread | `open → archived → open` by owner command. Archive increments cancel generation and pauses linked nonterminal goals with generation fences. Unarchive does not resume goals automatically. Membership/config edits are revision-checked. |
| Run | `queued → running → succeeded / failed`; queued/running → `cancelled`; running → `recovering`; recovering → running only after known-safe reconciliation, or → succeeded/failed/cancelled/indeterminate. `indeterminate` may resolve only with recorded external evidence to succeeded/failed/cancelled; it is never automatically re-executed. Other terminals are immutable. |
| Goal | create `active`; active → waiting/blocked/paused/stopped/completed; waiting/blocked → active on valid wake or correction, or → paused/stopped/completed; paused → active only on explicit resume, or → stopped; stopped/completed → active only on explicit user reopen with provenance. Complete requires accepted evidence. Pause/stop/complete/reopen/resume and objective/responsible-agent changes increment generation, invalidating earlier work. Ordinary progress increments revision only. |
| Trigger | `pending → admitted → settled`; pending/admitted → cancelled; pending → coalesced with survivor link; invalid before execution → rejected. An admitted group trigger settles only when all mapped native discussion tasks settle or reach the visible bound. Retrying delivery changes no identity. |
| Handoff | `pending → admitted → settled`; pending/admitted → cancelled; admission rejection → rejected. Target failure records a terminal outcome; no hidden same-turn retry. |
| Artifact | pending → ready/failed; ready → deleted. A new version is a new immutable revision. Late bytes from cancelled work remain quarantined pending cleanup; they do not become visible results. |

Goal transitions are serialized with expected revision; only the responsible agent or authenticated
owner can change lifecycle. Peer results are evidence submissions, not competing goal writers.
Responsible-agent removal blocks its goals and increments goal generations; reassignment is explicit,
revision-checked and within the same scope. Old triggers are cancelled, not retargeted silently.

Every claim, tool authorization and publication checks authority epoch, lease epoch/expiry, run cancel
generation, thread cancel generation, goal generation/status, live agent/membership/capabilities and
context generation. Snapshot configuration controls reproducibility, but revoked capabilities always
win. Adding capabilities applies to future runs; it does not broaden an old run's snapshot. Removing
a capability increments access generation and cancels stale work. Credential deletion immediately
denies new credential resolution; already-dispatched effects cannot be undone by a local fence.

`run.cancel` fences that run and its causal continuations/handoffs; it does not stop unrelated goals.
`thread.stop` fences the current discussion and its descendants; a later user input starts fresh work.
`goal.pause/stop` fences every linked run/descendant/trigger across sessions before dispatching native
cancels. The fence takes effect at commit, even if native cancellation delivery is delayed. An action
authorized/dispatched before that commit may finish; its receipt is retained without stale output or
new descendants. Resume/reopen creates new-generation triggers, never revives old receipts.
No stale lease can publish a successful terminal result after cancel; cancellation is itself durable.

Store minimum-generation tombstones and compact operation/source-key receipts for the lifetime of
the entity/partition, including archives. Event/large payload retention may be shortened only after a
durable snapshot/checkpoint; compact dedup keys and terminal fences survive. Account deletion must
disable ingress and remove credentials before partition erasure; old deliveries cannot bootstrap it.
No finite TTL silently permits re-admission of old accepted operations.

## Transactions and restart reconciliation

Within a domain `BEGIN IMMEDIATE` transaction: validate current authorization/revision/fences; check
command or source identity/digest; write entity changes, messages, trigger/handoff/run admission,
receipt, events and runtime outbox records; commit before acknowledging. No model, network, object
upload or native helper that opens its own connection runs inside this transaction.
More precisely, after authenticating ownership, look up command identity/digest before evaluating
mutable revision/fence preconditions: a committed duplicate returns its original receipt even if the
entity has since stopped. It does not authorize new work or reveal now-revoked content. A fresh command
must pass current preconditions; rejected command outcomes are also recorded for deterministic retry.

The same database filename does not make two native helper calls atomic. The authority's native
bridge delivers persisted outbox operations with deterministic native event/task/card identities,
reads existing native receipts after uncertain responses, then commits inbox mapping and product
events. Native result publication and product projection may be separate commits. Reconcile by
native receipt and watermark, never by rerunning the model. Suppress overlapping native cron/goal
paths for mapped work. This bridge is part of the gateway authority, not another scheduler.

If a native operation has no stable deduplication or queryable receipt (including archived Kanban
create keys), the adapter must add a durable operation receipt at that native write boundary or
leave it indeterminate; it cannot infer success/absence from a missing active card and recreate it.
Native execution must pass current domain fences even when an old outbox record was delivered.
Publication rechecks fences after native completion. These are NMA-006/010/014 acceptance gates.

| Crash/race boundary | Required recovery |
| --- | --- |
| Before domain commit | Nothing accepted; same command may be retried. |
| After commit, before HTTP response | Same command/digest returns stored receipt and entity IDs; no duplicate message/run/goal. |
| Outbox delivered, native ack lost | Query deterministic native receipt; consume once. Missing/unqueryable outcome stays recovering/indeterminate, not blind resend. |
| Native result committed, product event absent | Ingest native receipt once, validate fences, append product result once; no model replay. |
| Projection applied, checkpoint not advanced | Both must be one PostgreSQL transaction; rollback together or repeat idempotently. |
| Goal stop races with wake/handoff | Serial transaction order determines admission; committed new generation blocks claim/tool/publication of every older descendant. |
| Member/credential revoked before queued claim | Live check cancels stale run with `ACCESS_REVOKED`; cached snapshot cannot override. |
| External effect dispatched, receipt absent | Query provider using persisted idempotency key; absent reliable reconciliation marks indeterminate. Do not blind retry. |
| Stop after external dispatch | Retain eventual effect receipt for audit; suppress stale conversation publication/continuation. |

For external effects: commit `prepared` intent and stable provider key, commit `dispatching` before
dispatch, then record `confirmed` or `failed`. A crash in dispatching is potentially indeterminate,
including the conservative case where no request actually left the process. No exactly-once promise
without provider support. A human/model claim is not an authoritative provider receipt.

Projection delivery uses engine events as the durable outbox. The API consumer upserts by event ID
and advances only contiguous checkpoints in the same PostgreSQL transaction; duplicates with a
different digest are integrity errors. Restore/rebuild never resets engine counters or generations.
An older backup cannot be activated against newer live native/effect state without quarantine and
reconciliation. Stream incarnation changes force client resnapshot, not reuse of an old cursor.

## Source identities and native mapping

Canonical source keys encode typed tuples without delimiter ambiguity; use canonical JSON arrays
of strings and SHA-256 when a bounded native key is needed. Retain the tuple and payload digest.

| Kind | Identity tuple after owner partition |
| --- | --- |
| `user_message` | thread ID, caller request key |
| `schedule` | definition ID, definition revision, intended UTC occurrence |
| `webhook` | route ID, provider, provider delivery ID; reject missing ID unless route defines a stable digest identity |
| `heartbeat` | watch ID, watch revision, intended tick |
| `continuation` | parent terminal event ID, goal ID, goal generation |
| `handoff` | discussion ID, source message ID, target agent ID, native task ID |

Coalesce only pending compatible events with identical owner/thread/target/goal generation/entity
key and source policy. Persist deadline, all contributor IDs, chosen payload and supersession links
before ack. Restart resumes that deadline; an admitted unit cannot be replaced by a newer payload.
No entity key means no coalescing. Recurrence, timezone/DST and missed occurrence behavior are
explicit schedule definition fields to be implemented/tested in NMA-015, not inferred from arrival time.

One native profile mapping per stable agent/config revision, one session binding per scoped thread
context as above. A canonical group maps to a native room; each native discussion/task maps to a
product trigger/run. DM is not silently modeled as an invalid one-member canonical group. Native
session goals/cards map through `nma_goal_units`; no shared `/goal` slot overwrites product goals.
Group routing preserves NMA-004: roster order, sequential turns, native rotating later rounds,
2–6 agents, 3 rounds, 10 member messages, explicit bound/idle/failure outcomes. Invalid explicit
handles are rejected before durable user-message admission; an unmentioned message uses the native
first-round policy. Later rounds require unaddressed peer mentions. A bound is not goal completion.

## API and event contract

Public namespace `/api/agent-engine/v1` is disjoint from legacy routes. This is a contract, not
registered routes in this task. All mutations use `POST /commands` with the envelope below; reads
use `GET /agents`, `/threads`, `/threads/{id}/snapshot`, `/goals`, `/goals/{id}`, `/runs/{id}`,
`/commands/{command_id}`, `/artifacts/{id}`, and `/artifacts/{id}/revisions/{revision_id}/download`.
Lists are owner-authorized and cursor-paginated; engine-tool reads are additionally scope-filtered.
Never expose credentials, native paths, provider tokens or private memory in general projections.

Command fields: `schema_version`, `command_id` (UUID), `type`, `expected_revision` (decimal string or
null for creation), `payload`. The API inserts trusted actor/owner into the internal envelope.
Unknown fields/types/versions are rejected, not silently dropped. Hash the canonical validated body;
same command ID with different body yields conflict even if an entity was archived.

| Command | Payload and expected revision |
| --- | --- |
| `agent.create` / `agent.configure` | name/handle/config; configure also agent ID and current agent revision. |
| `agent.disable` / `agent.archive` / `agent.restore` | agent ID, current agent revision; restore selects active or disabled explicitly. |
| `thread.create` | kind, title, agent IDs; null revision; server inserts sole owner. |
| `thread.set_members` | thread ID, ordered agent IDs; current thread revision; no humans accepted. |
| `thread.archive` / `thread.restore` | thread ID and current thread revision. |
| `message.send` | thread ID, text/authorized attachment IDs, request key, expected membership revision; null entity revision. |
| `run.cancel` / `thread.stop` | target ID, optional reason; null revision so stale UI cannot prevent stop. Operation remains idempotent and checks live identity. |
| `goal.create` / `goal.update` | scoped objective/responsible agent/provenance; create null, update current goal revision. Native agent tools call the same authority, without an activation form. |
| `goal.wait` / `goal.block` / `goal.complete` | goal ID, wake condition/reason/evidence IDs respectively; current goal revision. |
| `goal.pause` / `goal.stop` | goal ID, optional reason, null revision; stop acts on current generation. |
| `goal.resume` / `goal.reopen` | goal ID, current goal revision, source message provenance; explicit owner intent required. |
| `goal.submit_evidence` | goal ID, source message or artifact revision, criterion/summary; current goal revision; peer submission cannot complete. |
| `scope.share` / `scope.revoke` | selected source revision, target thread and user-message provenance; revoke names grant with current revision. |

Runtime-only commands (`trigger.accept`, `handoff.admit`, tool effect receipts and artifact publication)
are not browser-callable. Bound agent tools can create/update goals and evidence but cannot impersonate
another agent or manufacture source messages. User-created controls remain optional; ordinary
conversation/tool capture is the default mechanism.

Successful new asynchronous work returns `202` only after the engine's durable admission receipt;
successful immediate mutations and duplicate commands return `200`. Receipt fields: command ID,
`status: accepted`, result IDs/revisions, `committed_seq`. This is not run success. A stored rejection
replays the same error. `503 ENGINE_UNAVAILABLE` does not claim admission; transport timeout is an
unknown admission outcome and the client retries/queries the same command ID. No API-only queued
success or legacy fallback. Authentication `401`, scope `404`, invalid input/mention `422`, revision
or idempotency mismatch `409`, schema unsupported `426`. Errors use
`{code,message,retryable,command_id,details}`; details contain no cross-owner data. Revision conflicts
include current revision only after authorization. Reload and make a new semantic command; do not
rewrite a stored accepted operation.

Events use `{schema_version,event_id,seq,occurred_at,type,thread_id,run_id,goal_id,agent_id,payload}`;
nullable scope IDs are explicit. Domain types: `agent.changed`, `thread.changed`, `message.created`,
`run.accepted`, `run.started`, `run.delta`, `run.cancelled`, `run.recovering`, `run.indeterminate`,
`run.completed`, `run.failed`, `goal.changed`, `trigger.changed`, `handoff.changed`, `artifact.ready`,
`artifact.failed`, `scope.revoked`, `discussion.settled`. Terminal payload carries outcome, reason,
author identity and committed message/artifact IDs where applicable. Discussion reasons include
`idle`, `bounded`, `stopped`, `failed`; bounds never auto-complete a goal. Quiet progress can emit
goal/run events without a user-facing message. Usage attributes run/agent/goal with decimal totals.

`GET /events?thread_id=...` streams SSE, with `Last-Event-ID` an opaque cursor encoding partition,
stream incarnation and decimal sequence. It is authorization-checked, never trusted for owner scope.
Persist each emitted delta before sending; final `message.created` replaces the run draft by ID,
not appends a duplicate. The snapshot contains committed messages, runs, goals and `through_cursor`
from one consistent projection transaction. Replay strictly after that cursor; duplicate event IDs
are ignored. Partition sequence gaps from thread filtering are legal; projection checkpoints still
advance from the unfiltered contiguous source stream. Retained cursor replays without execution.
Expired cursor returns `410 CURSOR_EXPIRED` with snapshot URL; wrong incarnation requires reset;
future cursor returns `409 CURSOR_AHEAD`. Unknown event version requires resnapshot/upgrade,
not silent reduction. Stop/cancel receipt may precede its projection; UI follows committed sequence.

## Schema and migration delivery plan

1. NMA-006 introduces owner-partition bootstrap, service authentication, version negotiation,
   `nma_schema_migrations`, domain command/event/outbox foundations and isolated native mapping.
   Pin upstream commit/runtime lock and verify journal mode, crash behavior and volume ownership.
   New migrations are checksum-versioned and additive; no upstream DDL is rewritten implicitly.
2. NMA-007–010 add agent/config/capability/memory/run tables and constraints above with each slice.
   Add PostgreSQL `nma` projection schema through the next free Alembic revision after the then-current
   head (currently 0021). Do not renumber/reset existing migrations. Runtime service is sole writer of
   authoritative domain rows; projection role cannot mutate legacy execution or engine state.
3. NMA-013–018 add goal/generation/evidence, trigger/coalescing and membership/handoff contracts.
   Migration tests must prove duplicate keys, owner mismatches, invalid states, stale revisions and
   crash rollback are rejected using actual SQLite/PostgreSQL stores, not an in-memory model only.
4. NMA-021/022 add delivery/artifact integration and object publication reconciliation; NMA-023
   verifies tenant/member/credential revocation; NMA-024 adds redacted telemetry; NMA-025 exercises
   the full crash/stop/offline matrix. Read-path indexes cover owner/thread/sequence, pending trigger
   deadline, run lease expiry, goal/status and pending outbox identity. Do not scan all payload blobs.
5. Before each upgrade: stop admission, fence and drain/quarantine active work, back up SQLite plus
   native stores/object manifest and PostgreSQL checkpoint, test restore, then migrate under exclusive
   ownership. Unsupported newer schema refuses startup; downgrade never drops new work to fit old
   code. If interrupted, transaction rollback or recorded migration checksum determines safe resume.
6. NMA-026 owns legacy mapping/cutover/rollback. Preserve accounts, old profiles/transcripts/goals,
   memory exclusions, files, schedules and effect receipts. No bulk activation of old proposals, no
   converting LangGraph checkpoints to Hermes sessions, no sharing old/new browser control, no
   resetting dedup identities. Rollback fences new admissions and preserves new data read-only when
   no reverse mapping exists. This ticket applies no database or data migration.

## Acceptance review and limitations

[Payload examples and review cases](evidence/nma-005/contract-examples.json) cover DM admission,
automatic goal capture, revision conflict, stop/late wake, duplicate after restart, group handoff,
revocation, uncertain effects, artifact scope and SSE reset. They are illustrative contract cases,
not executed HTTP/native integration tests. [Verification](evidence/nma-005/verification.json)
records syntax/consistency checks, source hashes, documentation validation and preservation checks.

All seven requested entities, privacy/ownership, lifecycle/cancel/replay/API events and ADR-03 are
specified above. Author self-review checks each case against the one-owner design and source
constraints; no independent review is claimed. The storage partition, schema and API are technical
decisions delegated by NMA-005, not additional user product requirements. Production readiness
depends on downstream real-store/fault/isolation evidence; no application build or browser QA can
prove this documentation-only contract. No production code, migration, dependency or data changed.
