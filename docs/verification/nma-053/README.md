# NMA-053 implementation evidence

Implemented on 2026-10-31 (Asia/Makassar), from clean baseline `a27d50c9c5411f5a163241a361906b5743ab4c88`. The selected ticket's live dependency NMA-052 was Done with its already recorded NMA-050 exception. Main documentation, scope, matrix C05–C07/H01/H02/H05/A04, control flow, architecture, roadmap, source guidance and readiness gates were read live. No UI, subsequent ticket, commit, push, deployment or development reset is included.

See the [API contract and examples](../../architecture/conversation-control-api.md), [source provenance](provenance.json), [machine-readable results](verification.json) and [retained iteration failures](iterations.json). Backend code, prompts, schemas and authored runtime text use English; simulated and real user input remains unchanged.

## Implemented behavior

- Ordinary busy input stays in the application's persistent FIFO queue. Revisioned edit/delete commands work only before claim. Deletion publishes a tombstone, hides the message from history/replacement context and cancels its undispatched delivery; completed effects are untouched.
- Direct conversational cancellation resolves against agent/thread/current-run/goal context through an independent control path. Quoted, hypothetical, interrogative and negated stop discussion stays ordinary input. A run stop differs from goal pause/stop and its Routine/continuation changes. No mandatory approval was added. The recognizer intentionally accepts bounded standalone utterances; it does not claim general NLP coverage.
- Steering persists a control receipt and reserves its queued input before native dispatch. Concurrent/exact retries send once. Certain refusal restores FIFO; unknown acknowledgement/restart holds the input without replay. Codex steering is native verified. Muse reports `unknown` and preserves the queue after an observed native mapping defect; see the limitations below.
- Authenticated SSE and polling replay the same committed events. A unique answer index and revisioned snapshots maintain one message per run across incremental updates, terminal publication, recovery and reconnect. Snapshot projection includes control receipts. Streaming uses a 100 ms coalescing window, bounded pull/backpressure and split-secret redaction.
- Stop intent and native stopped confirmation remain separate. Unconfirmed stop deadlines/process loss become unknown. Native read-only receipt reconciliation runs at startup and through an explicit API request; it neither prompts, resumes for execution nor repeats effects. Native identity, membership, revocation, account and billing are checked before recovered text/settlement commit.
- Safe diagnostics distinguish temporary service/provider failure, native auth rejection/login requirement, configuration/provider rejection and unknown dispatch/refresh. Typed Muse auth-required failure changes login state; transient failure does not. No raw native exception or silent billing fallback is introduced.

## Local checks

Run fixture tests from the server workspace so root `.env` is not implicitly inherited by child protocol fixtures.

```sh
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun scripts/verification/nma047/foundation.ts
bun scripts/verification/nma048/http.ts
```

- Backend lint and typecheck pass. **116/116 tests pass, 0 fail, 0 skip; 648 assertions**, across eight files. The baseline contained 95 tests; 21 were added. Logs: `lint.log`, `typecheck.log`, `tests.log`.
- **8/8** foundation process/HTTP checks pass, including SIGKILL/restart, authority locking, dispatch uncertainty and persistent command/event/schedule behavior. **5/5** broker HTTP checks pass. Their controlled PATH intentionally reports Muse missing; native probes use the explicit downloaded Muse PATH. Logs: `foundation.log`, `broker-http.log`.
- Tests cover 12 concurrent queued edit retries; stale edit/delete/claim races; tombstone pagination; direct stop against a stalled executor; goal/run separation; ambiguous goal protection; 16 concurrent steering receipt dispatches with one native call; lost acknowledgement held across restart; streaming/redaction and authenticated SSE replay; native stop deadline; recovery revocation; typed auth versus transient failures; and both native SDK/JSONL fixtures.
- Both child-process fixtures commit a real application `ngertiin.update_agent` tool effect and its receipt, then die before native terminal publication. After restarting the application/client, native history settles the original run, updates the original answer and retains agent revision 2. Repeated reconciliation adds no second effect, message, run or event. This is protocol/process-fixture evidence, not a provider crash claim.
- Whitespace and local Markdown links pass. Root/web lint/build/typecheck and browser acceptance were not run; `apps/web` is unchanged. `SHA256SUMS` covers the responsibility files and exact evidence bytes. Earlier ticket manifests remain historical and are not rewritten.

