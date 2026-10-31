# Automatic goals and Routine verification

NMA-057 implements the engine/backend responsibility API on the existing single Ngertiin lifecycle. The clean starting revision was `3c337c321c27813c87879f5b5e579d3a72004698`. Dependencies NMA-053, NMA-055 and NMA-056 were Done in live Notion before implementation. The implementation was left **uncommitted at initial verification capture**, as explicitly requested. The user subsequently authorized the local commit described below.

The [API contract](../../architecture/goals-routines-api.md) describes scoped ordinary-chat capture/correction, multiple persistent responsibilities, evidence-checked completion, durable standalone continuation, one-shot/interval/heartbeat/local-calendar Routines, quiet publication, source-run deferral fencing, goal/run controls and group task ownership. [provenance.json](provenance.json) records the four exact Openbot modules at `01e4b18e238e5de72a3570162c9f4275bb585786`, their hashes, adaptations, exclusions, stack and upgrade procedure. Openbot source presence is not used as goal-capture acceptance.

## Verification levels

| Check | Denominator / passed | Result |
| --- | --- | --- |
| Complete backend suite | 196 / 196 | Zero fail/skip; 1224 assertions in the retained final run. |
| New goal/Routine checks | 27 / 27 | 25 domain/HTTP checks and two child-process native-protocol fixtures, included in the complete suite. |
| Server lint/typecheck | 2 / 2 | Both pass. |
| Existing foundation HTTP/process | 8 / 8 | Single authority, headless scheduling, crash/replay and shutdown. |
| Existing broker HTTP | 5 / 5 | Explicit connection selection and replay. Controlled PATH reports Muse missing; live proof uses its explicit local binary. |
| Goal SIGKILL/SQLite fixture | 7 / 7 | Final report: [crash-source-binding.json](crash-source-binding.json). Earlier iterations remain retained. |
| Native behavior cohort and receipt-only replay | See [verification.json](verification.json), [native/receipts.json](native/receipts.json) | Every native run and earlier behavioral/verifier failure is counted separately. |

```sh
bun run test:server
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run verify:foundation
bun scripts/verification/nma048/http.ts
bun scripts/verification/nma057/crash.ts verify .dev/nma057/fresh-crash-state <report-path>
```

The process probe refuses an existing directory; it never resets user data. It proves that a second application authority cannot start, committed goals/waits/stops/receipts survive SIGKILL, one continuation and occurrence are admitted, a second restart does not duplicate them, stopped generations cannot restart, uncommitted mutations/events/receipts roll back together, and synthetic unknown native work remains held. This is a local application process fixture, not a provider crash or power-loss claim.

Domain checks additionally cover multiple sources and revisions, foreign/deleted/automatic source rejection, real immutable evidence and final hash revalidation, failed/unknown/cancelled completion, DST gaps/folds and weekday recurrence, missed-occurrence coalescing, stale schedule generations, wait/blocked without polling, scope revoke/readd, self-stop receipts, independent Routine pause/resume, goal/run separation, group descendant/HITL cancellation and trusted tool retries. A deferred source cannot publish future result bytes or mark that goal completed; later prose cannot override its structured progress. A new authorized scheduler run can finish it. Both real adapter protocol fixtures call scoped HTTP tools, restart the native client and retain the same native session, without provider inference.

## Native setup and results

Host: macOS arm64, Bun 1.3.10, TypeScript 7.0.2, Elysia 1.4.30, Zod 4.4.3. Codex CLI minimum/tested 0.165.0 uses the previously selected explicit ChatGPT subscription and `gpt-6.1-sol` / medium. Muse CLI minimum 1.4.14, tested 1.4.14-R7309.1 / SDK 1.4.14 uses explicitly selected API-key/developer credits and `muse-spark-1.3` / medium. Fresh account/billing inspections are retained in [provision.json](native/provision.json); they are not fresh-login or Muse subscription acceptance. No silent billing fallback occurred.

**Native denominator: 22 admitted application runs, all 22 inference outcomes succeeded; 20 accepted behavior runs and two earlier Muse behavioral failures.** Those two failures remain in the denominator and are excluded from the accepted scenario cohort. Sixteen original conversational HTTP receipts replay after the final restart with zero new events, messages, runs, goals, Routines, occurrences or artifacts. The cohort contains 10 Codex runs and 12 Muse runs; 10 per harness meet their selected scenarios.

The native client creates two task-owned agents/DMs in existing private verification state, reuses the original Codex connection without copying rotating authentication, and provisions one task-scoped copy of the already selected Muse proof key. Files are actual scoped attachments. The ordinary user prompts do not supply calculated answers or raw tool arguments.

| Behavior | Native evidence |
| --- | --- |
| Hypothetical discussion creates no commitments | [hypothetical.json](native/hypothetical.json): both harnesses, zero goals/Routines. |
| Ordinary conversation captures two separate waiting responsibilities | [capture.json](native/capture.json): distinct goals, source messages, progress and wait states. |
| Correction preserves goal identity | [correct.json](native/correct.json): first objective changes, second remains waiting. |
| Persistent delayed work continues after backend/native-client restart | [resume-codex.json](native/resume-codex.json), [guarded-muse.json](native/guarded-muse.json), [resume-muse.json](native/resume-muse.json): source stage ends before future work, same native session resumes, one scheduled run produces verified final bytes `84012`. The other responsibility remains separate. |
| Schedules created through conversation | [routines.json](native/routines.json): separate one-shot and recurring checks, actual timezone and source binding. |
| Existing schedules revised through conversation | [revise-routines.json](native/revise-routines.json): same IDs, generation 2, twelve-hour heartbeat and moved one-shot time. |
| Headless edited occurrences and quiet behavior | [ticks.json](native/ticks.json): one occurrence per edited schedule, no old-generation occurrence; heartbeat invokes `routine_no_update` with no chat bubble, one-shot reads and publishes actual reminder content. |
| Goal stop disables its continuation/cadence | [stop-goals.json](native/stop-goals.json): ordinary conversation stops the ongoing responsibility and its Routine. [receipts.json](native/receipts.json) rechecks after another restart without inference. |

