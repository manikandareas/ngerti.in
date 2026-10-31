# Group collaboration verification

NMA-056 is complete for its engine/backend scope. Dependencies NMA-053 and NMA-055 were both verified Done in live Notion before implementation. The starting tree was clean at `b569084b7fc81313b6bbdab5c82e12de30e79ff4`. The implementation was left **uncommitted** at the initial verification capture, as requested.

The [API contract](../../architecture/group-collaboration-api.md) describes group membership, one context-selected responder, isolated routing sessions, authored cross-harness child tasks, durable owner input and transactional continuation. [provenance.json](provenance.json) records the four exact Openbot modules at `01e4b18e238e5de72a3570162c9f4275bb585786`, source hashes, adaptations, exclusions, stack and upgrade procedure. The implementation extends the existing application lifecycle and has no parallel engine/model-tool loop.

## Acceptance evidence

| Requirement | Evidence |
| --- | --- |
| Real cross-harness review with correct authors/task lineage | Codex Coordinator → Muse Reviewer → Codex final answer; native reports retain parent/root/source/current-run identities and authored messages. |
| Unselected agents remain silent | Only one selected initial member run; one explicitly handed-off peer run; router messages and internal continuation input excluded from group history. Native router used zero product/native tools. |
| Context-based model routing and rejection of bad targets | Native isolated Codex router selected the Coordinator from distinct responsibilities. Domain checks reject malformed JSON, wrong schema, nonmembers and stale membership; both adapter protocol fixtures exercise the normalized route contract. |
| Private context isolation and revoke before dispatch | Native private DM/memory canaries absent from router/group packet; Muse's group recall returned no private facts. Domain revocation, post-claim tool fencing and readd checks pass. The full regression suite also covers existing DM/group artifact/workspace access and explicit sharing. |
| Durable owner input/resume | Muse asked the owner for report format. After backend/native-client restart, one bound response resumed the same Muse session and then the same Codex session. Both tasks have exactly one continuation. |
| No duplicate handoff/reply/restart effects | Native original HTTP receipts replayed with zero extra events/messages/tasks/runs. Domain/protocol and SIGKILL fixture cover tool receipts, stale replies, exact continuation IDs and held unknown work. No multi-human or universal approval policy was added. |

## Local checks

| Check | Planned / passed | Result |
| --- | --- | --- |
| Complete backend suite | 169 / 169 | 0 fail, 0 skip, 1067 assertions in the retained final run. |
| New group domain/protocol coverage | 20 / 20 | Included in the complete suite; two real process/HTTP protocol fixtures, without provider inference. |
| Server lint and typecheck | 2 / 2 | Pass. |
| Existing foundation HTTP/process regression | 8 / 8 | Pass. |
| Existing broker HTTP regression | 5 / 5 | Pass; controlled PATH reports Muse absent. The native cohort uses its explicit local binary path. |
| Group SIGKILL/recovery fixture | 5 / 5 | Committed handoff/HITL, three immutable receipt replays, one reply continuation, another restart and unknown native hold. |
| Native receipt-only probe | 4 / 4 | Exact original group/reply receipts, unchanged snapshot/event cursor and zero router tools. No new inference. |

```sh
bun run test:server
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run verify:foundation
bun scripts/verification/nma048/http.ts
bun scripts/verification/nma056/crash.ts verify .dev/nma056/crash-state
```

The crash probe requires a fresh directory and retains one synthetic unknown run. It is an application SIGKILL/SQLite fixture, not proof of a provider crash or power-loss durability. Raw logs/reports are retained under `logs/` and `native/`; they are not normalized to hide iteration failures.

## Native/live cohort

**5/5 native application runs succeeded: one router, two initial member runs and two continuation runs. Zero native failed/cancelled/unknown outcomes.** Two additional private-canary DM inputs were cancelled before native dispatch; they are recorded separately and are not native inference successes.

