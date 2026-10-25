# Tobi account setup and persistent conversations

The user authorized backend/engine implementation on 24 October 2026, then fixed the default name to **Tobi** and requested an initial greeting. The [product decision](https://app.notion.com/p/402abdd618738113aa55c1bd18e53144) and [implementation plan](https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f) remain the primary specifications. UI, routes, composer and sidebar changes are outside this delivery.

## Implemented behavior

- First verified Clerk API access atomically upserts the account and one PostgreSQL provisioning intent. Optional signed `user.created` webhook delivery uses the same operation. Duplicate webhook IDs carry a payload digest and cannot be reused for a different registration.
- A leased backend provisioning process reconciles account infrastructure. It creates/discovers the owner gateway, verifies the signed transport and requests one engine account setup operation. Lease generations fence stale completion; timeouts retry the same durable setup command. Authentication does not synchronously start or wait for an engine.
- New setup creates Tobi, its versioned generalist soul/configuration, its primary DM, and one authored welcome in the same SQLite transaction. All new agents receive their own primary DM and welcome. The message has `origin=welcome_template`, `template_version=1` and `run_id=null`; it is not represented as model work. No model, native session, goal, tool or resource call is needed to greet the user.
- `thread.create` for a DM reuses the primary thread even with a different command ID. Groups remain explicitly created, with no automatic greeting. Agent IDs and contexts are shared/scoped exactly as before.
- Bootstrap preserves an existing default-agent migration receipt, user customization and disabled/archived status. It does not rename an existing approved migrated persona to Tobi or recreate disabled assistants. Existing agents without DMs receive empty DMs during setup; backfill never inserts greetings into historical conversations.
- Compact conversation summaries expose current agent identity, last-message preview, activity, unread and availability. Thread reads and thread SSE do not mark anything read. Read watermarks only move forward; navigation updates are revision checked. Owner-bound summary replay is separate from thread-stream events.

## Storage and ownership

PostgreSQL migration `0022_account_provisioning` adds only operational setup intent and registration receipts. Engine schema 13 adds primary-DM mappings, setup identity, conversation read/activity state, navigation and welcome provenance. Old migration definitions and checksums are unchanged. Engine service preflight and predecessor migration fixtures understand version 13.

Hermes remains the only execution lifecycle authority. The new provisioner manages processes and setup receipts, not runs, sessions, schedules, cancellation or goal continuation. The engine remains authoritative for agent configuration and conversations; PostgreSQL setup results are operational status, not another writable agent store.

Welcome publication, primary mapping and agent creation share a transaction. Ordinary transcript publication also updates conversation activity/events in its transaction. Summaries use indexed bounded queries, return at most 50 rows and truncate preview text to 240 characters. Counter fields are decimal strings. User messages and transient tokens do not increase unread. Background SILENT replies remain suppressed by the existing delivery rule.

## Existing data and ambiguity

Migration infers a primary mapping only when an agent has exactly one existing DM. It never deletes or merges duplicate threads. Missing/ambiguous mappings are exposed by the internal `account.inventory` operation. Setup refuses ambiguity with `DM_RECONCILIATION_REQUIRED`; an operator supplies a frozen `account.reconcile` command bound to the inventory digest. Choosing a primary is a navigation mapping only: historical secondary threads, their reads, admitted work, goal homes, memory boundaries, artifacts and command receipts remain intact. Existing secondary admissions are preserved rather than introducing an unapproved shutdown policy.

Use `ngertiin.agent_engine.conversation_migration` for read-only inventory and explicit mapping application. A replay of an old accepted/rejected command retains its original result. After reconciliation, a new semantic command can observe the repaired mapping. The setup command itself does not permanently cache transient provisioning/configuration failure.

## API contract

All endpoints below use `/api/agent-engine/v1` and server-resolved account ownership.

| API | Contract |
| --- | --- |
| `GET /bootstrap` | Read operational setup or current engine default/navigation state. |
| `POST /bootstrap` | Ensure a durable request; 202 and Retry-After while pending, 200 when ready. |
| `POST /agents/{agent_id}/dm` | Versioned `thread.ensure_dm` command; return the primary thread. |
| `GET /conversations?after=...` | Compact DM/group summaries, cursor and initial replay watermark. |
| `GET /conversations/events` | SSE using the owner-scoped conversation cursor. |
| `POST /commands` with `thread.mark_read` | Valid existing message sequence; monotonic update. |
| `POST /commands` with `thread.open` | Thread ID and expected navigation revision, initially `1`. |

Existing `/threads`, snapshot, message.send, cancellation and thread SSE contracts remain. `primary_dm_thread_id` is additive on agent responses. Welcome messages are included in real snapshots and replay; regression test helpers explicitly separate them when asserting run-produced transcript behavior. The new welcome tests use unfiltered actual snapshots.

For pagination, retain the first-page `through_cursor` while fetching later pages, then replay summary changes and deduplicate by thread ID. A moving conversation may cross a page boundary; replay covers changes after that watermark. Secondary historical DMs remain available through `/threads`; summary events include `is_primary=false` for them. The UI implementation consuming this contract is deferred.

## Operations and rollout

1. Apply the additive PostgreSQL migration before deploying the new authentication dependency (`make migrate`).
2. Stop admission and take a consistent owner-partition backup before upgrading existing gateways. Test restore using the existing backup/quarantine procedure.
3. Configure the default model and explicit grants; do not derive the default from dictionary order. New local Tobi instances get tasks/files and browser only when E2B is configured. Existing grants are never retemplated by login.
4. Start `ngertiin.agent_engine.provisioner`. `make dev` uses this process automatically instead of a static owner allowlist. Existing registry mappings are preserved; concurrent publication is locked and atomic. Owner processes retain private keys, state and native authority locks.
5. Inspect bootstrap status and reconcile ambiguous mappings before releasing those accounts. Use `provisioner --retry UUID` after correcting an operator error; it will not bypass a live lease or restore quarantine.

Production requires an operator-owned `NMA_PARTITION_DRIVER` argv implementing idempotent isolated process/container provisioning and returning the existing socket/key mapping. Local process launch is prohibited in production. Deployment-specific isolation, capacity and driver validation remain the NMA-027 release gate. No deployment platform or production rollout is assumed in this implementation.

The registry is published only after a signed gateway handshake. Setup becomes ready only after the engine default/primary-DM state can be read. Previously registered missing state and restored partitions under quarantine require operator recovery; they are never silently replaced. Rollback uses the established isolated prior Git + verified backup approach and retains all post-upgrade receipts/data; no in-place schema downgrade is provided.

The registration endpoint uses the maintained Svix SDK with signature/timestamp verification, following [Clerk webhook guidance](https://clerk.com/docs/guides/development/webhooks/overview). Because webhook delivery is asynchronous, first authenticated access independently ensures the durable request.

## Verification

The final engine regression run passed **117 tests**, with **8 skipped** opt-in live-provider/computer/Chromium cases. The backend suite passed **14 tests**, including disposable PostgreSQL migrations, concurrent account upserts, signed/duplicate/unsigned webhook delivery, lease fencing, real gateway provisioning, restart identity preservation, restore quarantine and missing-state refusal. An additional focused run of default-model repair, handle collision and archived-default preservation passed.

Ruff lint and formatting passed; Mypy passed all 55 backend source files. Documentation validation passed 71 page hashes, 47 tickets, 4 views and 1,352 local links. `git diff --check` passed. The engine regression fixtures now distinguish authored welcomes from run-produced messages and deliberately construct historical secondary DMs where privacy tests require them; actual public snapshots retain welcomes.

Reproduction commands, test logs, limits and SHA-256 hashes are in [the evidence manifest](evidence/tobi-account-conversations/verification.json). Tests use disposable PostgreSQL databases and separately launched pinned Hermes gateways with synthetic provider credentials. No user database migration, real-account setup, deployment or UI walkthrough has been performed by this delivery. Production partition-driver isolation/capacity and real-account migration rehearsals remain release gates; these passing cases are not an exhaustive proof of every crash interleaving.
