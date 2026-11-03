# Semantic Goal capture

User-authorized amendment to NMA-057, 3 November 2026. The active database audit found ordinary single-run work and standalone reminders represented as Goals. Three of the nine original Goals had been explicitly requested and were not counted as capture mistakes. The broader research and collaboration cases remain contextual judgments, not a measured general false-positive rate.

## Implemented policy

A Goal preserves an outcome whose ownership, progress and useful follow-through need to survive current execution, or which the user explicitly wants tracked as a Goal. A real request, many steps, file output, temporary clarification and delegation do not establish that need by themselves. Runs and group tasks can complete ordinary work; Routine can own a schedule without a Goal. Clear implicit ongoing responsibilities are still captured automatically. Corrections reuse the identity, and unrelated follow-ups leave its scope intact.

The semantic policy and lifecycle guidance live in [goals/instructions.ts](../../../apps/server/src/goals/instructions.ts), injected with fresh state on each working turn. Aligned descriptions reach application MCP, Codex exact-schema discovery and the Muse native catalog. Native plans/checklists are distinguished from application Goals. Requested downloadable output still uses granted application file/publication tools, including when the native filesystem is restricted.

The implementation adds no keyword classifier, extra inference loop, activation form, mandatory confirmation, capability grant, payload shape change or migration. Completion evidence, revision/generation fences, cancellation intent and unknown-outcome reconciliation retain their existing domain checks. The current API contract remains 1.24.0.

## Verification method

The [native evaluator](../../../scripts/verification/goal-capture/native.ts) runs the normal application lifecycle, broker, actual native harnesses and structured tools against disposable SQLite state. It uses existing Codex ChatGPT authentication copied into a private temporary connection and an explicitly selected Muse API key. It never mutates the source database. Original Goal/Routine/message/artifact entity bytes are compared before and after evaluation. Temporary state and credential copies are removed after capturing results.

The [scenario corpus](../../../scripts/verification/goal-capture/cases.ts) has 15 contextual scenarios per harness: direct answers and research from supplied notes, requested file output with several steps, quoted/hypothetical tracking language, missing input, standalone one-shot/recurring schedules and schedule edits, implicit ownership with correction, explicit Goal tracking for small work, promotion as a conversation develops, unrelated follow-up, and a completed peer handoff. The runtime prompt contains no scenario-specific response rules.

Each scenario checks admitted execution outcomes and actual persisted Goal/Routine/artifact identities and states. Positive cases check automatic capture and waits; correction checks identity and generation. The delegation case also requires a completed child task. False-positive and false-negative scenarios are reported separately. Human inspection of retained answers and file-write inputs supplements these assertions. This corpus samples behavior; it is not a universal correctness guarantee or a benchmark for all research, languages, session histories or provider versions.

Commands from the repository root:

```sh
bun scripts/verification/goal-capture/native.ts docs/verification/goal-capture/native-final.json codex,muse
bunx biome check --config-path apps/server/biome.json scripts/verification/goal-capture
```

Commands from `apps/server`:

```sh
bun test tests
bun run typecheck
bun run lint
bunx tsc --ignoreConfig --noEmit --module preserve --target esnext --types bun --skipLibCheck --strict ../../scripts/verification/goal-capture/native.ts
```

## Retained iterations

