# NMA-036 review repair and local acceptance closure

Date: 28 October 2026.

This delivery repairs the two independently reproduced findings and the additional
late-provider-receipt defect exposed during closure in
[nma-036-implementation-review.md](nma-036-implementation-review.md), under the unchanged
[NMA-036 contract](https://app.notion.com/p/404abdd618738132a4f8d201e8919d96).
The review, failed reproductions and original delivery remain historical evidence.

## Scheduled work retains its selected route

Generic goal continuation now reads the producing run's persisted automation selection
and applies it to a freshly authorized binding. Native process-wait resumption uses the
same helper. Selection comes from the original occurrence, not a mutable current schedule.
The current owner's model catalog and assigned skill grants are checked again; a removed
connection yields a truthful blocker instead of switching to the agent's default model.
Job context remains on each continuation prompt. Persistent agent configuration is unchanged.
Native child-result delivery already retains the parent's binding and its admission-time
scope checks; that path is preserved and covered by the existing delegation regression.

The new gateway regression checks two linked runs, job model/skill/context, unchanged
primary-provider request count, restart after continuation commit, connection revocation,
and process-receipt resume after restart. The process-routing case injects a scoped native
receipt fixture to isolate routing; it does not claim to launch a new background process.
The existing real native execution and delegation cohorts provide separate tool coverage.

## Script presentation follows configured execution order

The script executor now selects the final configured step's output by ID. It does not
infer execution order from a dictionary reloaded from canonical JSON. Output persistence,
operation IDs, occurrence IDs, zero-inference accounting and atomic transcript settlement
remain unchanged.

The regression runs native Docker chains with deliberately nonlexical step IDs. A test-only
launcher sends SIGKILL after all output checkpoints and before settlement. Both directions
are checked: a final `[SILENT]` creates no message/unread, and a visible final result after
a silent intermediate step creates exactly one message/unread. A second restart preserves
that result. The effect counter remains exactly one byte, proving the completed step was
not replayed. The earlier lost-effect-before-checkpoint test remains in the full regression.

## Cancellation retains the late provider receipt

The expanded regression exposed a third issue in the existing cancellation path. When a
cancelled native worker closed its HTTP connection, a `BrokenPipeError` during response
headers or body delivery escaped before the relay recorded provider usage. Content and
child publication stayed fenced, but the billing/audit receipt could disappear. The real
gateway child-cancellation test reproduced the missing receipt; four deterministic cases
also failed for JSON/SSE responses with disconnects at headers/body.

The relay now stops writes to the disconnected receiver while consuming the already
started upstream response under its existing timeout. It records the actual reported usage
once, without another provider request or renewed execution authority. Authentication,
revocation, cancellation and transcript gates are unchanged. Both disconnected-receiver
unit cases and the actual gateway cancellation case are included in final regression.

## Verification

Final counts and exact commands are retained in
[evidence/nma-036-closure/verification.json](evidence/nma-036-closure/verification.json).

The initial new-test invocation recorded four failures and two passes in 88.41 seconds.
All four failures occurred in the final agent-configuration assertion because the test
called nonexistent `agent.read`; routing assertions had already passed. The test now uses
the existing paginated `agent.list` contract. That raw attempt is retained in
`recovery-first.log`; it is not counted as a successful cohort.

The next combined run recorded **69 passed / 1 failed / zero skipped**, 531.72 seconds.
Its failure was the genuine missing late child-provider receipt described above. It is
retained in `regression.log`. The deterministic transport reproduction recorded **4 failed /
5 passed**, 0.22 seconds, before the repair; the transport tests plus the original real
gateway cancellation case then passed **10/10**, 4.93 seconds. No failed attempt is removed
or pooled with the final regression denominator.

The first closure real-provider cohort passed **6/6** on unchanged source before the
transport repair, with original credential journals unchanged. It is retained separately
under `live/`; the final-source cohort is `live-final/`.

The final-source six-case cohort records **5 passed / 1 failed**, not 6/6. The offline
model case created and scheduled the correct goal, but the model subsequently transposed
`4cd8` to `4c8d` within its goal UUID and repeatedly reused the nonexistent ID even after
`list` returned the correct value. The scoped tool correctly returned `NOT_FOUND`; the
one scheduled occurrence produced 437, but the goal truthfully blocked without a lifecycle
decision. This is retained as a model-argument/task failure, not a successful completion.
`offline-model-failure.json` records the actual native tool-call/result trace. The isolated
rerun in `live-offline/` uses the identical source, prompt, model and oracle; its denominator
is kept separate. No fuzzy goal matching, silent identity correction, alternate model or
threshold change was introduced to obtain a pass.

Static web/backend checks, engine Ruff, documentation integrity and package build pass.
All 88 Python/JSON wheel files equal checkout bytes. Runtime verification passes on Python
3.14.9 / SQLite 3.53.1, with all 171 pinned upstream seams matching Hermes
`7489b22af47ce91b366dde81d5831ea422577498`. All 21 historical DDL modules remain unchanged.
There is no new schema or migration in this repair; schema 20 and its existing rollback
contract remain in force.

The original manifest intentionally describes the pre-repair source. Four production modules, the provider transport tests and the fault-injection launcher
differ from the pre-repair source; original evidence files remain unchanged. Every
independent-review artifact remains byte-identical. The new regression is
`apps/engine/tests/test_automation_recovery.py`; its manifest records final source separately.

## Acceptance and release boundary

The original findings and the additional receipt defect are evaluated against the
final passing cohorts recorded in the verification manifest. Existing
capture, evidence/judge, calendar/DST, trigger deduplication, pause/stop, delegation, offline
web delivery, scope and preservation acceptance remain covered by the affected regression
and retained product evidence.

Authenticated production-component desktop/mobile UI was not rerun for this engine-only
repair. Its original actual-Clerk development-session evidence is preserved and hash-checked.
Fresh closure/reopen browser tests use the disclosed snapshot harness and controlled model.
The separate fresh real-model cohort uses exactly OpenRouter OAuth `openai/gpt-6-luna`.
These are complementary proofs, not a hosted end-to-end real-provider UI claim.

NMA-028's baseline and pre-registered release thresholds are unchanged: 99 cells comprising
70 successful tasks, 20 failed tasks and nine verified stops. Feature cohorts are not pooled
with that denominator or treated as a causal reliability comparison. NMA-039/NMA-027 still
own representative release reliability and deployment/operator acceptance.

No original user partition was migrated, no original gateway was restarted, and no commit,
push or deployment was performed. Unrelated `docs/agent.pen` and existing working-tree work
are preserved.

## Final closure results

- Final affected-runtime regression: **88 passed, zero failed, zero skipped**,
  602.94 seconds, including provider transport/connection protocols and the new recovery cases.
- Final-source real-provider cohort: **5/6 passed**, with the UUID transcription failure
  retained above; identical isolated offline rerun: **1/1 passed**, 43.168 seconds.
- All final cohort source guards pass; original credential journals remain byte-identical.
- The three final browser closure/reopen records show zero browser HTTP requests while closed.
- Original documentation/evidence: 77 files unchanged; independent-review evidence unchanged.

**Done for local feature acceptance.** The two independent-review findings and the additional
late-receipt defect are repaired. Successful oracles on final source cover every required
feature case; the failed model attempt remains a measured limitation, not a release-SLO pass.
