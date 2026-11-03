# Shared group responsibilities and collaboration

Implemented on 2026-11-02 for the user-approved Marketing TIm audit follow-up. Contract **1.23.0** is active in the local development backend. No commit, push, data reset, installer or production acceptance is included.

Groups own Goals and Routine. Coordinator/executor assignments are separate from ownership; DM scope remains private. Technical handoff/review instructions stay in the authoritative task input and owner diagnostics. Conversation history displays a concise activity, meaningful results and human questions. Native commentary is separated from canonical final answers. Jev is not integrated.

## Verification

| Boundary | Result | Evidence |
| --- | --- | --- |
| Final backend suite | 308 pass, 0 fail/skip; 1,961 assertions | logs/tests-final.log |
| Initial API checkpoint before UI | 303 pass, 0 fail; 1,938 assertions | logs/tests-api-gate.log |
| Focused responsibility/recovery cases | 13 pass, including legacy taskless finalizer repair and stale-selection checks | logs/tests-recovery-final.log |
| Server | Typecheck and lint pass; native verifier strict typecheck passes | verification.json |
| Full real-API desktop/mobile regression | 60 pass, 0 fail/skip | browser-full.json |
| Final focused desktop/mobile | 2 pass after small presentation refinements | browser-final.json |
| Web | Typecheck, lint and production build pass; existing bundle-size warning remains | logs/web-build.log |
| Final live native cohort | 6 succeeded, 0 failed/cancelled/unknown | native.json |
| Local activation and goal repair | 1.23.0 ready; goal completed with two verified outputs; zero new inference/messages | local-runtime.json |

The full browser suite preceded the final defensive summary-source and completed-state label and source-goal status link refinements. Focused final checks cover those UI changes. External browser harnesses are deterministic fixtures; they exercise the real HTTP/domain/storage/lease/broker boundary, not live provider inference. Native evidence is separate. Later coordinator-stop, unknown occurrence and legacy recovery refinements are covered by final backend checks; not every fault scenario was re-executed against a live provider.

The new cases cover shared inventory, parent/child artifact evidence, immutable objective generations, failed report persistence outside a rolled-back tool command, one finalization owner, friendly history/event projections, durable automatic selection, fixed-target membership loss, unknown stop handling without event polling, reassignment receipt handling and owner repair replay without inference. Existing DM, filesystem/privacy, native protocol, billing, browser and app cases remain in the full suite.

## Native scenarios and limits

The final isolated cohort uses Codex 0.166.0 / gpt-6.1-sol / explicitly selected ChatGPT subscription and Muse 1.4.14-R7309.1 / SDK 1.4.14 / muse-spark-1.3 / explicitly selected API key. No fresh login, Muse subscription, billing fallback or broader provider acceptance is claimed.

1. Codex reads PDF page 3 through the attachment tool, captures one group goal, publishes its summary and hands off with a friendly summary and finalize intent.
2. Muse independently reads page 3 and publishes the requested example into the same group workspace.
3. Codex resumes the exact parent task, reports completion with both artifact IDs, and settles without another public answer. The two requested answers remain visible.
4. After backend/native-client restart, Codex reads the shared completed goal and the previously published summary through product tools, then records an automatic standalone group Routine.
5. After another restart, an isolated Codex member-model router selects the executor without product tools.
6. One Codex occurrence executes at its stored wall-clock due time and records routine_no_update; no chat answer is published. Exact source-command replay creates no extra messages, tasks, runs, artifacts or occurrences.

The coordinator native session ID is unchanged across restart. All six final application runs succeeded with no recorded product-tool errors. The one proof goal is completed, the proof Routine is stopped after its completed occurrence, and all temporary services/credential copies/state are removed. The original credentials and user installation remain intact.

Retained failures are not relabeled:

- native-initial.json: the goal was completed, but the first review lacked a requested file; a second handoff produced an additional public answer, failing the exact-two-answer scenario. Explicit deliverable guidance was added. That early verifier retained only partial run observations before cleanup, so no complete cohort denominator is claimed for it.
- native-second.json: the three goal runs succeeded. A later Muse follow-up after restart successfully called shared goal/list/read tools, then exceeded the verifier deadline before writing the Routine. Its retained snapshot records stop intent; a terminal native outcome and independent timeout cause were not established by that capture. The final Routine creation/execution proof uses Codex. The isolated source scope was removed and was not replayed as a recovered unknown effect.
- The first focused browser attempt failed in both desktop/mobile because the test used the wrong group-configuration request shape. The test was corrected to changes.name; no application change was needed for that failure.
- An intermediate UI status-label build exposed a TypeScript indexing error; the label lookup was typed and final build/focused browser checks pass.
- The first local replacement started before the prior process released the SQLite authority lock. The new process refused ownership. Startup succeeded after graceful release; the lock was never bypassed.

## Reproduction

From apps/server:

```sh
bun test tests
bun run typecheck
bun run lint
bunx tsc --ignoreConfig --noEmit --target ESNext --module Preserve --moduleResolution bundler --lib ESNext,DOM --types bun --strict --skipLibCheck --allowImportingTsExtensions ../../scripts/verification/group-responsibilities/native.ts
```

From apps/web-client:

```sh
bun run typecheck
bun run lint
bun run build
bunx playwright test --config playwright.work.config.ts
bunx playwright test --config playwright.work.config.ts tests/group-responsibilities.spec.ts
```

From the repository root, `bun --env-file=.env scripts/verification/group-responsibilities/native.ts` creates an isolated temporary owner/database and private copy of the existing authenticated Codex profile. Muse uses the selected MUSE_API_KEY; NGERTIIN_MUSE_EXECUTABLE and NGERTIIN_AUTH_SOURCE support the same overrides as the preceding attachment verifier. The script removes task-owned processes, credentials and state in cleanup.

## Local preservation and recovery

Consistent, private SQLite backups and before-entity hashes are under .dev/group-responsibilities. All **66 messages and 26 artifact entities** present immediately before activation retain byte-identical stored entity JSON. All **26 artifact blobs** verify against their original SHA-256. Concurrent conversation activity since the initial audit is included in this pre-activation capture. Goal/task metadata normalizes to the new ownership/lineage contract without replacing identities or receipts.

Marketing TIm goal f8abeeb9-e7e6-46cf-b9fa-46d2c131b8f1 is completed through the owner recovery command, using the existing summary and example. The latest taskless finalizer's original source-run lineage resolves the parent/child evidence. Both outputs still download with matching hashes. Repeating the same recovery command adds no events; recovery admits zero new model runs and zero messages. Original technical instructions and earlier conversation answers remain in the retained audit history.

## Source and delivery

Pinned Openbot revision 01e4b18e238e5de72a3570162c9f4275bb585786 was inspected for schedule coalescing, quiet publication and continuation behavior. Module hashes, local adaptations and exclusions are in provenance.json. Ngertiin retains its one durable lifecycle; no in-memory-only upstream continuation authority or text-marker parser is adopted.

The worktree already contained group attachment changes and independent UI work; additional user commits occurred during implementation. Responsibility hashes describe complete final files, not exclusive authorship. Earlier attachment evidence remains immutable and retains its captured scope. No unrelated work was reset, staged, committed or pushed. SHA256SUMS excludes itself and verifies this evidence plus the selected source/docs snapshots; raw logs are preserved byte-for-byte.
