# Persistent goal lifecycle and continuation

Date: 2026-10-24. Authority: [NMA-014](https://app.notion.com/p/402abdd6187381d2aa04e0511efc53b8),
[product goals](https://app.notion.com/p/402abdd6187381018df4cf984901016a), and ADR-02/03 in
[NMA-004](https://app.notion.com/p/402abdd6187381d49323cc471a97d2bf) and
[NMA-005](https://app.notion.com/p/402abdd61873818abd30d42ac276b671).
NMA-010 and NMA-013 were read live and verified Done before implementation.

## Delivered behavior

The ordinary Hermes agent uses the responsibility tool to create/correct a goal and
choose continue, wait, block or evidence-based completion in the same conversation.
There is no activation form or approval step. Capture alone is not a promise of
execution: the tool prompt explicitly requires the agent to choose its next action.
Semantic selection remains model-dependent; deterministic transport receipts do not
make model interpretation infallible.

A goal retains its identity across multiple native runs and session replacements.
Capture/correction runs and subsequent work are mapped in `nma_goal_units`. Progress
increments revisions; objective changes, pause/stop, resume/reopen and completion
advance generations. A stopped creation key remains reserved. Pause/stop controls
are revision-independent; resume/reopen require a current revision and real user
message provenance. Autonomous continuations cannot impersonate a new user or
reopen paused/stopped goals. Their tools are restricted to their own goal.

Waiting persists a wake condition and does not call the model again. A fresh user
resume, or correction followed by continue, can start new work. A blocked decision,
provider failure, indeterminate outcome or missing continuation decision is visible;
none creates an automatic semantic retry. Recurring schedules, timed wakes,
heartbeat and webhooks remain NMA-015/016. No initiative score or new work budget is
introduced. Agent disable/archive blocks nonterminal, unpaused goals and invalidates
old work; restore does not silently resume them.

Completion requires accepted evidence from a persisted, nonempty agent result
message in the same thread, produced by the responsible agent in a successful,
uncancelled run linked to this goal generation. The responsible agent supplies the
criterion and summary, then completes with stored evidence IDs. Empty, invented,
stale-generation and cross-scope evidence is rejected. This is result-message
provenance plus agent acceptance, not an independent correctness oracle. Ready
artifact evidence and peer submissions remain their downstream slices.

## Execution authority and native mapping

All lifecycle writes and cancellation fences use the existing gateway's epoch-fenced
SQLite transaction writer. A gateway-owned reconciliation task consumes native
terminal receipts; it does not run models or own a second executor. Successful
continue decisions create a durable runtime outbox command and next unit in the
same transaction as parent settlement. Its identity includes the parent terminal
event, goal ID and generation. Retries reconcile that identity through Hermes
session admission, reservation, leases and recovery.

The bridge creates a native Kanban card for each autonomous unit and maps it to the
native session admission. Cards are parked (`blocked`) bookkeeping records with
no dependency edges and no Kanban-dispatcher activation. Their status does not
represent product goal status or completion. This is the minimal Ngertiin adaptation
of the selected Kanban mapping while keeping the already-integrated native session
queue as executor. It does not activate `run_kanban_goal_loop` or the shared DM
`/goal` slot. Native `run_goals.py` supplies the post-turn/admission reference;
Ngertiin's responsible-agent tool supplies the multi-goal decision instead of an
additional auxiliary judge.

Native card writes are separate transactions. A stable creation key is looked up
including archived cards, under the native writer transaction, before nested
`create_task`. Thus an ack lost after card commit finds the original card and does
not rely on native non-archived-only deduplication. Root-unit/card/native-admission
receipts remain inspectable. Complete-partition backup must include the Kanban DB.

Pause/stop commits generation changes and cancels linked pending/active units before
native interrupt delivery. User message admission also suppresses not-yet-created
continuations from prior turns. `run.cancel` closes its causal continuation chain,
including when its original run has already finished, without stopping other goals.
Existing execution, tool and publication fences reject late results. A native run
that recovered unknown **and already has a durable cancel fence** is abandoned via
Hermes `resolve_unknown`; it is never requeued. Uncancelled unknown work and external
effect receipts retain their existing indeterminate handling.

Synthetic continuation prompts are not stored as user messages. Results retain the
responsible agent and home thread. Snapshot/SSE expose goal state, units, progress,
wake conditions and evidence. Snapshots also include live continuation runs before
they have result messages, so reload restores streaming activity and run controls.
Optional HTTP controls expose pause/stop/resume/reopen,
and `GET /api/agent-engine/v1/goals/{id}` is owner-scoped. The DM surface shows a
compact goal disclosure with status, progress, wait condition and evidence links;
it is transparency, not activation. SSE merges revisions without creating phantom
runs, including decimal counters beyond JavaScript's safe integer range.

## Storage and operations

Migration 8 adds `nma_goal_lifecycle`, `nma_goal_units`, `nma_goal_evidence` and indexes.
It preserves migration 1–7 statements/checksums and all native tables. The original
capture table retains its historical active/stopped compatibility column; the
lifecycle extension is the effective status authority exposed by the goal read
model. No live tables are rebuilt or removed. Initial extension rows copy existing
capture status. Unit and evidence references use owner-bound composite foreign keys.

Stop ingress and the owner before upgrading. Back up the entire owner volume,
including root SQLite/WAL and `kanban/boards/nma-goal-units/`, configuration, registry
and secret references. Upgrade exclusively, verify schema/checksums and SQLite
integrity/foreign keys, then verify goal snapshots and event replay before reopening
ingress. Older binaries reject schema 8. Rollback preserves new state and restores an
isolated complete predecessor backup, never drops live lifecycle/evidence/receipts.

## Evidence and review

Acceptance maps to concrete checks: multistep/wait/failure/evidence transitions in
`test_multi_step_wait_evidence_complete_and_restore`, provider failure and missing
verdict tests; generation priority in active pause/stop and causal cancellation;
restart identity in crash-injection tests; progress in HTTP/SSE snapshots, reducer
replay and the desktop/mobile component walkthrough. The opt-in real-model test
covers automatic capture through accepted completion from one ordinary message.

The full engine regression passed 71 tests with two opt-in live tests skipped.
After the final snapshot adjustment, the lifecycle and DM suites passed 22 tests.
The web reducer passed 7 tests; the HTTP boundary passed 9. Type/lint checks,
web build, engine wheel/sdist build and documentation checks passed.

See [verification manifest](evidence/nma-014/verification.json) for commands, final
results and source/evidence hashes. The focused suite exercises multistep work,
wait/resume/reopen, evidence rejection/acceptance, provider failure, active pause,
causal cancel, no late result, native card identity, and SIGKILL before/after domain
commit, after card commit, after native admission and after pause commit before
interrupt delivery. The existing capture/reliability suites are retained.

The live HTTP test uses the configured real model, one ordinary user message and a
separate pinned Hermes process. It calculates 45 / 360 × 100 = 12.5 L/100 km, produces
a result, continues to verify its persisted message, accepts evidence and completes
without another user message. Restart preserves goal identity, evidence and transcript.
See [live state](evidence/nma-014/live-lifecycle.json) and
[live test log](evidence/nma-014/live-tests.log). This is a small synthetic acceptance
case, not a broad model reliability estimate. HTTP tests inject the account-auth
dependency; production authentication remains unchanged.

Browser walkthrough uses the actual production `GoalProgress` component and app CSS
with snapshots captured by the real-model HTTP test. Desktop/mobile disclosures and
result anchors were exercised in Chromium. This is an isolated component walkthrough,
not a new full authenticated DM or offline-notification end-to-end claim. The SSE
reducer has a separate replay regression. Downstream proactive-channel acceptance
remains NMA-021; group work remains NMA-017–020.

Initial failures are retained: a native board needed initialization; active pause
followed by SIGKILL exposed a cancelled unknown admission holding the FIFO; a real
provider emitted a null text delta; the model needed exact action-field instructions
and useful validation errors. An intermediate test process used old collected unit
counts while a source-run mapping was added; the clean final suite uses one consistent
source state. The old SSE assertion compared a capture event with later unit settlement;
it now compares stable identity/revision/provenance. Full-suite verification also exposed
predecessor migration fixtures that needed to remove the new extension tables in their
disposable databases, and a goal-context insertion that incorrectly included legacy
runtime submissions without user-message provenance. The context is now added only
for a DM user turn or an identified continuation. No failure is counted as a pass.

Author self-review covers atomic writes, owner/thread isolation, completion evidence,
generation fencing, user priority, restart deduplication, migration preservation and
UI replay. No independent review, Linux acceptance, deployment, production migration,
OS tenant isolation, external exactly-once guarantee, commit or push is claimed.
Goal retrieval still loads the full scoped set; large-history pagination/compaction
remains unproven. Existing upstream revision and MIT license are retained; source
hashes for the Kanban/goal seams were added to `runtime-pin.json`. No upstream source
patch, copied source module or new runtime dependency was added.