## Native HTTP and receipt evidence

Existing explicitly provisioned connection-owned credentials were used in their original ignored development directories. Fresh isolated proof agents/DMs/goals/Routines were created; no global account was imported, existing agent configuration changed or billing mode switched. Tokens/keys are never printed or copied into this evidence directory.

```sh
NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=49953 bun apps/server/src/main.ts
bun scripts/verification/nma053/native.ts http://127.0.0.1:49953 .dev/nma049-native codex
bun scripts/verification/nma053/receipt.ts http://127.0.0.1:49953 .dev/nma049-native codex

PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma050/state NGERTIIN_PORT=49956 bun apps/server/src/main.ts
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma053/native.ts http://127.0.0.1:49956 .dev/nma050/state muse
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma053/receipt.ts http://127.0.0.1:49956 .dev/nma050/state muse
```

Codex CLI **0.165.0**, subscription; Muse CLI **1.4.14-R7309.1**, SDK **1.4.14**, explicitly selected API key/developer credits. Muse subscription remains unverified. Login/catalog, completed inference, cancellation and native receipt reads are separate outcomes.

The final behavior cohort contains **four native runs: two succeeded and two cancelled** (one completed generation and one confirmed conversational stop per harness), with no unknown outcome in that cohort. Twelve scenario checks pass across the two harness reports: account/catalog; queue/edit/delete/stream/control exact retry; conversational stop; distinct goal/Routine stop; event replay; authenticated SSE. Codex accepts native steering with the correction in the answer. Muse returns `CAPABILITY_UNKNOWN`, retains the queued correction and permits safe deletion before the original run completes. Its report does not claim successful native steering.

`native-codex.json` and `native-muse.json` retain identities, transitions, answer hashes/lengths and SSE projection evidence. `receipt-codex.json` and `receipt-muse.json` prove matching cancelled terminals through fresh native clients, with **zero prompt submissions and zero session resumes**. This cold read is separate from fixture-proven application crash recovery. New native product-tool effects were not requested by these control probes; useful configuration-tool native evidence belongs to NMA-052.

Across all retained native attempts there were **six application native runs: three succeeded, two cancelled, one unknown**, plus two failed scenario assertions. The first Muse attempt exposed an admitted steer that continued in another native turn; a subsequent dispatch lost acknowledgement. It remains unknown, with no resubmission. Files: `native-muse-initial.json`, its log and the initial service log. Capability was changed to unknown and the next isolated cohort exercised safe fallback.

The second Muse cohort's behavior completed, but the verification script initially searched only the first 1000 replay events. It failed to see later cancellation events. The raw failure remains in `native-muse-replay-limit.json` and its log. A pagination-only recheck, without any new model request, produced `native-muse.json` using two pages of the same durable evidence:

```sh
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma053/native.ts http://127.0.0.1:49956 .dev/nma050/state muse replay
```

The final source adds 100 ms streaming coalescing, the snapshot control projection and typed failure diagnostics and authoritative empty-history repair after the live behavior probes. Final fixture/type/lint checks cover those changes; the native control mappings are unchanged. Cold native receipts were read using the updated adapter implementation. No additional full provider run is claimed for these final local changes.

All proof goals/Routines are stopped. Both verification services and their owned native clients were shut down. `cleanup.json` records zero active proof runs and the one retained unknown Muse run, whose goal is stopped and whose dispatch was not replayed. Historical/user state and credentials remain in place.

## Acceptance boundary

NMA-053's supported-native control, persistence, stream, diagnostics and recovery criteria are verified at their stated levels. Muse single-turn steering stays unknown; it is not silently queued inside native or advertised as supported. The known unknown initial run is preserved rather than fabricated into a terminal result. Missing/nonmatching/older receipts remain unknown, and the direct-intent recognizer is intentionally conservative.

This work does not close NMA-050's subscription/permission acceptance, NMA-057's automatic goal/Routine policies, the API gate NMA-060, UI, installer or production readiness. At verification completion, no commit had been made, as originally requested. The user subsequently authorized a local commit. The `commit_created: false` field in `verification.json` records the verification snapshot; current delivery is recorded in Git and the selected Notion ticket. Implementation and raw evidence bytes remain unchanged; tests are not rerun for this documentation-and-commit operation.
