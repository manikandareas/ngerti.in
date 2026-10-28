# Automatic goals, verification and proactive automation

Status: **Done — locally implemented and verified on 28 October 2026.**

Authority: [NMA-036](https://app.notion.com/p/404abdd618738132a4f8d201e8919d96),
the primary specification, adoption contract and all eight Done predecessor tickets
read live on 28 October 2026. This report supersedes the earlier partial calendar-only
implementation report; its raw attempts remain retained.

## Delivered architecture

Product goal IDs, responsibility ownership, generations, stopped tombstones and
historical evidence remain authoritative. A shared DM/group native session never
receives several responsibilities in one session-global `/goal`. Execution units
retain their parked, idempotent native Kanban mappings; the native Kanban dispatcher
is not activated. Hermes gateway admission, session queues, authority epochs,
cancellation, receipt reconciliation and recovery retain one owner.

`goal_review.py` adapts native `GoalContract` and `judge_goal` to each product goal.
Optional outcome/verification/constraints/boundaries/stop_when fields and subgoal
criteria do not prevent ordinary work from starting. Criteria progress references
actual evidence from successful, uncancelled producing runs in the same goal
and generation. An optional `judge_required` completion contract requires a successful
review of the selected evidence and current contract. Reviews persist their verdict,
reason, parse/transport failures, source run, contract digest and evidence references.
Failed verification continues work or records a truthful blocker. The owner-local
`inference.auxiliary.goal_judge` route chooses the judge model; absence uses the
existing primary route.

Every work unit now exposes the actual persisted `result_message_id` and a bounded
preview. Complete results remain in the authorized transcript. This gives the model
stable output references after restart instead of requiring it to guess message IDs.
An unsettled result cannot be accepted as evidence. The agent continues once to let
that result settle. Judge context includes gateway-verified persistence/status facts
and identifies the current judge invocation, avoiding a circular prerequisite for
an earlier successful verdict from the same judge.

`process_waits.py` parks a responsibility on a native background process receipt
linked to one of its authorized producing runs. Completion creates one next unit
through the same durable outbox. Lost/unknown processes block instead of restarting.
Generation changes and user input fence stale continuations. Native process control
and observation remain the existing scoped execution service's responsibility.

Native temporary delegation owns the next goal wake while its batch is pending.
A child-result completion links every explicit goal assigned to its parent, without
opening access to unrelated responsibilities in the same conversation. Existing generic
turns drain before that completion is admitted. Settled parent evidence remains valid;
pausing, stopping or completing a goal fences its live children, peers and pending
completion batches, including descendant resume turns after restart.

The recall browse path found during live verification preserves its authorized SQL
views while removing only the pinned native table-index planner hints, which SQLite
cannot apply to TEMP views. It never substitutes unrestricted `main.messages`.

## Scheduling and automation

The existing responsibility tool supports `schedule`, `run_now`, `pause_schedule`,
`resume_schedule`, `blueprints`, and `instantiate_blueprint`. All mutations keep the
existing revision checks, live owner/thread/agent scope, generations and receipts.
Resuming a watch requires fresh user intent; stopped goals cannot be revived by a
watch, peer or child. Optional controls do not become an activation gate.

A calendar wake has the following shape:

```json
{
  "kind": "cron",
  "timezone": "Asia/Makassar",
  "missed_policy": "coalesce",
  "expression": "0 9 * * *",
  "job": {"mode": "model", "context": "Prepare the daily stock report"}
}
```

Once, elapsed interval and idle heartbeat definitions remain supported. Cron follows
the pinned Hermes wall-clock/fold algorithm with an explicit per-definition ZoneInfo,
without process-global timezone mutation. Daily local hours remain stable across DST.
A nonexistent spring wall time uses the native fold=0 interpretation, typically shifted
forward by the gap; a candidate must be strictly after admission. This does not promise
all occurrences in a repeated autumn hour. Missed ticks coalesce to one durable window,
retaining the original intended instant; the next occurrence is computed after admission.

A model job may select an owner-local `model`, assigned `skills`, and `context` without
editing the persistent agent. Selection cannot grant a new skill or another owner's
connection. Native model/session bindings freeze the selection and reauthorize it before
admission. `lifetime: session` limits recurrence to the current gateway authority epoch;
`durable` survives restart. Context reset and pause/stop also fence pending work.

Script-only chains use native terminal execution in the same scoped Linux worker:

```json
{
  "mode": "script",
  "steps": [
    {"id": "first", "command": "printf 41", "depends_on": []},
    {
      "id": "next",
      "command": "python -c 'import json,os; print(int(json.loads(os.environ[\"NMA_DEPENDENCY_RESULTS\"])[\"first\"][\"output\"])+1)'",
      "depends_on": ["first"]
    }
  ]
}
```

Dependencies reference earlier steps and consume their durable outputs through
`NMA_DEPENDENCY_RESULTS`. Each step has a stable operation identity derived from the
occurrence and step ID. Known native receipts recover without another effect when the
gateway dies before saving a step's output. Indeterminate effects block without blind
replay. Failed or stopped steps cannot start dependents or publish late output; an old
execution cannot overwrite the lifecycle of a replacement schedule.

The existing Hermes gateway tick owns these jobs. No new clock loop, service, cron
registration, Kanban dispatcher or alternative executor is introduced. Script jobs use
`automation.execute` receipts and native tool operations, with no model admission.
Diagnostics explicitly report zero inference calls and omit invented token/cost usage.
Terminal access is reauthorized against live capability snapshots and generations.

Native blueprint catalog/plugin definitions are listed and filled using their original
slot validator. Instantiation maps their prompt and calendar expression into the existing
watch path; the native job registrar is not called. Delivery targets other than `origin`
are unavailable. Optional UI is not required to instantiate an automation.

Webhook HMAC verification, native route filtering/entity resolution, durable batching and
idle heartbeat remain on their existing ingress paths. Schedule occurrences, webhook
batches and process-completion receipts all converge on the same goal-unit/outbox identity
mapping. Existing registrations/watermarks are retained; no second native/custom scheduler
runs over them.

Results publish atomically once to their home conversation through the existing transcript
receipt and unread/read-watermark machinery. Script stdout containing exactly `[SILENT]`
on the final step suppresses presentation while retaining outputs and execution receipts.
The web goal disclosure shows criteria/evidence, judge outcome, current schedule and next
local time. Progress, pause/resume and refresh remain ordinary conversation interactions.

## Provenance and data preservation

Hermes remains `7489b22af47ce91b366dde81d5831ea422577498`, MIT. The exact native
`hermes_cli/goals.py`, `cron/jobs.py`, blueprint catalog/plugins, recall query modules and
existing notices are covered by `runtime-pin.json`. No upstream source is edited.
The configured native Linux image remains
`sha256:6580374cc2db359e4db9723c7a1c679a6b609d1a0fa91b1432cd3df9096adb6d`.
Croniter remains 6.0.0 in the reviewed Python 3.14.9 runtime.

Additive schema 19 introduces per-goal contracts and reviews. Schema 20 introduces script
occurrences/outputs and process waits. Historical migrations 1–18 are unchanged. Existing
watch definitions and occurrence watermarks are not re-registered or fired during upgrade.
No original user partition is migrated by this delivery. Rollback remains an isolated
previous Git runtime plus a verified whole-partition backup; newer state is retained,
never downgraded in place or activated alongside an old executor.

## Verification ledger

Raw attempts, final logs, snapshots, source hashes and evidence hashes are retained under
[evidence/nma-036](evidence/nma-036/verification.json).

The final affected-runtime regression passes **64/64, zero skipped**, in 506.87s on
unchanged final runtime source. This includes native Docker terminal effects and
lost-checkpoint recovery, delegated-child/pause/stop lineage, optional contracts/native
judge, process receipts, DST/calendar controls, job-specific routes, blueprints,
script-only dependencies/usage, silent results, signed webhook deduplication,
three real Chromium closure/reopen cases (schedule/event/peer), and migration/rollback.
Each closed-browser interval has zero browser HTTP requests; the gateway persists the
result for reopening. That browser suite uses an explicitly labeled snapshot harness
and controlled model, separate from the authenticated production UI.

An earlier broad engine run attempted 305 collected cases: **266 passed, 38 explicitly
skipped, one failed**, in 1135.62s. Its failure was the late child-provider audit assertion;
functional stop/no-late-publication assertions had passed. The timing-sensitive receipt
check now waits for the actual audit event, and the final affected regression passes it.
The 38 opt-in skips include provider/browser/desktop/document/E2B/memory configurations;
three browser cases are freshly executed in the final 64, rather than counted as skipped.
This earlier broad run predates the final goal/delegation fixes and is not presented as
an all-green full-suite execution on final source.

An intermediate closure run was interrupted after 30 passes and four failures. It caught
an incomplete SQL-parameter edit in the pending-delegation guard and retained a missing
late-audit observation. Its raw log is preserved. The corrected final 64-case run is
separate; failed and interrupted attempts are never pooled into its pass count.

Static checks pass for the web lint/typecheck, backend lint/format/mypy and engine lint.
All 31 changed Python files pass formatting; an optional whole-engine format scan flags
one pre-existing, unchanged `plugins.py` file, retained without unrelated edits. The web
production build and 15 backend HTTP adapter tests pass. The final wheel's 88 Python/JSON
files equal checkout source bytes. All 21 predecessor DDL modules remain unchanged.
Schema 17→20 whole-partition restore and isolated previous-Git/schema-18 rollback preserve
nonempty history, stopped-goal identity, contracts, evidence, skills, files and receipts.

The first real-model cohort attempted all five cases: three passed; the subgoal and webhook
cases timed out while their work remained incomplete. It exposed missing result-message
references, premature waiting, circular judge context and the scoped recall browse index-hint
error. These attempts remain separate from subsequent cohorts. No unsuccessful attempt is
counted as a pass. Development predicate/schema-fixture failures and a briefly overlapping
initial calendar invocation remain retained as well.

NMA-028's baseline/thresholds remain unchanged. Small feature cohorts are not a causal paired
comparison or a release reliability sample. First-progress/recovery distributions that are
not measured remain unknown, never zero. Production deployment and representative release
reliability remain NMA-039/NMA-027.


## Baseline contract

The live NMA-028 closure remains a discovery baseline: its fixed 99-cell ChatGPT Luna
corpus has 70 successful tasks, 20 failed tasks and nine verified stops. Historical
raw scores remain 62 passed, 28 failed and nine stops. Separate corrected group
cohorts and feature cohorts are not substituted into those denominators.

The pre-registered release thresholds remain ≥95% task success, ≤2% integration
failure, p95 first progress ≤10s, settlement ≤180s and recovery ≤60s; the release corpus
permits zero observed duplicate effects, cross-scope leaks, stop violations or unresolved
effects. NMA-039 still owns ≥100 representative tasks per supported configuration.
NMA-036 records feature-case durations and actual side effects, rather than declaring
unmeasured first-progress/recovery distributions or a causal improvement over NMA-028.
The configured OpenRouter OAuth route uses exactly `openai/gpt-6-luna`; this is a separate
provider configuration from NMA-028's ChatGPT Responses cohort. No other model is
silently substituted.


## Acceptance evidence mapping

| Requirement | Retained evidence |
| --- | --- |
| Intent, hypothetical discussion, correction and deduplication across restart | Real-model longitudinal case; existing conversation idempotency tests |
| Interrupted multistep goal with explicit lineage | Goal lifecycle/review tests, native delegation continuation, offline model restart |
| Actual subgoal evidence and configurable native judge | `test_goal_review.py`; native subgoal/judge real-model case; authenticated UI evidence link |
| Stop fences schedules, peers and children after restart | `test_goal_delegation.py`, goal lifecycle/collaboration tests, scheduled cancellation and webhook fences |
| Calendar/DST, missed occurrences, webhook deduplication and restart | `test_calendar_wakes.py`, `test_wakes.py`, `test_webhooks.py`; real signed duplicate webhook |
| Script-only chains and accurate usage | Native Docker terminal chain; lost-output-checkpoint fault; zero-inference diagnostics; failed/stopped dependency tests |
| Pause/resume/run-now and one scheduler | Calendar control/idempotency, session lifetime, native blueprint mapping and shared gateway outbox tests |
| Persisted home results, silent turns and read state | Browser closure/reopen schedule/event/peer cases; silent-script unread assertion; actual-Clerk desktop/mobile UI |
| Provenance and preservation | Runtime pin check, wheel/source equality, unchanged historical DDL, schema 17→20 restore and previous Git/schema-18 rollback |

The authenticated UI uses actual ClerkJS development sessions with unmodified production
`current_account` and production DM components. Its model is controlled to exercise
repeatable criteria/judge and calendar interactions. The separate real-model cohort
uses signed gateway ingress. These are complementary proofs; neither claims a hosted
login deployment or end-to-end real-provider UI cohort. Evidence includes mouse/keyboard
operation, source-result navigation, desktop/mobile layouts without horizontal overflow,
chat pause/resume, reload persistence, invalid/missing-token denial, forged-header checks
and an unknown-goal 404. Disposable users and database were removed and absence verified.


## Final real-model acceptance

The final six-case cohort passes **6/6, zero skipped**, with runtime source unchanged
throughout and the original credential journals byte-identical afterwards. The exact
configured route is OpenRouter OAuth `openai/gpt-6-luna`. Actual model output, native judge
reviews, native child-result lineage, script outputs, occurrence identities and signed
webhook deduplication are retained in
[live-closure/live.json](evidence/nma-036/live-closure/live.json).

| Final case | Result | Elapsed seconds |
| --- | --- | ---: |
| longitudinal intent correction duplicate stop | Passed | 32.004 |
| native subgoal judge completion | Passed | 69.138 |
| offline model schedule restart | Passed | 49.55 |
| offline script chain | Passed | 43.52 |
| signed duplicate webhook restart | Passed | 42.528 |
| native goal delegation | Passed | 42.25 |

These are whole-case durations, including deliberate offline waits, not first-progress
or recovery percentiles. The native-child case creates exactly one temporary child,
retains its admitted completion batch and completes the same persistent goal with actual
persisted evidence. No generic polling chain or replacement child satisfies that oracle.

| Independent cohort | Attempted | Passed | Failed | Source relationship |
| --- | ---: | ---: | ---: | --- |
| live-first | 5 | 3 | 2 | Earlier implementation; timeouts retained |
| live-second | 5 | 3 | 2 | Earlier implementation; judge/settlement failures retained |
| live-judge | 1 | 1 | 0 | Targeted native judge proof |
| live-final | 5 | 5 | 0 | Before final delegation/pause-idempotency changes |
| live-closure | 6 | 6 | 0 | Final delivered runtime; source guard passed |

These cohorts are not pooled into a single reliability score. All eight unit acceptance
criteria and five combined delivery requirements now have the linked evidence above.
The [verification manifest](evidence/nma-036/verification.json) hashes source, tests,
report and retained evidence. The final wheel is source-equal. Work is local; no commit,
push or deployment was performed. Production and representative release reliability
remain the unchanged NMA-039/NMA-027 gates. Review is author source/evidence self-review;
no independent product acceptance is claimed. Unrelated `docs/agent.pen` changes are
preserved and excluded from this delivery.

Reproduce the final affected-runtime regression from the repository root:

```sh
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source" \
NMA_TEST_RUNTIME_PYTHON="$PWD/.dev/nma-033/production/bin/python" \
NMA_TEST_NATIVE_IMAGE=sha256:6580374cc2db359e4db9723c7a1c679a6b609d1a0fa91b1432cd3df9096adb6d \
NMA_TEST_BROWSER=1 NMA_BROWSER_EVIDENCE=<new-evidence-directory> \
uv run --python .dev/nma-033/production/bin/python --with pytest --with pytest-asyncio \
python -m pytest apps/engine/tests/test_goal_delegation.py \
apps/engine/tests/test_delegation.py apps/engine/tests/test_collaboration.py \
apps/engine/tests/test_goal_lifecycle.py apps/engine/tests/test_goal_review.py \
apps/engine/tests/test_calendar_wakes.py apps/engine/tests/test_automation.py \
apps/engine/tests/test_wakes.py apps/engine/tests/test_webhooks.py \
apps/engine/tests/test_wakes_browser.py apps/engine/tests/test_collaboration_migration.py -q -ra
```

With the same runtime settings, run the actual-provider harness:

```sh
uv run --python .dev/nma-033/production/bin/python --with pytest --with pytest-asyncio \
python scripts/verification/nma036_live.py \
--metadata <private-existing-owner-metadata> \
--private <new-private-directory> --evidence <new-evidence-directory>
```

Replace angle-bracket placeholders with private local paths. The metadata must identify
an existing connected OpenRouter OAuth route for the exact model. Never copy credentials
into the public evidence directory.
