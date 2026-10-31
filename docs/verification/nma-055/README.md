# Memory and skills verification

Implemented on 2026-10-31 (Asia/Makassar) from clean baseline `71d6ac49830d9cae1c5c6b8591530a44312cff0c`. The live NMA-055 ticket, feature decisions G01–G04/T03, active architecture, source guidance, roadmap and acceptance rules were read. Its direct prerequisite NMA-054 was Done. This is engine/backend/API work. The user requested **no commit**; all responsibility files remain uncommitted.

See the [API and examples](../../architecture/memory-skills-api.md), [source provenance](provenance.json), [results](verification.json), [iterations](iterations.json), [cleanup](cleanup.json) and [responsibility hashes](SHA256SUMS).

## File layout

- `apps/server/src/learning/`: schemas, scope checks, memory, application skills and product-tool registration.
- `apps/server/src/harness/inherited-skills.ts`: native skill discovery and binding snapshots.
- `apps/server/tests/learning/`: domain and adapter-protocol fixture tests.
- This directory keeps the summary/provenance/index files; `native/` keeps raw native reports/receipts and `logs/` keeps successful and failed verification logs. Raw contents retain the paths observed at capture time.

## Delivered behavior

- Stable scoped memory identities, exact-revision corrections, permanent empty tombstones, bounded recall and explicit sharing. DM, distinct groups and other agents cannot recall each other's private facts. Current group members can share group facts; revocation removes access. Historical events/receipts remain retained evidence, separate from active recall.
- Immutable application package versions with descriptions, instructions, text/binary assets, canonical hashes and originating runs. Per-agent scoped assignments pin a version; publishing a revision never silently upgrades an assignment. Name/path/case collisions, stale revisions and cross-context access are rejected.
- Two read-only harness observations: native catalogs through Codex `skills/list` / Muse `skill/list`, plus confined inherited package snapshots. Application packages never write a native skill directory. Qualified identities expose application/harness name collisions. Native catalog and folder availability remain separate, including `unknown`.
- Nine structured learning tools extend the existing scoped bridge. Scope comes from the run lease; grants/membership are checked before effects, and projection/event/receipt commits are atomic. Native harnesses retain their own inference/tool loops. No extra application model loop performs tool dispatch or memory review.
- Fresh per-turn learning state and current skill assignments replace global/private prompt mixing. Codex receives only confined workspace-root project guidance instead of scanning denied parent `AGENTS.md` files. Muse queries authoritative `approval/listPending` before presenting/answering interactions and rechecks application grants after that asynchronous read. Replayed or late approval snapshots cannot create a fresh grant. The production approval policy is unchanged.

## Local checks

| Evidence | Planned / passed | Result |
| --- | --- | --- |
| Backend suite | 149 / 149 | 0 fail, 0 skip; retained run has 942 assertions. Assertion count varies with the existing path-swap race schedule. |
| Backend lint and typecheck | 2 / 2 | Pass. |
| Foundation process/HTTP regression | 8 / 8 | Pass; authority locking, crash/restart, schedules, receipts and conservative unknown recovery. |
| Broker HTTP regression | 5 / 5 | Pass. Its controlled PATH reports Muse missing; native probes use the explicit local Muse binary path. |
| Learning SIGKILL process fixture | 9 / 9 | Durable package/asset/assignment/tombstone, immutable receipt replay with zero extra events, one version/assignment, orphaned run remains unknown and zero native replay. Not a provider-crash or power-loss claim. |

The suite adds 18 tests across scoped learning, both adapter protocol fixtures and Muse interaction recovery. It covers another agent/group, membership revocation, foreign cursors, concurrent exact HTTP retries, rollback, permanent deletion, immutable text/binary assets, pinned assignments, cross-conversation assignment collisions, native byte stability, symlink/hardlink refusal, stale approval replay, late pending-state response and grant revocation during native reconciliation.

```sh
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun run verify:foundation
bun scripts/verification/nma048/http.ts
bun scripts/verification/nma055/crash.ts .dev/nma055/crash-state
```

The crash probe requires a fresh directory and intentionally retains a synthetic unknown run. Raw logs are retained in `logs/`; they are not normalized to remove failures or whitespace.

## Native/live checks

The final acceptance cohort has **8/8 succeeded application runs**, zero failed/cancelled/unknown: three initial operations plus one restart run per harness.

| Harness | Connection/config | Useful operation and restart |
| --- | --- | --- |
| Codex CLI 0.165.0 / `gpt-6.1-sol`, medium reasoning | Explicit ChatGPT subscription | Read inherited skill instructions/assets, calculated an asset-derived sum, corrected a memory, created/assigned/read/revised an application skill, exposed its source collision, kept assignment at version 1, denied a foreign private skill in a group, deleted the memory, and resumed the same native session. The original write command replayed after deletion left revision 3 tombstoned. **51 native skill files** remained byte-identical. |
| Muse CLI 1.4.14-R7309.1 / SDK 1.4.14 / `muse-spark-1.3`, medium reasoning | Explicit API key / developer credits | The same useful learning workflow through native MSP and the scoped MCP bridge. Both package versions retain different verified sum assets. Group denial has a native failed-effect receipt. Restart preserves the native session, tombstone and pinned assignment. **2 inherited fixture files** remained byte-identical. Native bundled/plugin catalog observation is separate from that fixture. |

