# ChatGPT Luna continuation of the native architecture spike

Date: 26 October 2026. Authority: [NMA-028](https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1).

This continuation follows the user's explicit selection of the existing ChatGPT
plan connection and `gpt-6-luna`. Historical Sol credit failures remain separate.
The discovery spike is complete: its full baseline, native backend decision,
authenticated application evidence and failure dispositions are reviewable.
Production release and full capability adoption remain downstream work.

## Frozen configuration

The new protocol is `nma028-chatgpt-luna-v1`, SHA-256
`c1a7b3b29a21e6704599db693c7f5be689e9dc87f7e94314abb8e5d12fb6a810`.
It retains all 11 scenario families, three repeats and three surfaces: 99 cells.
Tasks, input sizes, deadlines and release thresholds retain closure-v2's contract.
Navigation additionally requires a completed final turn reporting the observed
`/form` URL. Exact configuration is in
[protocol-plan.json](../../scripts/spikes/nma028/protocol-plan.json).

All inference is fixed to ChatGPT plan `gpt-6-luna`, public Responses, native
`codex_responses`, with `store=false` and streaming enabled. A disposable loopback
credential relay rejects any other model. It forwards the request without choosing
tools, interpreting results, executing work or providing a fallback. Every
surface uses that same relay. The existing real-account product gateway alone
owns renewable-token updates; its vault is neither cloned nor exported. Disposable
model controllers receive an opaque relay key. The original account's agents,
model selections, root environment and conversations are not changed.

The direct native configuration uses Hermes' named custom-provider seam to
declare Responses explicitly. At this exact source revision, bare `custom`
intentionally ignores a persisted Responses mode for an unrecognized loopback
host. The initial six failed pilot cells therefore never reached ChatGPT. Their
denominators and final error cards remain retained. The corrected pilot contains
six separate cells; one real-model multi-step task fails its sequential-update
oracle. Neither pilot is pooled into the fixed final corpus.

The authenticated surface uses two fresh actual Clerk development identities,
ClerkJS sessions and an isolated migrated PostgreSQL database. The production
`current_account` dependency is unchanged. Native direct, signed adapter ingress
and actual-Clerk HTTP ingress retain their documented product/tool/prompt
differences. Latencies describe these smoke samples; they do not establish causal
adapter overhead or the NMA-039 release SLO.

## Main corpus results

All **99/99** pre-registered cells were executed. The adjudicated result is
**70 successful tasks, 20 failed tasks and nine verified user stops**. Raw scores
remain **62 passed, 28 failed, nine stops**. Eight read-only scoring corrections
cover seven title-case todo labels and one canonical native cron completion.
No failed provider attempt, skipped cell or prompt echo becomes a passing task.

| Surface | Executed | Successful tasks | Failed tasks | Verified stops |
| --- | ---: | ---: | ---: | ---: |
| Native Hermes | 33 | 26 | 4 | 3 |
| Signed Ngertiin adapter | 33 | 20 | 10 | 3 |
| Actual-Clerk application | 33 | 24 | 6 | 3 |
| Total | 99 | 70 | 20 | 9 |

The [machine-readable summary](evidence/nma-028-luna/paired-summary.json) retains
every batch hash, raw score, correction, scenario/surface denominator and Wilson
interval. [Failure review](evidence/nma-028-luna/failure-review.json) accounts for
all 20 remaining failures: nine browser compile errors followed by scope
quarantine, three invalid schedule argument cases, six original invalid mention
requests, and two native responses missing their requested marker. One successful
task recovers from a tool error; its failed terminal file read is retained.

First-progress p95 is 5.688s (native, n=27), 7.498s (adapter, n=24) and 6.043s
(application, n=24). Settlement p95 is 46.010s (n=33), 38.588s (n=28) and 96.023s
(n=29). Recovery p95 is 2.372s (n=7), 2.460s (n=7) and 3.459s (n=8).
Missing samples are unavailable, never zero. Native offline settlement timings
describe its scheduling turn; canonical due/run/output times separately prove
the actual continuation. Product offline settlement includes intentional waiting.
The raw cancellation `stop_ack` field includes the subsequent observation delay
and must not be interpreted as interrupt acknowledgement latency.

All nine form cases have one verified POST each. All nine stops leave the delayed
forbidden marker absent after its original deadline and gateway restart. The four
tool journals contain 96 operations: 78 returned and 18 retained as indeterminate
(nine interrupted terminal operations and nine browser compile failures). These
states are not silently changed into confirmed effects. The original isolation
and lost-acknowledgement controls remain separately hashed historical evidence.

