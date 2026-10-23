# Engine integration and proactivity decisions

Date: 2026-10-23. Scope: [NMA-004](https://app.notion.com/p/402abdd6187381d49323cc471a97d2bf).
Authority: [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a), documents 01–08.

## Decision status and evidence

ADR-01, ADR-02, ADR-04 and ADR-05 below are technical decisions for the next implementation
slices, made within NMA-004's delegated architecture scope. They are not newly asserted user
requirements or claims of implemented behavior. ADR-03 (domain/schema/API) remains NMA-005;
ADR-06 (migration/cutover) remains NMA-026. No production runtime, data or dependency changes here.

All three native Depends on tickets were read live and are Done:

- [NMA-001](https://app.notion.com/p/402abdd61873811295d3fddfc040d720): [runtime audit](nma-001-hermes-runtime-audit.md), native two-profile real-model handoff, settled restart, duplicate receipt and follow-up. Prior suite: 324 passed, 6 skipped. Not an in-flight real-model recovery proof.
- [NMA-002](https://app.notion.com/p/402abdd61873815a9b15c67cea3e2ad6): [capture spike](nma-002-goal-capture-spike.md), 16 real-model cases over four sessions/fresh processes; 15 native boundary assertions. Prior suite: 223 passed, 1 skipped, 1 macOS/systemd failure. Direct SDK experiment, not native agent-loop capture.
- [NMA-003](https://app.notion.com/p/402abdd6187381d0b15bd7739ebb302e): [repository audit](nma-003-repository-reuse-audit.md), static coupling and preservation inventory at `0660ac5a4467ffb56481bdff5ea7a56c3c07c334`. No runtime isolation proof.

Hermes source throughout is pinned to `7489b22af47ce91b366dde81d5831ea422577498`, root MIT.
Relevant source links are included in each ADR. Knowledge-graph tools were unavailable in this
session; direct inspection of the existing pinned checkout was the fallback. No upstream code is
copied. Prior spike results are reused evidence, not rerun live-model claims.

## ADR-01 — Separate Hermes service; one lifecycle authority

**Problem.** The current API/worker embeds legacy chat/task execution and recovery. Embedding the
upstream Python runtime there would combine incompatible lifecycle and dependency assumptions.

**Sources and experiment.** NMA-001 exercised the native service without upstream patches;
NMA-003 traced legacy `chat.store.submit`, `tasks.creation.create`, worker registration and recovery.
[Canonical groups](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/apps/desktop/docs/canonical-groups.md),
[hosted driver](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_driver.py),
[room log](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_rooms.py).

**Options.** Embed in the existing backend: rejected for this baseline because Python compatibility,
global/profile context and shutdown ownership have no acceptance evidence. Copy selected runtime
modules: rejected as the initial integration because it requires re-proving transactions, authority,
receipts and recovery together. Separate pinned service: selected because it preserves the tested
native path and isolates dependency/process ownership. This is not a whole-app fork.

**Decision.** Use `apps/engine/src/ngertiin_engine/` as the separately packaged integration service
boundary, with its own runtime lock and entry point. The Hermes gateway authority inside that
service is the sole pivot session/run/scheduling/cancellation/recovery owner. Ngertiin extensions
for domain commands, durable ingress and goal control execute within that authority; they are not
an independent orchestrator polling or restarting Hermes from outside. Worker/profile processes
are subordinate executors, not additional lifecycle owners.

The product API authenticates account identity, forwards scoped commands with stable identities,
and serves projections/events. It must not start models, retry semantic work with a new identity,
write runtime terminal state, or call legacy execution/recovery for pivot runs. A transport retry
resends the same command. API projections are reconstructable copies, never competing authorities.
Product configuration can be authoritative outside the runtime; its revision is bound to each run.
NMA-005 must define the durable handshake for config/revocation and projection checkpoints.

Legacy execution remains owner of legacy work only. New and old run/trigger namespaces and
admission routes are disjoint. No pivot fallback to old hidden chat/task submission on engine error.
No Procrastinate/LangGraph/Rakazo/Nakama executor is added around the Hermes owner.

**Consequences and gates.** An extra service boundary requires authentication, health, versioned
commands, durable acknowledgements and recovery tests. Use owner-isolated runtime state and
server-side scope/credential resolution; profiles alone are not tenant isolation. Exact deployment
partition and storage layout are NMA-005/006/023 work, not a decision to share OS credentials.
NMA-006 must reconcile actor.profile wire validation, pin/test Python and SQLite (the spike used
DELETE fallback), and inventory the actual shipped dependencies/notices. The pillow-heif binary
notice and missing dependency notices remain packaging blockers, not cleared by root MIT.
Maintain a patch manifest (empty now); every future patch records source, reason and tests. Upgrades
must rerun the runtime/capture evidence and contract/recovery suites before replacing the pin.

## ADR-02 — Capture responsibilities in the ordinary agent turn

**Problem.** A product goal can survive many conversations and runs. Native `/goal` holds one
session objective and cannot represent the entire product board.

**Sources and experiment.** NMA-002's 16 cases establish feasibility, including correction, semantic
repetition, hypothetical intent, ambiguous stop and distinct goals. Native archive releases children,
and an archived creation key can be reused: neither is acceptable goal cancellation.
[Kanban tools](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/kanban_tools.py),
[Kanban persistence](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/kanban_db.py),
[chat enablement](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/kanban.md),
[session goals](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/goals.py).

**Options and decision.** Reject a mandatory form or `/goal` command (contradicts product), reject
one session goal as the multi-goal store (proven cardinality gap), and reject a separate classifier
service/initiative score (unnecessary second decision path). Select ordinary agent responsibility
tools backed by engine-owned domain mutations, using the Kanban primitives as the sourced execution
mapping. The capture prompt/tool adapter is explicitly Ngertiin-authored adaptation.

A durable product goal has stable identity, responsible agent and authorized scope, source-message
provenance, revision, progress/evidence and links to execution units. It can link multiple cards/runs;
a card's Hermes goal loop controls only its execution unit. Conversation session replacement must
not erase the product goal. Native Kanban state is not the authoritative product stop state.

Retrieve only goals accessible to the acting agent in this thread. Let the model select create,
update, complete, wait or stop from ordinary conversation. Repetition updates/reuses the existing
identity; a hypothetical need not create work. An ambiguous target may be clarified conversationally;
this is not universal confirmation. Completion requires recorded evidence, not merely a successful
model response. Peer completion reports go to the responsible agent through the same authority.

Commit each mutation with source run/message, operation deduplication and expected goal revision.
A crash/retry reuses the recorded decision/result; it must not reinterpret the same accepted operation
into another goal. Concurrent correction conflicts reload current state rather than blindly overwrite.
Semantic deduplication remains model-dependent and is distinct from transport idempotency.

Goal stop/pause commits a durable generation fence before cancelling associated execution, descendant
work and triggers. Each admission, tool boundary and publication rechecks the fence. Preserve stopped
identities and operation receipts across archive. Pause can resume explicitly with a new generation;
stop cannot be revived by old deliveries. A new user instruction may explicitly reopen work through
a new generation with provenance. Cancelling one response suppresses that run's continuations, but
does not silently cancel unrelated goals. Never use raw archive as stop or release children on stop.

**Consequences and blockers.** NMA-005 defines final schema and atomic boundaries; NMA-013 must run
capture in the actual Hermes tool loop; NMA-014 must implement persistent lifecycle/descendant fences.
Production automatic capture is blocked until atomic mutation/replay, scoped retrieval, terminal
receipts, active stop and evidence completion are verified. The spike's sequential JSON adapter is
not production code. This answers the mechanism gap without claiming native Hermes/Muse parity.

## ADR-04 — Canonical deterministic group discussion

**Problem.** Several persistent agents need real handoff without user routing or an independent
room scheduler. Default broadcast and numerical limits were previously undecided.

**Sources and experiment.** [Discussion policy](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_discussion.py)
(`resolve_mentions`, `plan_next_task`, `_unaddressed_member_mentions`, `_pending_discussion`),
[policy tests](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tests/gateway/test_hosted_room_discussion.py)
and NMA-001's actual Researcher-to-Writer handoff. NMA-004 reruns policy/driver tests; this is fixture
coverage, not three-agent product E2E. Nakama remains UX/config inspiration, not queue authority.

**Options and decision.** Select native canonical policy rather than invent a leader/router or import
Nakama's process-local queue. No permanent group leader is required. A goal's responsible agent is
not automatically the next speaker for every group message.

- User message without a recognized mention: all current members are eligible in the first round,
  executed sequentially in stored roster order. This intentionally adopts native behavior for the
  first integration; it is not an assumption that every message wakes everyone indefinitely.
- One valid mention targets that member; multiple valid mentions target each distinct member in
  roster order, not text order. Native `@all`/`@everyone` explicitly select all. Invalid explicit
  target handles must be rejected by the command boundary, not silently treated as no mention and
  broadcast. This validation is an Ngertiin adapter requirement, not existing upstream behavior.
- Later rounds run only peers explicitly cited and not heard from since the citation; self-mention
  does not wake self. Native order rotates by round. A plain reply does not start another round.
  Only trusted member messages may create handoff work; quoted tool results are not control commands.
- Preserve deterministic discussion/task identities, terminal receipts and per-member watermarks.
  One next task is planned from durable state; reconcile publication before planning again.
- Adopt the tested upstream envelope of 2–6 agents, at most 3 rounds and 10 member messages per
  discussion for the initial canonical integration. These are explicit technical baseline choices,
  supported by native bounded-loop tests, not measured optimal UX limits or global goal budgets.
  Expose a bounded reason and unfinished work; do not mark the goal complete or silently start a new
  discussion just to evade the bound. Changing them requires source/identity and behavior review.
- Empty/PASS responses count as silence. A silent round settles; no pending user event is idle.
  Failure is recorded visibly and advances as silence, not an automatic same-turn retry loop.
  Deferred/indeterminate work keeps its identity and visible recovery state; no hidden fallback.
- Room stop durably fences older discussion work, cancels active/queued tasks and rejects late output.
  A later user message can begin a new discussion. Goal stop additionally applies ADR-02 across all
  linked discussions/triggers; room stop alone is not global goal stop. User input takes priority over
  automatic continuation; a newer same-thread input supersedes obsolete output under native policy.
- Freeze the authorized roster/config for deterministic reconstruction, but revalidate live membership,
  tools and credentials before execution/publication. Revocation overrides a stale snapshot; cancel
  stale work rather than grant old access. Runtime membership editing is not proven by the Desktop UI.

**Consequences.** NMA-017/018 implement authorization, invalid-handle validation, real handoff and
anti-loop acceptance; NMA-019 exposes bounded/idle/error/stop states; NMA-020 binds group goals to
one responsible agent. Private DM transcript is never copied into group context by default. A
persistent agent retains identity/config across channels while runtime sessions/context stay scoped.
The 3-agent complete-goal/wait/wake/fault scenario remains NMA-025 release evidence.

## ADR-05 — Durable triggers and honest side-effect recovery

**Problem.** A live gateway can wake work while the user is offline, but process-local buffering and
ordinary retries do not prove durable delivery or exactly-once external effects.

**Sources and experiment.** [Gateway continuation](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/run_goals.py)
prioritizes input and restores/scans watches; [webhook coalescer](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/platforms/webhook_coalesce.py)
uses in-memory pending/timer dictionaries. Native room receipts/restart were exercised in NMA-001;
NMA-002 proves archived-key deduplication is insufficient. No live cron/webhook/offline-goal E2E is
claimed. [Rakazo handoff](https://github.com/elie222/rakazo/blob/f6a1ef2229a81319a91758aa65fac97575215691/packages/adapters/src/group-handoff.ts)
and reconciler are historical transaction/recovery comparators from the reference register, not adopted code.

**Options and decision.** Reject a second Ngertiin scheduler feeding an independently scheduling
Hermes gateway. Reject treating raw webhook coalescing or Kanban archive receipts as sufficient.
Select a durable ingress/receipt extension owned by the same service authority as ADR-01. Hermes
continuation/cron/heartbeat/webhook mechanisms remain wake producers into that single admission
path; none may bypass goal fences or independently retry a run. Disable overlapping native paths
for the same execution unit when the mapped path is enabled.

Persist accepted trigger identity, authorized target, source payload/reference, intended time,
goal/config generation and receipt before acknowledging acceptance. A relay may durably store an
outbox command, but it cannot claim execution success before the owner receipt. Across stores,
use idempotent outbox/inbox delivery and reconciliation, not an imagined distributed transaction.
NMA-005 chooses physical storage and uniqueness; runtime stores remain under one writer authority.

Identity is source-specific: user request key within owner/thread; schedule definition revision plus
intended occurrence; webhook route/provider delivery ID; heartbeat watch plus tick; continuation
parent terminal event plus goal generation; handoff source message/task plus target. Retain terminal
receipts/tombstones through the retry horizon, and reject obsolete generations even after receipt
compaction. Timezone/recurrence and missed-occurrence policy must be explicit in NMA-015.

Persist coalescing keys and deadlines before acknowledgement; store all contributing event IDs and
which payload superseded which. Only merge compatible events for the same authorized target/entity
and generation. Restart restores the deadline and receipt chain. Unresolved keys do not merge unrelated
entities. Do not use the native in-memory buffer as the only record of accepted work.

The sole owner claims work with an epoch/lease fence, rechecks current goal/membership/capabilities,
and appends durable result/events before projections become visible. Retry transport and known
pre-execution failures with the same identity. Recover already-completed work by its receipt. For an
external action, persist intent and idempotency key before dispatch, then receipt/result after it.
If the worker dies between remote effect and receipt, reconcile with the provider; without a reliable
receipt/idempotency/query mechanism mark the effect indeterminate and do not blindly replay it.
User stop cannot undo an already dispatched effect; retain its eventual receipt without publishing
stale conversational output or scheduling descendants. No exactly-once external-effect promise.

Wait stores a wake condition and does not busy-loop. Heartbeats defer busy sessions; input/stop wins
against automatic work. Goal completion cancels outstanding wakes; blocked state records the cause.
Quiet progress and user-visible delivery are separate from permission to execute; notification
preferences do not become an initiative gate. Browser closure does not stop the service. Server
outage requires durable recovery, not a claim that work executes while infrastructure is down.

**Consequences and blockers.** NMA-010 owns receipts/fencing/recovery, NMA-014 goal fences, NMA-015
schedule/heartbeat, NMA-016 webhook/coalescing, NMA-018 handoff transactions and NMA-025 crash tests.
These extensions are specified, not present in unmodified upstream. Do not accept production proactive
work until crash-before/after-ack, stop race, duplicate delivery and unknown-effect tests pass.

## Architecture review traces

These are design walkthroughs against the source and spike receipts, not executed integrated traces.

### DM: user → selected agent → durable reply

1. API authenticates owner and DM agent, binds request identity and forwards to engine authority.
2. Owner commits admission and source message once; duplicate delivery returns the same receipt.
3. Owner binds agent/config revision and private session, checks live capabilities, then executes.
4. An optional responsibility tool commits goal mutation under the same owner (ADR-02).
5. Owner appends terminal result/events; API SSE projects them. Reconnect replays, never reruns.
6. Interrupt fences this run's output/continuation. Crash after commit but before API acknowledgement
   returns the old receipt. An unknown external effect follows ADR-05, not an unconditional retry.

Evidence: NMA-003 transport/legacy coupling review and NMA-002 capture feasibility. Missing: real
Ngertiin DM adapter and native tool-loop capture (NMA-006/010/011/013).

### Proactive goal: ordinary conversation → wait → wake while user offline

1. Agent captures responsibility with source-message provenance and stable goal identity.
2. Engine maps eligible execution units; one Hermes continuation owner drives them. Repeated
   conversation updates the goal instead of replacing a shared conversation `/goal` slot.
3. Wait persists its condition and trigger identity; closes no goal and schedules no busy-loop.
4. With the tab closed, the service durably accepts the schedule/event, checks revision/fences,
   executes and stores evidence; user-visible progress is delivered/replayed independently.
5. If stop races with wake, the committed generation fence invalidates queued descendants and
   stale publication. Restart/replay cannot recreate the stopped goal. Completion closes wakes.

Evidence: NMA-002 cross-session persistence and observed archive gaps; run_goals/coalescer source.
Missing: integrated wait/wake, offline execution and active cancellation (NMA-014/015/016/025).

### Group handoff: Researcher → Writer → Reviewer

1. Owner admits a user message mentioning Researcher with frozen roster and current authorization.
2. Researcher publishes an attributed message asking Writer; authority atomically records the
   source/target handoff identity and admits at most one corresponding peer task.
3. Writer receives authorized group delta, not private Researcher DM. Writer cites Reviewer;
   subsequent native round selects Reviewer. Responsible goal agent retains goal progress authority.
4. Crash after peer admission reuses its receipt; crash after publication replays the same events
   before next-task planning. Membership removal before claim cancels the stale target.
5. Stop fences the discussion; a ping-pong reaches an explicit native bound, not infinite work.
   Goal stop also fences future triggers; failures remain visible without hidden fallback.

Evidence: NMA-001 executed Researcher→Writer with real model and settled restart; current native
policy/driver tests cover bounded routing and receipt behavior. Reviewer, revocation and product
transactional handoff remain integration acceptance (NMA-017/018/020/025).

## Review outcome and downstream handoff

One owner survives all three traces: the engine service's Hermes gateway authority. Product API,
projections, domain tool adapters, wake producers and subordinate workers do not acquire another
execution/recovery loop. The key implementation risk is bypassing that boundary through native
Kanban/cron paths or legacy imports; adapter acceptance must explicitly detect those bypasses.

NMA-005 is unblocked for final domain contracts: close ADR-03, storage ownership/atomic boundaries,
agent/thread mapping, goal revisions/tombstones, trigger identities, command/event examples and
revocation propagation. It must preserve these decisions rather than assume they are implemented.
NMA-006 may proceed only after its existing NMA-005 dependency. Later ticket scopes retain the
acceptance obligations identified above; no dependency is removed and no implementation marked done.

## Verification and limitations

Acceptance review: all four requested ADRs contain problem, sources, options, spike evidence,
decision and consequences; single ownership is explicit; routing/anti-loop/stop are explicit;
automatic-goal mechanism is selected and production blockers are recorded. Review is author
self-review, not independent review. Documentation-only changes need no application build/browser
walkthrough; the architecture traces are not product runtime tests.

Current run: **90 native tests passed, 0 failed** (46 discussion, 44 driver). Documentation
validation passed (71 page hashes, 47 V1 tickets, 4 views, 1,254 local links); Git whitespace
passed. All 26 mapped upstream source hashes matched the prior pinned inventory; all 198 backend
modules and 21 migrations matched the NMA-003 inventory. These checks do not establish deployment
or end-to-end product readiness. Current-run commands/results and source hashes are recorded in
[evidence](evidence/nma-004/verification.json), with the [native test log](evidence/nma-004/upstream-tests.log).
The first test invocation supplied repository-prefixed paths to an upstream runner that changes cwd;
it exited with no tests discovered. The [failed invocation log](evidence/nma-004/initial-runner-path-error.log)
is retained; the corrected command uses upstream-relative paths. No test failure was suppressed.

The pre-existing NMA-003 report/inventory/index edits were preserved. This task adds this report,
its evidence and one research-index entry. No migration, dependency install, live-model call, deploy,
commit or push is claimed. Linux deployment, packaging clearance, tenant isolation and complete
three-agent goal/recovery E2E remain explicit implementation/release gates.