```sh
PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=49957 bun apps/server/src/main.ts
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma057/native.ts http://127.0.0.1:49957 .dev/nma049-native <phase>
# Stop/restart the same backend after completed source stages, before scheduled work.
bun scripts/verification/nma057/receipts.ts http://127.0.0.1:49957 .dev/nma049-native receipts
bun scripts/verification/nma057/receipts.ts http://127.0.0.1:49957 .dev/nma049-native cleanup
```

Phases and original command IDs are retained in private `.dev/nma057/proof.json`; do not blindly repeat provisioning or create new inference for an unknown outcome. The client retries exact original HTTP receipts for rechecks. The final source has no browser/UI dependency. Headless execution here means the host/backend remain alive, not execution on a suspended or powered-off host.

## Retained failures and adaptations

1. The initial HTTP schema used Zod `.omit()` on a refined schema, so API construction failed in 73 existing tests. It was corrected to preserve strict request fields and revalidate the complete domain input. Initial contract-version assertions, two stale test revisions after a Routine update, a reused fixture filename, and the changed expectation for structured deferred progress are retained in raw logs. Final checks above pass.
2. The first hypothetical verifier polled a Muse-specific interaction endpoint for Codex and received 409. Both admitted native runs ultimately succeeded. The recheck uses their original receipt keys and does not submit another model request. [hypothetical-attempt-1.json](native/hypothetical-attempt-1.json) remains a verifier failure.
3. A delayed-stage verifier initially expected a standalone continuation timestamp, while both harnesses validly chose a one-shot Routine. Its assumptions were corrected without another inference. Concurrent initial/recheck observers briefly wrote the same report/proof file; the retained snapshots/logs and subsequent same-session recheck preserve the resulting uncertainty instead of inventing a missing baseline. The client now waits for every cohort outcome and serializes writes.
4. Muse then executed a future stage early in two distinct successful native source runs. Those are **two behavioral acceptance failures**, even though inference succeeded and produced correct arithmetic. [stage.json](native/stage.json), [stage-muse.json](native/stage-muse.json) and adjacent attempt logs retain them. Instruction-only guidance was insufficient. The fix persists source deferral, fences completion and product file/publication effects until a new scheduler run, and publishes structured progress instead of a source-turn prose completion claim. The guarded native run ends without the future final file; after restart exactly one scheduled run produces it. Regression tests also prove that an attempted bypass is rejected with `RESPONSIBILITY_DEFERRED`.
5. A receipt-only Codex resume verifier lacked its in-memory session baseline because of the earlier observer write race. [resume-codex-attempt-1.json](native/resume-codex-attempt-1.json) retains the failure. Its recheck uses the actual pre-restart binding from `correct.json`, verifies the same successful run/artifact, and submits no inference.
6. The initial schedule verifier required the literal heartbeat tag, while both valid recurring checks used `interval`. [routines-attempt-1.json](native/routines-attempt-1.json) retains that verifier failure. Original receipts were rechecked; the subsequent user request explicitly changes the same IDs to heartbeat, with both native edit receipts preserved.

The cohort spans implementation iterations. Early failures are not relabeled as passes, and not every earlier native scenario is claimed to have run against one frozen final build. Final guard, restart, Routine execution and stop scenarios use the final relevant implementation; the complete final source is covered by the retained backend/protocol/process checks. Raw evidence bytes are not normalized to hide failures or runner whitespace.

## Cleanup and boundaries

[cleanup.json](native/cleanup.json) records zero active native proof runs/goals/Routines, revocation of the generated Muse connection, and removal of its single task-owned credential copy. Original credentials, user data and historical proof records are preserved. The verification server/native clients are stopped after the final receipt probe. The process fixture retains one synthetic unknown run in its isolated state, without a running executor or replay.

This proves the selected backend ticket, not NMA-060 API-wide readiness, UI, installer, VPS, deployment or production operation. No UI edits, webhook, extra provider, universal approval, data reset, commit or push is included. Muse subscription and its broader native permission matrix remain on NMA-050; native source/fixture checks are not substituted for them. General external effects are not claimed exactly once: unknown work remains fenced until a native receipt can resolve it.

## Local commit delivery

The user subsequently authorized a local commit on 2026-10-31. This delivery groups the implementation, tests, contract documentation and byte-preserved evidence in one responsibility-based commit: `feat(goals): add durable responsibilities and routines`.

All 101 original content hashes were verified before preparing this delivery. Only this README and its manifest entry changed; implementation, tests and raw evidence retain their verified bytes. Earlier uncommitted statements and `commit_created: false` fields describe the original evidence capture.

Tests and native inference were not rerun for the commit operation because their implementation bytes are unchanged. The retained 196/196 backend tests, lint/typecheck, HTTP/process checks and native evidence apply within the limits above. The exact raw-log whitespace exemptions remain listed in [hygiene.json](hygiene.json), with their hashes verified. This is a local commit delivery without a push or deployment.