All three native one-shot jobs survive the verified restart and each has one
terminal admission, canonical completion and output after its due time. Their
arithmetic is correct in 3/3. Only one actual response contains its requested
marker, so strict task scoring remains 1/3 after the status correction. The
Researcher fixture SOUL's prefix/handoff instructions conflict with the cron
request's exact response format; this configuration difference is explicit.
See the [native timeline proof](evidence/nma-028-luna/native-offline-timeline-proof.json).

The unchanged 95% task-success release target is **not met**. The sample is a
decision-spike corpus, below the NMA-039 requirement of at least 100 representative
tasks per supported configuration. It does not establish causal integration
failure rates or production readiness. Measured failure cases remain inputs to
the already assigned adoption tickets.

## Native architecture and preservation

[ADR-08](nma-028-native-contract-closure.md) remains the selected research
architecture: Hermes owns sessions, admissions, model execution, cancellation,
scheduling and recovery. Native browser Python, Chromium/CDP, terminal and files
execute together inside scoped Linux Docker workers. Runtime control/provider
credentials stay outside those workers. The worker supervisor owns process and
volume availability, with durable operation identities and no blind replay of
unknown effects. This continuation does not replace the production executor.

The exact Hermes revision remains
`7489b22af47ce91b366dde81d5831ea422577498`; selected tool image remains
`sha256:b81f1bf356adb3f4cff012b2b95d95c6458b5ba876c1e886a59a24a82e574ebd`.
The metadata-only local-CDP browser-harness package profile, native module/MIT
notice equality, execution-boundary negative controls, preservation rehearsal,
106-family adoption contract and downstream owners remain the earlier evidence.

Read-only historical verification checks all 143 closure-manifest artifacts.
The only current-path difference is `runtime-pin.json`, extended by the later
provider-foundation delivery. Its archived bytes at commit `424d43c` match the
original recorded hash. Historical evidence was not rewritten to match the new
source, and the upstream Hermes source revision did not change.

## Supplemental groups, provider and authenticated UI

The valid-mention generic-agent cohort completes all six cells with five helper
oracle passes and one failure: Reviewer answers `pass` in that case. Its inherited
helper does not enforce Writer-only production. Five reports were produced by
Researcher and one by Writer, so this cohort is not claimed as role-fidelity
acceptance. The [role review](evidence/nma-028-luna/generic-group-role-review.json)
preserves that limitation.

A separate six-cell role-bound cohort configures persistent Researcher, Writer
and Reviewer instructions through the public `agent.configure` contract before
admission. It passes **6/6**, three through the signed adapter and three through
actual-Clerk HTTP. Each Writer produces the canonical artifact, and each Reviewer
reads that exact artifact through the authorized workspace tool. Read bytes match
the artifact SHA-256; reviewers independently verify the arithmetic. The expected
answer is absent from role instructions. All earlier generic-agent scores remain
separate. Protocol/source hash, actor IDs, immutable artifact/run lineage and
canonical read receipts are in the role-bound raw rows and summary.

The final credential relay forwards **447 inference requests**, all to
`gpt-6-luna`, all HTTP 200 with completed Responses terminals and no transport
failure. This count covers the main and supplemental cohorts, not just one
surface. No Sol/Astra request or provider/account fallback is dispatched. The
initial pilot relay remains a separate count. Actual renewal is owned by the
existing product gateway; credentials are not copied into native workers.

Production conversation components show the real stored form receipt on desktop
1440×1100 and mobile 390×844, without horizontal overflow. Their fixture routing
and session hook supply real ClerkJS JWTs; the backend's production authentication
dependency is unchanged. Missing/invalid tokens return 401, and a different valid
owner plus a forged owner header receives 404. An initial reload/close read hits
503 during the corpus' deliberate gateway restart. Its failure remains recorded;
a fresh browser load after readiness recovers the receipt, with the target message
hash unchanged. Authentication-only contexts refresh fixture JWTs; conversation
clients are closed before all successful offline due intervals. This is local
development-instance evidence, not hosted authentication or deployment acceptance.

Read-only replay reproduces the complete summary byte for byte while subprocess
dispatch is forbidden. Twelve harness/scoring/replay tests and Ruff/format/docs
checks pass. Disposable cleanup verifies both Clerk users absent, the temporary
PostgreSQL database absent, and all 58 owned containers/volumes absent. It removes
the temporary dependency link, credential environments and fixture listeners,
preserving unrelated Docker/browser resources and the original ChatGPT connection.
An unrelated change to `docs/agent.pen` appears during the long run; no task edit
targets that file and its current bytes are preserved. Before/current hashes are
recorded separately. Engine/backend/web implementation files have no tracked diff.
See the [final evidence manifest](evidence/nma-028-luna/verification.json) for exact
source/evidence hashes and commands. The discovery acceptance closes with these
measured outcomes and transition owners; the release thresholds stay open.

