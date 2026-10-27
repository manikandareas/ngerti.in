# NMA-034 memory identity repair and closure

The native mixed-batch identity defect found in the [independent review](nma-034-implementation-review.md) is repaired. The original failing evidence is preserved. The local feature completion boundary remains the [NMA-034 specification](https://app.notion.com/p/404abdd618738183a3b1f1f048428268); production rollout and release SLOs remain separate.

## Repair

`learning_store.py` now follows Hermes's per-operation mutation receipts, including exact matched entries and patch results, to retain each original memory identity through a batch. It persists only after native validation succeeds and verifies that the reconstructed content exactly equals the native final state.

- A patch retains the matched memory ID, revision lineage and original source provenance.
- A removal tombstones the actual removed ID and retains its original content/history.
- An addition allocates a new deterministic ID. Removing and re-adding identical text does not reuse a deleted identity.
- Duplicate adds and unchanged entries do not create extra rows or revisions.
- Ordered receipts preserve chained patches, patches of new additions and native first-match behavior for equal content.
- Native threat checks, substring matching, budgets, all-or-nothing batch validation, scope checks and durable receipts remain authoritative. Final-budget validation permits a temporarily oversized batch that removes enough text before completion.
- Changed/deleted identities still invalidate authorized cached contexts and fence stale work.

The receipt fields are documented in `runtime-pin.json`. The pinned Hermes source and source hashes are unchanged. No schema change or data migration is needed. The original user partition remains untouched; this is not a claim to have repaired unknown historical records in other installations.

## Verification

Fresh real-gateway tests use the pinned native runtime with a deterministic model transport and disposable owner partitions:

- Original independent failing reproduction: **1 passed**, 7.17 seconds. The pre-fix failing log remains under `nma-034-review/`.
- Mixed-batch regression plus existing learning/context/lifecycle tests: **22 passed, 0 skipped**, 107.15 seconds.
- Coverage includes remove+patch, remove+add, multiple patches, add+patch chains, duplicate adds, equal-content matches and remove+re-add. It inspects persisted IDs, correct tombstones, immutable history and source provenance; duplicate ingress reuses the same run before and after a gateway restart.
- Rejected unmatched, over-budget and emptying batches leave memory and history unchanged.
- Supplemental user-profile regression: **1 passed, 0 skipped**. The test checks a partial patch through the `new_text` alias and a batch whose intermediate state exceeds the budget but whose final state is valid. Its first assertion incorrectly expected trailing whitespace that native add deliberately strips; the test was corrected to expect native trimmed content. The unsuccessful attempt is retained separately.
- Repository lint/type/format checks and engine Ruff pass. No UI or backend behavior changed in this repair.

The earlier review's **14 passing feature tests** included real native DOCX/XLSX/PPTX/PDF and research/coding workflows, and **28 backend tests** passed. Earlier actual-model, actual Hindsight, authenticated-browser and download evidence remains retained and is not relabelled as newly executed. This repair reruns the affected memory, context, learning, migration/backfill, backup/restore and curator lifecycle paths.

Evidence and source hashes: `docs/research/evidence/nma-034-closure/verification.json`. Production rollout remains open; the historical feature cohort's p95 of 212.126 seconds exceeds the 180-second release threshold, first-progress timing is unavailable, and four uncertain receipts remain recorded without replay. No commit, push or deployment was performed.
