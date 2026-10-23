# Automatic goal capture: discovery spike

Date: 2026-10-23. Scope: [NMA-002](https://app.notion.com/p/402abdd61873815a9b15c67cea3e2ad6).
Authority: [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a),
particularly [automatic goals](https://app.notion.com/p/402abdd6187381018df4cf984901016a).

## Outcome

A small Ngertiin-authored capture prompt plus adapter can turn ordinary conversation into
persistent Hermes Kanban tasks, update the same identity across sessions and avoid duplicate
responsibilities on this dataset. **16/16 real-model cases passed**. This is evidence of a viable
capture mechanism, not proof that Hermes natively implements the complete Ngertiin goal product.

The important finding is that Hermes already exposes a chat-capable multi-task primitive through
Kanban. `/goal` alone is the wrong abstraction for many standing responsibilities across conversations.
The Kanban primitive still has incompatible stop/replay semantics: archiving a parent releases its
children, and its idempotency key no longer prevents re-creation after archive. Both were executed
against unmodified upstream, not inferred only from comments.

The spike acceptance is complete. Review here means author self-review of source, model decisions,
mutation effects, isolation of experiment output and disclosed failures; no independent review is
claimed. Production choices remain ADR input for NMA-004 and domain design in NMA-005.

## Evidence and acceptance

| Acceptance | Executed evidence | Result |
| --- | --- | --- |
| Real intent, hypothetical, correction, duplication, stop | 16 bilingual cases; real `gpt-6.1-sol`, 16 requests, 10,901 total tokens | Passed |
| `/goal` versus multi-goal gap explained | Native goal replacement, empty fresh session, explicit migration and Kanban multi-task persistence | Reproduced |
| Sourced minimal recommendation, no new policy gate | Existing Kanban APIs plus explicit capture prompt; no score or universal approval | Documented below |
| Cross-session evidence | 16 fresh OS processes, 4 session IDs, transcript reset at each session boundary, persisted snapshot equality | Passed |

[Dataset](../../scripts/spikes/goal_capture/dataset.json),
[prompt](../../scripts/spikes/goal_capture/prompt.md),
[reproduction](../../scripts/spikes/goal_capture/README.md),
[real-model results](evidence/nma-002/results.json),
[summary](evidence/nma-002/summary.json),
[boundary write](evidence/nma-002/boundary-write.json),
[boundary restart](evidence/nma-002/boundary-read.json),
[upstream test log](evidence/nma-002/upstream-tests.log),
[verification](evidence/nma-002/verification.txt),
[provenance](evidence/nma-002/provenance.json).

## Source audit

All Hermes links below pin commit `7489b22af47ce91b366dde81d5831ea422577498`.
All 20,787 regular files in the reused source checkout matched the verified archive. No upstream
patch was applied. The current runtime reports CPython 3.14.9 on macOS arm64; the earlier runtime
spike's bootstrap description is not the installed interpreter identity for this run.

- [Persistent Goals](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/goals.md): explicitly separates one session goal from the many-task Kanban board. Setting `/goal` does not create cards or fan out to other profiles.
- [Goal command](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/goal_command.py): `_set` calls `GoalManager.set`; draft constructs a completion contract after an explicit command, not an autonomous conversational capture mechanism.
- [Goal storage and loop](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/goals.py): session-keyed storage, `set`, pause/resume, explicit session migration, continue/wait/done/blocked judge and `run_kanban_goal_loop`. Setting another objective replaces the prior state. Migration is best-effort and not a multi-goal ownership contract.
- [Gateway continuation](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/run_goals.py): continuation ownership remains a runtime concern. This capture prototype does not add a second scheduler.
- [Kanban chat enablement](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/kanban.md): explicitly describes enabling the `kanban` toolset on a chat profile and agent `kanban_create` calls with origin completion/block subscriptions. Tool availability alone does not prove correct intent recognition.
- [Native tool implementation](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/kanban_tools.py) and [schemas](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/kanban_tools_schemas.py): create/list/show/comment and worker lifecycle. The prototype's update/stop action interface is new adapter code, not a claim that these are existing native tools.
- [Kanban database](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/hermes_cli/kanban_db.py): actual create/edit/archive/list APIs used in the experiment. `goal_mode` belongs to each card, not a replacement for a durable product-level goal with many runs.

Muse's [observed Goals UI](https://app.notion.com/p/3feabdd6187381da8a92d4243d0b1303) supplies experience
context, not its private capture algorithm. The ordinary-conversation requirement comes from the
pivot decision; the historical UI audit did not complete the create-goal flow. No private Muse
algorithm is claimed or copied.

## Experiment and results

The standalone model receives the prompt, current stored tasks (including archived tombstones),
same-session dialogue and current user message. Expected operations are withheld. Its JSON actions
are executed against real upstream SQLite APIs, with no hardcoded intent matching or approval step.
This is a direct SDK experiment, **not a Hermes agent-loop/tool-call or gateway E2E test**.

Cases cover: hypothetical planning; an actual fuel-report commitment; Friday-to-Monday correction;
restatement; a separate onboarding responsibility; a fresh-session scope correction; paraphrased
duplication; stop-current-response only; stop-one-goal; status enquiry after restart; quoted task
examples; negation; ambiguous stop; targeted stop clarification; two simultaneous new commitments;
and a hypothetical frequency change that must leave the monthly requirement unchanged.

The saved decisions were reviewed: requirements stayed consistent, correction reused the same task,
stop affected only its target, and ambiguous stop asked for clarification. The independent verifier
checked unchanged peers, ready status for creation, archived status for stops, no revival, origin
session preservation, and distinct process IDs. A fresh conversation receives board state but no
prior-session transcript. This tests one synthetic owner/agent only; it does not authorize cross-scope
retrieval or show that a group can receive private DM content.

Native boundary experiment: **15/15 assertions confirmed observed behavior** across two processes:

- Setting a second session goal replaces the first; an unrelated session sees no goal.
- Explicit migration transfers the objective and clears the original row. Pausing survives process
  restart and produces no continuation prompt.
- Same-key delivery before archive resolves to the existing card.
- An incomplete parent keeps a child in `todo`; archiving that parent promotes the child to `ready`.
- Reusing the creation key after archive creates another card; archived state and released child
  state both survive restart.

The last two observations are **product gaps**, not passing Ngertiin cancellation behavior.
No live worker was active, so worker termination, in-flight races and external effects remain untested.

## Failures and limitations

1. The first harness attempt passed the hypothetical case, then failed because `create_task` accepts
   `initial_status` values `running` or `blocked`, not `ready`. The adapter was corrected to use the
   upstream default; upstream resolves an ungated task to `ready`. The failed attempt is retained in
   [initial-harness-failure.log](evidence/nma-002/initial-harness-failure.log). The complete successful
   run used a new disposable directory; no result was silently retried.
2. Selected upstream suite: **223 passed, 1 skipped, 1 failed** across four files. Goal tests: 42;
   shared command dispatch: 74; Kanban tools: 54; Kanban DB: 53 pass, 1 skip, 1 failure.
   `test_infrastructure_spawn_refusal_never_charges_the_card` assumes systemd behavior without
   setting the Linux branch. On this macOS host,
   [process_registry.py](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/tools/process_registry.py)
   returns `in_process` at `_IS_LINUX == False`; the test's deliberate `AssertionError("unreachable")`
   becomes an ordinary spawn failure and auto-blocks the card. This source-based diagnosis is not a
   Linux verification result. Do not report the suite as green or production infrastructure as tested.
3. One model run over a small, synthetic dataset is not a reliability estimate. Semantic deduplication
   remains model-dependent; transport deduplication is a different contract. No adversarial injection,
   concurrent capture, crash-mid-transaction, schema-validation recovery or model-failure recovery tested.
4. Multi-action mutations are sequential, not one atomic transaction. Per-message decisions are not
   durably admitted before model invocation. A replay may reinterpret state. This deliberately small
   adapter must not be installed as a production mutation path.
5. A stored `goal_mode` card does not prove execution, wait/wake, evidence-backed completion,
   scheduling, user-offline work or notification delivery. Those flows were not started.
6. Card origin currently records session identity; turn-level goal provenance, revision history,
   ownership, group scoping and tenant authorization remain domain work. The JSON record supplies
   turn provenance for the experiment only. Existing dependency/license caveats from NMA-001 remain.

## Recommendation for ADR-02 / NMA-004

**Candidate, not a final integration decision:** expose narrowly scoped responsibility tools to the
normal agent turn, adapting existing Kanban task creation/list/update primitives. Let the agent choose
capture or revision from conversation and retrieved authorized responsibility state. Use stable IDs
and source-message provenance; do not introduce a second classifier service, initiative score or
mandatory confirmation gate. The JSON classifier here is an experimental stand-in for that normal
agent tool choice, not a proposed extra production orchestrator.

Keep one execution/session/recovery owner selected by NMA-004. Explore a product goal pointing to
one or more executable cards/runs; use Hermes goal continuation within the selected execution unit.
Do not force one product goal into one conversation-session `/goal` slot. Compare this against a
service adapter without simultaneously enabling an independent Ngertiin scheduler.

Before adopting the mapping, resolve these concrete contracts:

- Stop/pause must fence future goal-owned work and stale triggers, including descendants, without
  releasing them as archive currently does. Preserve cancellation tombstones. This is the documented
  user-control/reliability requirement, not an initiative policy.
- Delivery deduplication must survive terminal state and use server-derived identity; semantic
  repetition should resolve against the existing goal. Replayed create must not resurrect stopped work.
- Capture/update needs atomic admission, revision/ownership checks and replayable source-message
  provenance. Corrections must not reset execution progress accidentally.
- Bind retrieval and mutations to authorized owner/agent/thread/group scope on the server; do not
  broadcast private memory or the entire board as the prototype does for a single synthetic owner.
- Exercise the selected adapter in the actual runtime: model tool choice, active-run interruption,
  stop versus pause, wait/resume, crash recovery, durable triggers and completion evidence.

NMA-005 owns final field/table/status choices. NMA-013 owns production capture; this spike supplies
its dataset and the observed risks. No final schema, routing policy or new scheduler was installed.

## Provenance and review

Ngertiin authored `scripts/spikes/goal_capture/` and this report. Hermes modules are imported from
the pinned external checkout, not copied into application code. Root MIT attribution is retained in
[HERMES-LICENSE.txt](evidence/nma-002/HERMES-LICENSE.txt). See NMA-001 for distribution notices and
its unresolved optional/binary packaging findings; this spike does not clear those dependencies.

Verification covers Python lint/format, shell syntax, evidence checks, source archive comparison,
selected upstream tests with disclosed failure, documentation links and Git whitespace. No UX changed;
browser walkthrough is not applicable. No application database, production runtime or user data was changed.
