# NMA-013 — Conversational responsibility capture

Date: 2026-10-24. Authority: [ticket](https://app.notion.com/p/402abdd61873812c8616d9ec122471e9),
[product goals](https://app.notion.com/p/402abdd6187381018df4cf984901016a),
[ADR-02](nma-004-engine-integration-adrs.md) and [ADR-03](nma-005-domain-contract.md).
NMA-002, NMA-009 and NMA-011 were read live and all are Done.

## Implementation

The ordinary Hermes model turn receives a `responsibility` tool and its own current
thread/agent goals, including stopped identities. It decides whether to create,
correct, reuse, inspect or stop a responsibility. There is no separate classifier,
mandatory command/form/approval, initiative score or second execution owner.

The tool is installed through the pinned native registry and definition seam, with
dispatch under the existing execution stamp. Product scope is mandatory. Server
binding supplies owner, responsible agent, thread, source user message and source
run; the model cannot select those identities. Retrieval does not carry goals into
another DM, even when the agent is the same. Session/config replacement preserves
the home-thread goals. The authenticated owner's existing snapshot exposes them.

Migration 7 adds engine-owned `nma_goals`, `nma_goal_operations` and a scope index.
Each goal mutation, operation receipt, source-message provenance and `goal.changed`
event is one SQLite transaction under the native authority epoch. Corrections use
optimistic revisions and advance generations. A conflict requires fresh state,
not a blind overwrite. Original creation provenance stays immutable; operation
records identify later corrections and stops. Wire counters are decimal strings;
new goal timestamps use UTC RFC3339.

A stable creation key reuses the same identity even after stop and across new tool
calls. An exact tool operation replay returns its persisted receipt; changed payloads
conflict. Semantic equivalence under different creation keys remains model-dependent.
Stop increments generation and retains a tombstone; capture cannot reactivate it.
Cancelling a response prevents that stale run from mutating goals but does not stop
unrelated standing responsibilities. Local goal mutations bypass the external-effect
"dispatching" window: their effect and receipt commit atomically.

Snapshots and SSE expose consistent goal state and goal IDs through the existing DM
transport. No UI changes were made. Backend changes only preserve goal IDs in SSE.
No raw Kanban archive or independent dispatcher is used for product stop.

## Verification

Evidence and exact commands are in [verification.json](evidence/nma-013/verification.json).
The serial engine regression suite passed **60 tests**, with one opt-in live-provider
skip. The final focused goal/reliability run passed **20 tests** after the access-generation
review and crash-helper adjustment. HTTP boundary tests passed **9 tests**. `make check`,
engine Ruff/format, wheel/sdist packaging, documentation and Git whitespace checks passed.
The built wheel contains the exact goal source and excludes fault-injection tests.

- Real paid-provider evaluation sends all 16 unchanged spike dataset messages through
  authenticated HTTP DM ingress, the actual separate Hermes process/tool loop and
  real SQLite. Expected labels never enter model input. Four spike sessions map to
  four native sessions in **one home DM**, with three configuration replacements and
  process restarts; ADR-03 does not permit private goal inheritance into another DM.
- Both complete dataset passes matched all 16 operation/count/identity/requirement
  expectations: four goals, two corrections, two targeted stops, nine non-mutating
  turns. No false capture or duplicate was observed in this dataset. This small,
  synthetic evaluation is not a population reliability estimate or a semantic guarantee.
  The final pass used the final implementation and includes native session IDs and
  persisted tool receipts; all source-message receipts were independently checked.
  Final model: `gpt-6.1-sol`. [Dataset summary](evidence/nma-013/dataset-summary.json).
- Deterministic tests cover create/correct/repeat/stop, exact provenance, revision
  conflicts, stopped-key replay, foreign-thread/agent denial, same-agent DM isolation,
  spoofed scope arguments, atomic rollback, operation replay/conflict, cancelled-run
  refusal, SIGKILL before/after commit, predecessor upgrade and real HTTP/SSE state.
- Fault recovery must preserve either zero or one complete goal/receipt/event bundle;
  retrying message admission must not make another model call. A native run killed
  after claim may remain indeterminate; retained goals do not imply run completion.

The first live harness run passed five cases before an invalid agent-list request
(missing required limit) stopped session replacement. The corrected complete run
used a fresh disposable partition; the partial evidence is retained. Other initial
fixture corrections covered Hermes's legitimate merging of consecutive user turns
and native DM request identity. Concurrent runtime suites collided with Hermes's
host-wide owner lock; final runtime acceptance is executed serially. An initial
backend lint failure was a line-length issue, corrected before final checks.
An intermediate external-effect fault test observed a confirmed receipt where its
post-effect kill expected an indeterminate receipt. The serial full rerun passed.
The test-only crash helper now cannot return to a transaction after sending SIGKILL
while host signal delivery is pending; focused goal/reliability checks cover this
stronger injection boundary. No production external-effect retry logic was changed.

## Provenance and review

Hermes remains pinned to `7489b22af47ce91b366dde81d5831ea422577498` (MIT), unchanged.
`tools/registry.py`, `model_tools.py`, native execution policy and gateway seams are
already fail-closed hashed in `runtime-pin.json`. The session goals source and Kanban
reference were read from that exact local checkout. Kanban's ordinary-agent tools
are the reference for the responsibility interface; the new product schema,
capture instructions, authorization and mutation receipts are Ngertiin-authored.
No upstream source was copied, patched or dependency added. Source/evidence hashes
in the manifest identify the working-tree implementation; no commit or push is implied.

Author self-review checks transactional boundaries, immutable provenance, scoped
state, cancellation/epoch/config checks, malformed inputs, unchanged predecessor
checksums, source pinning and separation from future lifecycle work. Review also retained
snapshot semantics: a non-revoking configuration revision does not invalidate an
admitted run; access generations and committed cancellation fences still do. No independent
reviewer was delegated.

## Operations and remaining scope

See [engine operations](../../apps/engine/README.md#conversational-responsibility-capture-nma-013)
for backup, exclusive-owner upgrade, schema checks and complete-volume rollback.
All migrations and fault tests use disposable partitions. No production database,
deployment, user content or legacy goal state was changed.

This delivers capture/update/stop state, not a complete proactive goal engine.
NMA-014 still owns Kanban execution-unit mapping, descendant/trigger cancellation,
wait/progress/evidence/completion, resume/reopen and continuation. NMA-015/016 own
scheduled/event wakes; group responsibilities are downstream. Only active/stopped
states are implemented here. Production proactive acceptance remains gated by those
lifecycle and recovery obligations. A goal is not proof that external work was done.

Current context retrieval loads the complete scoped goal set; large-scale goal
pagination/compaction is not established. This ticket does not claim Linux acceptance,
OS tenant isolation, external exactly-once delivery, browser UX acceptance or release
readiness. HTTP tests inject the account-authentication dependency in their disposable
backend; the production authentication implementation is unchanged.