- [Initial smoke](native-smoke.json): 5/6 scenarios accepted. Codex selected automatic execution for a DM reminder and received `SCOPE_DENIED`. The [diagnostic capture](native-routine-diagnostic.json) preserves the exact invalid selection. Run guidance and the Routine field/tool descriptions now distinguish DM's implicit executor from group selection.
- [Initial full cohort](native.json) retains its original inputs and results. Its source build predates the later file-capability clarification. A Muse file-output turn claimed global read-only status without using granted application file tools. Another Muse schedule turn sent string values in nullable fields, failed validation and exceeded the deadline; cancellation was requested without retrying it as a new run.
- [Focused file check](native-deliverable-check.json) then created the requested workspace file but did not publish an artifact. Its original save-only wording did not explicitly require download publication. The final corpus makes that requirement explicit rather than treating a saved file and a published artifact as equivalent. The retained check remains failed under its original assertion.
- The capture cohort is recorded separately in [native-final.json](native-final.json), including source hashes: 29/30 full scenarios passed, with zero observed false-positive or false-negative Goal scenarios. The remaining Muse delegation scenario created no Goal but polled its queued peer instead of ending its turn, so the peer could not start before the evaluator deadline. It remains a failed execution scenario; no capture failure is inferred from it.
- Handoff/read-task descriptions were then clarified to explain serialized group execution and why the current turn must end before a queued peer can run. The responsibility-selection paragraphs and backend queue did not change. [The focused handoff follow-up](native-handoff-final.json) records that distinct source revision and denominator. Earlier failures are not relabeled as successes or merged into the follow-up denominator.
- A [receipt-guidance experiment](native-handoff-guidance.json) also ran while the description-only follow-up was finishing. It passed, but its additional response fields and domain/test changes were not adopted: the smaller description-only change had already passed on both harnesses. The shipped source hashes match `native-handoff-final.json`; no queue or domain-response change belongs to this Goals amendment.

These checks use future schedules to evaluate creation/editing without executing the scheduled stage. They do not re-prove reminder delivery, crash recovery, installation or UI acceptance. Existing lifecycle and adapter tests cover their recorded fixture scope. Codex uses the existing selected ChatGPT subscription connection; Muse uses explicit API-key billing. No fresh login or Muse subscription claim is made. Denied optional inherited-skill reads remain visible in tool observations and do not become successful reads.

## Result and activation

- Final backend: **318 passed, 0 failed**, 2056 assertions across 33 files; [raw log](backend-tests-shipped.log). Server typecheck/lint, strict native-verifier typecheck and scoped metadata discovery pass.
- Capture cohort: **29/30 full scenarios passed**. All completed capture assertions had the intended Goal inventory. The one retained failure concerned Muse handoff execution, not an observed extra/missing Goal. Its 41 admitted runs include 39 succeeded, one cancelled and one undispatched peer.
- Shipped-description follow-up: **2/2 handoff scenarios passed**, with **6/6 succeeded native runs** across Codex and Muse, zero failed/cancelled/unknown outcomes. Current source hashes match that capture. This is a separate denominator, not a relabeling of the earlier timeout.
- Local backend was reloaded and reports API contract **1.24.0**, persistence ready, scheduler/dispatcher running and readiness gate ready. The new Routine field guidance is served by the live contracts endpoint. [Activation evidence](local-runtime.json) retains the idle-process shutdown/authority-lock detail.
- **160 original Goal/Routine/message/artifact entities remain byte-identical**, including **9 Goals and 6 Routines**. No proof requests were sent to user threads. All evaluation applications, temporary state and credential copies are closed/removed. The user's backend remains running.

See [verification.json](verification.json) for scoped checks, phase denominators, shipped source hashes and limitations. The change remains uncommitted; unrelated backend, package/lockfile and research-note work is preserved.

## Later concurrent checkout changes

After the successful captured checks and native evaluation, unrelated backend edits appeared in configuration, lifecycle, run timing schemas, routing and storage. All ten recorded Goal-slice source hashes still match. A final shared-checkout integration check during those edits produced **1 pass / 40 fail** in the focused suite; [raw log](concurrent-checkout-goals.log). Its first failure is the new `run.timings` schema requiring string entries that ordinary admissions do not provide. Global typecheck/lint also failed in those concurrent edits. These results do not replace the earlier successful capture or become a passing current whole-checkout claim.

The other edits were left untouched. The local activation record describes the source snapshot actually loaded at its recorded timestamp; it does not claim that later edits were activated. NMA-057 closure is scoped to the verified semantic Goal amendment, with this shared-workspace verification boundary recorded separately.