| Harness | Configuration | Useful operation |
| --- | --- | --- |
| Codex CLI 0.165.0 / `gpt-6.1-sol`, medium | Existing explicit ChatGPT subscription | Context-based routing, calculation, structured review handoff and final report after peer/user results. |
| Muse CLI 1.4.14-R7309.1 / SDK 1.4.14 / `muse-spark-1.3`, medium | Explicit API key / existing developer credits | Independent calculation review, scoped memory recall, durable owner-format request and completion after restart. |

The final answer was `18,437 + 23,569 = 42,006`, independently reviewed and confirmed by the Reviewer. [initial.json](native/initial.json) retains the live routing/tool/human-request evidence. [resume.json](native/resume.json) confirms both original native session IDs and one continuation per task. [receipts.json](native/receipts.json) proves replay with no extra events at cursor 723. The initial connection inspections establish authenticated account/billing observations; no fresh login was performed or claimed. Muse subscription acceptance remains on NMA-050.

```sh
PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=49956 bun apps/server/src/main.ts
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma056/native.ts http://127.0.0.1:49956 .dev/nma049-native initial
# Stop the service, wait for its authority to exit, then restart the same state.
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma056/native.ts http://127.0.0.1:49956 .dev/nma049-native resume
bun scripts/verification/nma056/receipts.ts http://127.0.0.1:49956 .dev/nma049-native
bun scripts/verification/nma056/cleanup.ts http://127.0.0.1:49956 .dev/nma049-native
```

The native client is a host-specific verification client using already provisioned private state, not an installer. It never prints credential values. The generated Muse connection used a task-scoped copy of the previously selected proof key; the original credential and Codex login state were preserved. The generated connection was revoked, both task-created credential copies were removed, the service/native clients stopped, and there are zero active proof runs/goals/Routines. See [cleanup.json](native/cleanup.json).

## Retained failures and limits

1. The first native provisioner used a non-UUID credential reference. HTTP validation rejected it with `INVALID_REQUEST`: **zero native runs admitted**. [initial-attempt-1.json](native/initial-attempt-1.json) and its client log retain this failure. The verifier was corrected to the existing UUID contract; its unused credential copy was removed during cleanup.
2. The first resume verifier polled Muse interactions while the native turn finished. The native client correctly rejected the stale pending-state read with `NATIVE_REJECTED`; the verifier stopped, while both native continuations later succeeded. [resume-attempt-1.json](native/resume-attempt-1.json) and its client log preserve that failed verifier result. The subsequent recheck only read the same completed runs/receipts and did not admit another inference. The verifier now records this exact polling race and lets the next authoritative run read decide the outcome.
3. The initial regression suite had two outdated contract assertions after adding version 1.7/entities. The first new domain fixture omitted an API-key credential reference, so its 14 cases could not reach their scenarios. One repeated run used an incorrect edit working directory before this setup was corrected. Raw failed outputs remain retained. The final complete suite is 169/169 with zero skips/errors.

Platform verified: macOS arm64, Bun 1.3.10, TypeScript 7.0.2, Elysia 1.4.30, Zod 4.4.3. Fixture coverage of Muse routing is distinct from the live Codex-router cohort. General external effects are not claimed exactly once; unknown native outcomes remain fenced. Context excerpts are bounded and full task results remain paginated. No UI, API readiness, installer, deployment or production acceptance is claimed. No user-data reset, commit or push was performed.

## Local commit delivery

The user subsequently authorized a local commit on 2026-10-31. The implementation, tests and raw verification evidence are unchanged from the verified snapshot. All original 64 content hashes were checked before preparing the commit; only this delivery note and its manifest entry changed. Earlier uncommitted statements and `commit_created: false` fields describe the original evidence capture.

Tests and native inference were not rerun for this commit operation because their implementation bytes are unchanged. The retained 169/169 backend tests, lint/typecheck, process checks and 5/5 native runs apply within the limits above. This delivery includes implementation, tests, documentation and byte-preserved evidence in one local commit, without a push or deployment.

Staged whitespace checks exclude only three hash-verified immutable raw logs: `logs/tests-initial.log`, `logs/tests-iteration-2.log` and `logs/tests-final.log`. Their runner-generated trailing spaces remain byte-identical; all other responsibility paths pass the whitespace check.
