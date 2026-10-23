# Repository reuse and new engine boundary audit

Date: 2026-10-23. Audited baseline: `0660ac5a4467ffb56481bdff5ea7a56c3c07c334`.
Scope: [NMA-003](https://app.notion.com/p/402abdd6187381d0b15bd7739ebb302e).

## Authority and outcome

The live [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a)
documents 01–08 and ticket were read for this audit. NMA-003 has no ticket dependencies.
Product decisions in documents 01–03 govern; document 04 remains a technical proposal.
[Implementation phases](https://app.notion.com/p/402abdd6187381ceaa4fe40ebf41001c)
require preserving the repository and building the replacement separately.

Keep account identity, visual primitives and selected infrastructure. Replace the execution and
conversation domain rather than treating the existing single-assistant workflow as the new engine.
E2B and artifact code are useful candidates, but their stores and lifecycle wrappers are coupled to
legacy tasks. They are not drop-in multi-agent services. No production code, dependency, data, provider
resource, migration or deployment was changed by this audit.

All classifications below are recommendations for NMA-004/005, not final integration decisions.
“Retire” means stop using a behavior for the new engine after acceptance and cutover; it does not
authorize deleting its code or historical data now. “Reuse” still requires boundary-specific tests.

## Source inventory and reuse matrix

Backend paths below are relative to `apps/backend/src/ngertiin/`; web paths are relative to
`apps/web/src/`. Symbols and paths refer to the audited baseline. Migration paths are relative to
`apps/backend/migrations/versions/`.

| Area | Observed source and contract | Recommendation | Required adaptation or proof |
| --- | --- | --- | --- |
| Authentication | `accounts/auth.py:current_account` validates Clerk session tokens and authorized parties; derives account from `sub`, never client owner ID. `models.py:Account` retains Clerk mapping. | Reuse account/auth boundary. | Preserve account UUIDs; add server-side agent, thread and membership authorization. Account authentication alone does not prove DM/group isolation. New or modified backend text must be English. |
| API composition | `api/app.py` imports every legacy domain router; startup calls `recovery.restore.ensure_released`. | Reuse HTTP conventions selectively; keep legacy composition intact. | Separate pivot routes/composition and preserve restore quarantine. Do not import the legacy app as an engine library. |
| Transport | `chat/api.py:events,event_subscription` replay persisted sequence events; a subscription does not execute a model. `chat/store.py:submit,append_event` implement request-key admission and ordered writes. | Reuse command/snapshot/replay pattern; replace DTOs and domain store. | Explicit agent/system authors, DM/group identity, membership recheck, multiple run representation and versioned event compatibility. Reconnect must not re-admit work. |
| Browser transport client | `features/chat/hooks/use-thread.ts` loads snapshot then connects SSE with token refresh. `features/chat/types.ts` has main/side threads, user/assistant roles, one `run`, numeric sequence. | Adapt transport mechanics, replace single-assistant assumptions. | New event reducer must handle agent authors and runs; explicitly decide safe sequence encoding beyond JS integer precision. Current numeric types are not BigInt-safe evidence. |
| Database foundation | `async_db.py`, `db.py`, `models.py`; 21 Alembic migrations from `0001_v1_baseline.py` through `0021_browser_metering.py`. | Reuse PostgreSQL/connectivity/migration discipline; add separate domain schema. | Do not reset baseline, renumber migrations, or infer schema solely from SQLModel: most product tables are raw migration SQL. Final table names and invariants belong to NMA-005. |
| Identity/persona | `persona/store.py:current` selects `agent_profiles` by owner; `0001_v1_baseline.py` makes owner the profile primary key. Revisions/proposals live in `0007_persona_revisions.py`. | Replace identity cardinality; reuse revision-history ideas and editor presentation. | Stable agent ID, per-agent configuration revision and lifecycle, same identity across DM/groups. Existing profile can seed one default agent, not every future agent. |
| Memory | `memory/recall.py:recall,bind_chat,bind_task` recalls by owner/generation; `0008_personal_memory.py` stores owner-scoped entries, evidence, suppressions and exclusions. | Replace scope resolution; assess reuse of provenance/invalidation mechanics. | Separate private agent memory, thread transcript and shared group context. Never feed owner-wide recall unchanged into every agent/group. Preserve corrections, deletion tombstones and source exclusions during migration/reindex. |
| Execution | `chat/runtime.py:build_agent,execute,run_turn` builds LangChain agents and per-run LangGraph checkpoints; `tasks/runtime.py` owns another task execution path. | Replace pivot execution with the single owner selected in NMA-004; retain legacy execution for legacy work. | Do not wrap Hermes in both existing run controllers. Reuse lease, cancellation and receipt concepts only with one lifecycle authority. |
| Queue/recovery | `worker/queue.py` assigns delivery to Procrastinate; `worker/__main__.py` imports all jobs and starts default/maintenance queues. `worker/tasks.py:recover_stalled_jobs` and `recovery/service.py:reconcile` dispatch legacy recovery. | Keep for legacy; select pivot delivery/recovery in ADR. | No shared run IDs, queue admission or competing recovery ownership. Module imports register jobs: importing the legacy worker is not a neutral utility reuse. |
| Goals | `goals/tools.py:preview_goal` only proposes; `goals/service.py` applies user decisions. `chat/runtime.py` explicitly disallows work merely because a goal was saved. `0009_personal_goals.py` binds goals to old threads and evidence to proposals/revisions. | Replace lifecycle/capture; retire mandatory proposal activation for pivot. | Automatic capture/update with provenance, durable goal identity and stop of related triggers. Existing evidence/history remain valuable data; they do not establish new goal authority. |
| Schedules/proactivity | `schedules/jobs.py`, `schedules/tools.py`, `proactivity/jobs.py`, `proactivity/policy.py` and `proactivity/delivery.py` implement legacy scheduling and ranked optional suggestions. | Replace trigger integration; retire suggestion ranking as a prerequisite for autonomous work. | Keep notification preference semantics distinct from permission to work. Do not transplant the V1 opt-in/reranking layer as a new universal initiative gate. Preserve schedule definitions and occurrence receipts. |
| E2B low-level operations | `e2b.py:find,attach,run`; `sandbox/e2b.py:E2BAdapter`; `computer/e2b.py:E2BComputer`. Dependency pinned `e2b==2.56.0` in `apps/backend/pyproject.toml`. Code uses protected ingress, bounded timeouts, resource metadata and explicit unknown outcomes. | Candidate reuse through a narrow infrastructure adapter. | Code sandbox is offline/ephemeral; browser retains disk and credentials. Revalidate templates, isolation and resume; no new provider calls were made. Existing TTL/allocation defaults are observations, not pivot product decisions. |
| Computer lifecycle | `computer/store.py:acquire,current` locks legacy tasks; sessions and viewer/control versions reference them. `0018_browser_provider_profiles.py` changes active workspace uniqueness to owner/provider. | Replace binding and lifecycle coordination, retain useful low-level actuators after review. | Define workspace sharing per agent/group, revoke credentials/tools/member before execution, serialize access and human takeover. One owner/provider workspace does not imply per-agent privacy. |
| Object storage | `storage.py` provides S3 operations and five-minute signed downloads; put/get/delete call `usage/storage.py` and therefore write accounting state. | Reuse S3 capability with explicit accounting boundary. | Not a pure byte utility: preserve key ownership/accounting or extract an adapter deliberately. Authorize artifact scope before signing; possession of a key is not authorization. |
| Files/artifacts | `files/results.py:bind,reserve,prepare,commit,detail` reserves manifests, publishes bytes then visibility; imports `tasks.store`, `chat.store`, sandbox outputs. `0003_product_files.py` ties result revisions to background tasks and result roots to chat threads. | Reuse immutable revision/hash/publication patterns; replace producer/scope binding. | New producing run/agent/thread provenance and authorized sharing. Never fabricate a legacy background task just to satisfy old foreign keys. Keep ready bytes and revision lineage. |
| Billing/usage | `billing/`, `quotas/`, `usage/` retain account-level financial and usage history; chat/storage adapters attach to legacy work. | Preserve account ledgers and billing; adapt new run metering separately. | NMA telemetry must attribute run/agent/goal without double charging or losing unknown reservations. No commercial policy change is implied. |
| UI primitives | `components/ui/`, theme, shell, authentication views; `features/files/static-html.ts` sanitizes previews with CSP, `features/files/components/text-preview.tsx` handles bounded previews. | Reuse visual tokens, primitives and preview safety behavior. | Browser acceptance after composition changes; old tests/screenshots are historical evidence only. Keep original downloadable bytes separate from sanitized presentation. |
| Product UI | `features/chat/types.ts`, persona surface, goals form/proposal/detail, task panels and computer hooks expect legacy DTOs. | Replace agent/DM/group composition and data adapters; reuse suitable display components. | Show author identity, membership, autonomous goal progress and stop. Forms may remain optional controls; they must not gate automatic goal creation. No multi-human invitations. |
| Historical docs and tools | V1 runtime docs, `scripts/inspect_*.py`, `docs/notion-manifest.json`, existing spike folders. | Retain as evidence; adapt only relevant assertions later. | V1 proposal-only tests are not pivot acceptance. `scripts/check_docs.py` validates the V1 mirror and links, not live NMA completion. |

## Concrete coupling traces

1. Text command: `chat.api.send` → `chat.store.submit` → `enqueue` → `chat.tasks` →
   `chat.runtime.run_turn`. File/code/browser input instead calls `tasks.creation.create`.
   Keeping the route unchanged would silently select the old engine for parts of a pivot conversation.
2. Chat publication: `chat.store.publish` checks lease and memory/resource validity, publishes messages
   and events, then touches memory/proactivity work. Reusing the function imports legacy follow-up
   behavior, not just SSE delivery.
3. Artifact publication: `files.results` → `tasks.store` plus legacy task/result foreign keys.
   Retain the bytes-before-visibility invariant, but design a new publisher boundary for pivot runs.
4. Browser acquisition: `computer.store.acquire` → `tasks.locked` → owner/provider workspace and
   task-bound sessions. The E2B SDK adapter is separable; the product lifecycle store is not.
5. Storage operation: `storage.put_object/get_object/delete_object` → `usage.storage.begin/finish`
   → account/compute ledger. A “shared storage” import can write to the database independently.

The [machine-readable inventory](evidence/nma-003-repository-audit.json) records SHA-256 for every
backend Python module and migration, and AST import edges including function-local imports.
It is static evidence, not a runtime call graph, deployed schema, or proof of isolation.
Knowledge-graph MCP tools were unavailable; direct file inspection was the documented fallback.

## Data impact and migration obligations

No migration is executed in this ticket. The following is input to ADR-03/06 and NMA-026, not an
approved migration algorithm. All existing data stays in place while replacement behavior is proven.

| Data | Preserve | Proposed transition and unresolved choice |
| --- | --- | --- |
| Accounts, subscriptions and ledgers | Account IDs, Clerk subjects, payment receipts, reservations and audit history. | Reference existing accounts; retain ledger continuity. Determine pivot work keys and accounting adapters without rewriting historical charges. |
| Profile and persona revisions | Current profile, full revisions and rejected proposals. | Deterministic mapping to one default persistent agent per legacy account; retain source mapping. Do not activate rejected proposals or clone the profile into all agents. |
| Threads/messages/events | Original IDs, ordering, roles, parts and run provenance. | Map main/side to private legacy conversations/default-agent DM only after explicit migration rules. Old assistant role cannot identify an arbitrary new agent. Preserve old sequence namespace; do not merge cursors across streams. |
| Active runs, tasks and checkpoints | Input snapshots, lease/cancel state, receipts, approvals, workflow version and unknown outcomes. | Drain under legacy owner or quarantine with visible status. LangGraph checkpoints are not Hermes sessions. Never replay uncertain external actions or migrate by changing a workflow version number. |
| Goals/evidence | Revisions, source references, status, criteria and historical evidence. | Bind explicit new owner agent/scope; preserve paused/completed/archived states. Do not bulk-activate old proposals. V1 pause only gates future admissions, so it cannot establish the new goal-stop contract. |
| Schedules/occurrences | Definition, timezone, intended time, revision, receipts and pause state. | Choose exactly one dispatcher per mapped schedule and dedup identity across cutover. Disable old admission before enabling replacement; preserve outcomes for already admitted work. |
| Memory | Evidence lineage, revisions, suppression/forget state and excluded sources. | Default to private legacy scope until mapping is agreed. Reindex with explicit scope; never copy all account memory into group context. |
| Files/results/objects | Object keys, immutable bytes, hashes, deletion state, manifests, producer history and all revisions. | Link via explicit legacy mapping or read-only legacy viewer until new producer/scope model exists. Avoid destructive FK changes. Reconcile incomplete uploads/publications before copying visibility. |
| Browser/session state | Resource identity, retained login state, control version, unknown steps and usage. | Never attach the same workspace to both executors. Revoke viewer/session access at handover and decide credential sharing explicitly; active login state is not generic group context. |

Cutover must stop new admission for a selected scope, drain or quarantine its work, record the last
event and side-effect receipts, then switch one writer. Rollback must first fence the new owner and
its triggers, preserve new messages/goals/artifacts and receipts, and expose them read-only if no
reverse mapping exists. Merely switching the UI back would lose visibility and risk duplicate work.
Existing `recovery/backup.py` and `recovery/restore.py` are useful references, but do not yet know new
engine state. Extend backup/restore coverage and test a disposable restore before any real cutover.

## Proposed separation location

Recommend `apps/engine/` as an independently packaged Python application with
`src/ngertiin_engine/` and its own entry point/dependency lock. The directory is a proposal and is
not created in this audit. It gives Hermes integration an isolated dependency/process boundary
without moving or renaming the current backend or forking an entire upstream product.

Keep `apps/backend/src/ngertiin/` as the existing product API and legacy owner until accepted
replacement slices are routed explicitly. A later `ngertiin/engine_gateway/` may handle authenticated
commands/projections only; it must not become another run controller. Exact service/embedded
integration remains NMA-004. If that ADR selects embedding, retain a separately packaged engine
boundary rather than placing it inside `chat/runtime.py` or `tasks/runtime.py`.

The engine package should own its domain/runtime adapter and the single chosen lifecycle authority.
Product integrations expose authenticated identity, scoped capabilities, artifact publication and
metering. They must not call legacy `submit`, `tasks.creation.create`, recovery registries or worker
startup for pivot runs. New domain storage should have a separate namespace selected in NMA-005;
use additive migrations, explicit mapping, and disjoint run/trigger ownership. This proposal does
not require a second database server or select a new scheduler.

Keep upstream experiments in `scripts/spikes/` and evidence in `docs/research/`; their virtualenvs,
fixtures and local profiles are not production modules. Keep reusable UI in `components/ui/`;
new agent/group features should use explicit new contracts rather than broadening old roles silently.
Extract genuinely shared infrastructure only when a replacement slice requires it, avoiding a
speculative shared framework. Any adopted upstream code needs pinned source, license/notices and
upgrade instructions. This audit copies no upstream code and changes no dependency.

## Verification, protection and acceptance

Initial `git status --short` was empty. The task writes only this audit, its JSON source inventory,
and the research index. No reset, stash, clean, checkout, migration, database query, provider mutation,
production process restart or mass deletion was performed. Existing source and migration hashes in
the inventory allow checking that those files remain unchanged. No commit or push is required to
preserve unrelated work; none is claimed here.

| Ticket acceptance | Evidence |
| --- | --- |
| Auth/transport/data/E2B/artifacts/UI inventory | Source matrix and coupling traces above; hashed AST/migration inventory. |
| Data impact recorded | Preservation/mapping table and cutover/rollback obligations. |
| Other working-tree work protected | Clean baseline; documentation-only exact paths; source hash comparison and final Git status. |
| Engine separation location proposed | Independent `apps/engine/src/ngertiin_engine/`, alternative embedding boundary and explicit ADR deferral. |

Verification: `python3 scripts/check_docs.py` passed (71 page hashes, 47 V1 tickets, four views,
1,247 local links); `git diff --check` passed; source-inventory hash comparison passed for all 198
backend modules and 21 migrations. Final changed paths were limited to the three audit documentation
files. Results are also recorded on the Notion ticket. Review
means author self-review against source and all four acceptance criteria; no independent review is
claimed. This is a completed static discovery audit, not a running engine, schema migration, browser
acceptance, live E2B retest, or production-readiness claim. No application test/build was needed for
documentation-only changes. Existing NMA-001/002 results were read as prior evidence, not rerun.

NMA-004 consumes these boundaries alongside the runtime and automatic-capture spikes; NMA-005
must settle identities/scopes/schema; NMA-026 must prove migration and rollback. Their unresolved
implementation decisions do not block the four static-audit deliverables and are not silently closed.