The input skill contained two integers absent from the user prompt. Both providers produced the independently verified `42006` asset, then the versioned `Total: 42006` asset. Server receipts and immutable asset bytes establish the operation; a model's prose alone does not. [Native scope denial receipts](native/native-scope-denials.json) retain the actual Codex tool output and Muse failed-effect record, with native source-line hashes.

Muse verification answered only one-time native choices for generated proof work; no session/persistent approval grant was installed. [Control observations](native/control-observations.json) preserve the initial manual/sidecar choices and the uncertain obsolete approval response. These are test-client choices, not a production automatic approval feature. Muse subscription and the broader NMA-050 permission acceptance matrix remain separate open work.

Commands use existing explicitly provisioned private connection state; no credential value is in arguments or evidence:

```sh
NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=49955 bun apps/server/src/main.ts
bun scripts/verification/nma055/native.ts http://127.0.0.1:49955 .dev/nma049-native codex initial
# Stop the service and wait for its authority to exit; restart the same state.
bun scripts/verification/nma055/native.ts http://127.0.0.1:49955 .dev/nma049-native codex resume

PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma050/state NGERTIIN_PORT=49958 bun apps/server/src/main.ts
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma055/native.ts http://127.0.0.1:49958 .dev/nma050/state muse initial
# Stop, wait and restart before the resume phase.
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma055/native.ts http://127.0.0.1:49958 .dev/nma050/state muse resume
```

## Retained failures and limitations

All retained attempts admitted **9 distinct native application runs: 9 succeeded, zero failed/cancelled/unknown**. The additional Muse restart run succeeded after test-client intervention, while its initial verifier remains failed. It is not counted in the final eight-run cohort.

1. Codex initially rejected native startup while reading ancestor `AGENTS.md` outside the workspace grant: **zero runs admitted**. The raw failed report is retained. Confined root guidance and disabling native ancestor discovery fixed startup; the subsequent four Codex runs passed.
2. An obsolete Muse approval remained in the cached interaction snapshot after resume. Two one-time decision responses for that obsolete identity were `NATIVE_UNKNOWN`; their historical acknowledgement outcome is not relabeled as accepted. The application's learning receipts remained consistent, and that run eventually succeeded. Fresh native pending reads, a final grant check and late-response fencing were implemented and regression-tested. A separate restart run then passed the complete verifier.
3. Retained test iterations include two outdated contract assertions after adding entities/version 1.6; an initially insufficient late-response fixture; the corrected distinction between scope denial HTTP 403 and a conflict; and explicit cancellation needed to finish the revocation test fixture. All raw failures remain visible. Final suite: 149/149, zero skips/errors.

Verified platform: macOS arm64. Package limits and native `unknown` states are explicit. Native bundled/plugin skill contents continue to belong to the harness; this feature is not a marketplace, arbitrary host-home import, native plugin editor or script executor. New ordinary persistence and recovery are covered; physical history erasure, provider crashes and power-loss durability are not inferred from these checks. No UI, installer, API-readiness gate, deployment or production acceptance is claimed.

Both verification services/native clients were stopped. All nine proof runs are terminal; zero proof goals/Routines or active runs remain. User data, unrelated files and historical evidence were preserved. No commit, push or deployment was performed.

## File organization follow-up

The user subsequently requested tidier file organization. Five learning modules now live under `src/learning/`, and the two learning test files live under `tests/learning/`. Native discovery remains under `harness/`. Native evidence and raw logs moved into `native/` and `logs/`; indexes, links, import paths and verification script paths were updated.

The production implementation bodies are identical after removing imports, and application/broker/tool schemas compare equal to the pre-cleanup snapshot. All original raw evidence files retain their original SHA-256, including the original crash report. A first rerun used the probe's fixed report filename; the original was restored byte-for-byte against its pre-cleanup hash, and the rerun result is separate. The crash client now accepts an optional report destination:

```sh
bun scripts/verification/nma055/crash.ts .dev/nma055/file-cleanup/crash-state-final docs/verification/nma-055/logs/file-cleanup-crash.json
```

Choose a fresh state directory and report destination for another run. Post-cleanup verification: **149/149 backend tests**, lint/typecheck and **9/9 process-crash checks** pass. Results are in `logs/file-cleanup-*` and the `file_cleanup` section of [verification.json](verification.json). Native provider inference was not rerun for this file organization change; the original native reports remain retained evidence. No commit was created.

## Local commit delivery

The user subsequently authorized a local commit on 2026-10-31. The implementation and raw verification evidence are unchanged from the tested file-organization snapshot. Tests and native provider inference were not rerun for this commit operation; the retained results above apply to the same implementation bytes. Earlier statements and `commit_created: false` fields describe their original pre-commit capture state. This delivery includes the implementation, tests, documentation and hash-verified evidence in one local commit, without a push or deployment.