## Reproduced findings and transition owners

The direct main batch has 27 executed cells. Raw scores are 21 successful tasks,
three failed tasks and three verified user stops; the label-scorer correction
yields 22 successful tasks, two failed tasks and three verified stops. The two
remaining failures are a browser `IndentationError` and a browser
`SyntaxError: 'await' outside function`. The separate corrected pilot's upfront
todo completion remains a genuine failed sequential-update oracle, outside the
fixed corpus.
The latter two exact error receipts precede any execution of the supplied Python
body. The supervisor conservatively persisted them as `indeterminate` and refused
the model's corrected follow-up operation. Those failure scores and durable
operation states remain unchanged.

NMA-031/032 own a typed pre-execution failure boundary and demonstrated recovery:
compile/validate inside the selected worker, prove that user code did not execute,
return the actual known error, and allow a corrected new operation only under
that proof. This is distinct from blindly replaying an unknown effect. No code
normalization, automatic action retry or production policy workaround is added
by this research continuation. Source-backed native worker adoption, browser
recovery and desktop prerequisites remain those tickets' implementation scope.

NMA-029 retains the native history/result/recovery integration, including the
distinction between a delivered explanation, a settled admission and successful
completion of the requested task. The inherited `max_turns=8` is retained for
this baseline; it is not endorsed as a blanket product capability limit. NMA-039
retains the larger representative release corpus and unchanged quantitative
thresholds. These findings are measured inputs to those implementations, rather
than removed capability rows or new exclusions.

The original product group fixture ends one mention with `@handle.`. Current
ingress treats the period as part of the mention and returns `INVALID_MENTION`
before admission. Those three adapter and three application cells remain failed
input/harness evidence; they are not model failures or successful group tasks.
A separately frozen six-cell supplement uses `@handle for verification.` with
the same facts, roles, artifact oracle and provider configuration. It is never
substituted into the 99-cell matrix. NMA-035 owns natural sentence punctuation
and consistent native/product mention resolution.

Failed product schedule attempts retain native receipts showing an unsupported
nonempty `summary` on `responsibility(action="schedule")`. The model retries
timestamp formats while retaining the invalid field; the tool returns only
`INVALID_REQUEST`. NMA-030/036 own clearer per-action schema/error contracts and
reliable scheduling recovery without weakening field, ownership or revision
validation. Successful repetitions still demonstrate automatic capture and a
scheduled continuation after restart without another user message.

## Reproduction

Use the reviewed test interpreter and exact source. Start the private fixed-model
relay using `plan_route.py` with the existing owner's partition and ChatGPT
connection ID. Its `--output` is a mode-0600 temporary environment file; its
`--evidence` contains only public routing metadata and aggregate counts. Do not
publish the private environment, service keys, JWTs or renewable provider journal.

Prepare/start the disposable authentication fixture and complete the two ClerkJS
browser contexts as described in [CLOSURE.md](../../scripts/spikes/nma028/CLOSURE.md).
Run each surface with fresh output/control paths:

```bash
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source" \
  .dev/nma-006-closure/runtime/bin/python scripts/spikes/nma028/plan_baseline.py \
  --source .dev/nma-001/source --env-file /ABS/PRIVATE/plan.env \
  --auth-state /ABS/PRIVATE/auth.json --surface direct \
  --control-dir /ABS/NEW/direct-control --output /ABS/NEW/direct.jsonl
```

Repeat for `adapter` and `application`. `--surface lifecycle` invokes the pinned
native cron/group companion for the six direct lifecycle cells. Each output is
append-only, and a changed configuration requires a separately recorded batch.

`plan_results.py --batch ... --control ... --output NEW.json` reads the complete
99-cell corpus and retained tool journals only. It rejects missing/duplicate cells
and mixed protocols. Its replay cannot invoke a model, gateway, scheduler or tool.
The original scorer additionally imposed lowercase todo labels, which the frozen
written oracle did not require. Read-only adjudication accepts title-case labels
only when the saved results still prove two distinct successful calls, an initial
uncompleted list, and both named tasks completed afterward. Every raw score and
trace remains unchanged; upfront completion and repeated call identities still
fail. Two regression cases exercise that boundary. Native cron adjudication uses
the pin's successful status `ok`, one canonical terminal admission/completion and
one output, and checks the actual Markdown response section for the requested
marker. A marker in the saved prompt cannot create a pass; a third regression
case checks prompt-only markers, failed jobs and duplicate admissions.
Stop the relay and recorded fixture processes, close only the two test browser
contexts, and delete only ledger-recorded Clerk identities/database after evidence
capture. Credential files are removed, while redacted results remain retained.
