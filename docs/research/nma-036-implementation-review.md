# NMA-036 independent implementation verification

Date: 28 October 2026.

Verdict: **Review — two reproduced defects prevent unconditional local feature acceptance.**
The live Notion ticket is Done; this review does not change its properties or overwrite
historical delivery evidence. Production implementation files remain unchanged.

## Authority and scope

Read live: [NMA-036](https://app.notion.com/p/404abdd618738132a4f8d201e8919d96),
[primary specification](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a),
[automatic goals](https://app.notion.com/p/402abdd6187381018df4cf984901016a),
[adoption plan](https://app.notion.com/p/404abdd6187381d48e0cf27220703a95), and
[NMA-028 baseline](https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1).
All eight native prerequisites were fetched and are Done in their declared scopes:
NMA-029, NMA-031, NMA-034, NMA-035, NMA-014, NMA-015, NMA-016 and NMA-021.
Historical partial entries do not override their later closure evidence.

Knowledge-graph tools were unavailable in this session. Local source inspection covered
goal capture/lifecycle/reviews, continuation, scheduling, script execution, process waits,
provider binding, delegation fences, delivery, migrations and the goal disclosure UI.

## P2: Scheduled model selection is lost on continuation

Location: `apps/engine/src/ngertiin_engine/goal_continuation.py:231`.

The first scheduled run uses `automation.job_binding`, including its owner-local model
selection and job context. When that run records `continue`, `settle_unit` builds a fresh
binding from the persistent agent configuration. It does not carry the occurrence's
job binding into the linked run. The adapter's prepared-automation preservation branch
cannot recover settings that are absent from that new binding.

A real gateway reproduction schedules a job on a second controlled provider, then asks
that job to continue. The first run reaches the selected provider, but its linked run
reaches the primary provider: primary request count increases from 4 to 6. No user
message or configuration change intervenes. Existing test coverage checks only the
first scheduled run, so it does not detect this regression.

This violates unit 2's job-specific model/context contract for multi-step scheduled work.
It can silently change provider, model behavior and cost. Preserve the occurrence's
selected configuration across continuation and applicable process/delegation resumes,
while retaining live scope/grant reauthorization. Verify at least two linked runs,
restart and route revocation; do not merely assert the first provider request.

Reproduction: `evidence/nma-036-review/test_job_continuation.py`.
Result: **1 failed**, 14.98 seconds; `job-continuation.log` retains the assertion.

## P2: Restart can publish a silent script result

Location: `apps/engine/src/ngertiin_engine/automation.py:298`.

Presentation checks the last value in the `outputs` dictionary instead of selecting
the final configured step by ID. While a fresh execution preserves insertion order,
outputs are durably stored using canonical JSON with sorted keys. After a crash that
occurs after all outputs commit but before settlement, reloaded dictionary order is
lexical, not execution order.

A real native Docker chain runs `z_first` with visible intermediate output followed by
`a_final` returning exactly `[SILENT]`. A test-only launcher sends SIGKILL immediately
after the final output checkpoint. On restart the job completes, but checks `z_first`
and publishes a message: the conversation unread count increases from 3 to 4. The
fault marker proves the crash boundary was reached. No production code is patched.
The converse ordering can also suppress a relevant final result if the lexically last
intermediate output is silent; that direction is a source-derived consequence, not a
separately executed case.

This violates unit 2's silent-turn and restart-safe web-delivery acceptance. Resolve
presentation from `configuration.steps[-1].id`, retaining the same occurrence identity,
outputs and atomic publication receipt. Test both silent-final and visible-final chains
with deliberately nonlexical step IDs across this checkpoint.

Reproduction: `evidence/nma-036-review/test_silent_restart.py`, with
`output_checkpoint_launcher.py`. Result: **1 failed**, 24.13 seconds;
`silent-restart.log` retains the assertion.

## Acceptance coverage

| Contract | Assessment |
| --- | --- |
| Conversational capture/correction/deduplication | Implemented; retained six-case real-provider cohort includes longitudinal intent/correction/restart/stop. |
| Interrupted multistep goal and lineage | Implemented and covered by lifecycle/delegation/recovery regression; job-specific route fidelity has the defect above. |
| Actual subgoal evidence and native judge | Implemented with same-goal/generation evidence, successful producer checks, contract digest and persisted outcomes. |
| Stop fences schedules, peers and children | Covered by goal/delegation/collaboration/wake/webhook restart tests. |
| Calendar/DST, missed ticks, signed duplicate webhook | Implemented using existing gateway authority and durable occurrence mapping. |
| Script chains, durable dependencies and usage | Native Docker execution and lost-effect-checkpoint recovery covered; diagnostics declare zero inference calls. |
| Pause/resume and one scheduler | Existing gateway tick/outbox owns admission; no second native cron or Kanban dispatcher registered. |
| Offline result delivery and silent turns | Closure/reopen and ordinary silent cases covered; output-checkpoint restart violates silence as reproduced above. |
| Provenance and preservation | Additive schemas 19/20; retained migration/rollback and source hashes checked; fresh migration/restore coverage included. |
| Minimal authenticated product UI | Retained actual Clerk development-session evidence inspected and hash-verified; not freshly rerun. |

## Fresh verification

- Affected runtime regression: **64 passed, zero skipped**, 456.75 seconds, including
  native Docker effects, calendar/automation, judge/evidence, child/peer cancellation,
  signed webhooks, three Chromium closure/reopen cases and migration/rollback.
- Independent adversarial reproductions: **2 attempted, 2 failed** as detailed above.
  These are separate invocations, not included in the 64-test passing denominator.
- `make check`: passed (web lint/typecheck and backend lint/format/mypy).
- Engine Ruff: passed.
- Runtime pin verification: passed on Python 3.14.9 / SQLite 3.53.1; all **171** pinned
  source hashes match. All **21** historical DDL modules equal the baseline commit.
- All three fresh browser closure records report **zero browser requests while closed**.

## Verification boundary

The original manifest's **182 source/test/evidence files match their recorded SHA-256**.
This establishes correspondence with the retained evidence, not correctness by itself.
The retained final real-provider cohort reports **6/6**, exact OpenRouter OAuth
`openai/gpt-6-luna`; it was inspected, not rerun. Authenticated desktop/mobile UI evidence
uses a controlled model, separate from that provider cohort. The fresh browser tests use
the disclosed closure/reopen snapshot harness, not authenticated end-to-end product UI.

The earlier broad run remains 266 passed / 38 skipped / 1 failed, before final source.
Its denominator is not pooled with the final affected regression or these reproductions.
NMA-028's 99-cell baseline remains 70 successful tasks, 20 failed tasks and nine verified
stops. No new release reliability or latency percentile claim is made. NMA-039/NMA-027
retain representative reliability and deployment gates.

Fresh regression and static results are recorded in `evidence/nma-036-review/verification.json`.
The two reproduction failures are product findings, not infrastructure skips. Only new
review artifacts were authored; existing source, evidence and unrelated `docs/agent.pen`
work were preserved. No original-account migration, commit, push or deployment occurred.
