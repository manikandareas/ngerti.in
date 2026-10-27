# NMA-034 implementation verification

Reviewed on 2026-10-27 against the live [NMA-034 specification](https://app.notion.com/p/404abdd618738183a3b1f1f048428268) and its [delivery evidence](https://app.notion.com/p/406abdd6187381128d03e2dbcb7edbc0).

**Verdict: Review. One reproducible memory-identity defect prevents unconditional feature acceptance.** The original delivery evidence remains valid for its tested cases; the new case exposes an uncovered native batch path. No implementation code was changed during this review.

## Blocking finding

### P2: Mixed native memory batches assign corrected content to the wrong identity

`apps/engine/src/ngertiin_engine/learning_store.py:120-182` computes removed and added contents by comparing the old and final native lists, then pairs them by array position. That cannot distinguish a deleted entry from a patched entry.

Reproduction through the real pinned Hermes gateway:

1. Store two independent memories A and B, ordered by their existing IDs.
2. Invoke the native memory tool with a single batch: remove A, patch B to new content.
3. The native operation reports success.
4. Actual persisted state: A's ID is active with B's corrected content; B's ID is tombstoned. A's source history is attached to the corrected B content, while B's original source provenance is absent from that active record.
5. Expected: A is tombstoned and B retains its stable ID, its own original provenance, and a new revision.

Observed IDs in the disposable reproduction: removed A `96d794fa-b2d5-55b5-957a-8679c9988c50`; patched B `b7597fd7-f694-5102-8053-81f46492f9a3`. The surviving record incorrectly uses A's ID. The reproduction fails on the stable-ID assertion after confirming a successful tool response and inspecting the actual database rows.

This violates unit 1's stable identity, revision/provenance and preserved-memory data contracts. It can make later correction/history references address the wrong memory. The cause also affects batches that independently remove one fact and add another: a newly added fact can inherit the deleted fact's identity.

Required repair: carry original entry identity through native operation matching and batch transformations, while retaining native atomic validation and budget semantics. Tombstone actual removed identities; allocate new IDs only for additions. Verify remove+patch, remove+add, multiple patches, retries and restart, including provenance. Do not infer identity only from before/after list positions.

Executable reproduction: [test_memory_batch_identity.py](evidence/nma-034-review/test_memory_batch_identity.py). Raw failure and database evidence: [batch-identity.log](evidence/nma-034-review/batch-identity.log).

## Acceptance coverage

| Area | Review result |
| --- | --- |
| Memory, recall and provider | Existing memory/correction/forget/restart, recall and scope tests pass. Mixed native batch identity fails. Historical actual Hindsight evidence inspected; provider service was not restarted or rerun. |
| Complete skills/catalogs | Install/conflict/rollback/assets/readiness tests pass. All 210 catalog entries classified (7 supported, 197 setup-required, 6 excluded); all 1,156 catalog asset hashes match. |
| Learning/curator | Existing revision, concurrent correction, migration/backfill, backup/restore, active-execution protection and curator restart tests pass. Historical real-model learning evidence retained. |
| Office/PDF | Fresh deterministic gateway/capsule tests create, edit, validate and publish DOCX/XLSX/PPTX/PDF after restart. Research/coding assets and missing-asset readiness pass. Existing authenticated download and visual evidence reviewed. |
| Combined completion | Not satisfied until the native batch identity defect is repaired and verified. Release reliability gates remain separate. |

## New execution and integrity

- Learning, lifecycle, scoped context and actual native document/research/coding regression: **14 passed, 0 skipped**, 117.27 seconds.
- Additional memory batch identity reproduction: **1 failed**, 5.09 seconds. The failure is the expected stable-ID assertion, not setup or transport failure. One pytest marker-registration warning results from collecting this evidence-local test outside the engine pytest configuration.
- Backend regression: **28 passed**, using an ephemeral pytest environment after the project interpreter reported that pytest was unavailable. Both attempt logs are retained.
- `make check`: passed (web lint/typecheck, backend/script Ruff/format, backend mypy).
- Engine source/test Ruff: passed. Tracked diff whitespace check: passed.
- Existing evidence: **72/72** recorded file hashes match.
- Catalog assets: **1,156/1,156** hashes match across 210 entries.
- Pinned Hermes source seams: **153/153** hashes match revision `7489b22af47ce91b366dde81d5831ea422577498`.
- Tested document image: `sha256:6580374cc2db359e4db9723c7a1c679a6b609d1a0fa91b1432cd3df9096adb6d`.
- Test interpreter: `.dev/nma-033/verification/bin/python`; gateway interpreter: `.dev/nma-033/production/bin/python`; source: `.dev/nma-001/source`.

The live primary specification and all four predecessor pages were read: NMA-009, NMA-029, NMA-030 and NMA-031 are Done within their declared scopes. Knowledge-graph tools were unavailable in this session; source inspection used repository files.

This review did not repeat external-model calls, the actual Hindsight service test, authenticated browser actions, or the complete broad engine suite. Those original evidence files were inspected and hash-verified, not reclassified as new executions. The current migration/backfill and backup/restore test was rerun successfully. Retained mobile UI and corrected spreadsheet page images were inspected.

The original feature cohort still has settlement p95 212.126 seconds against a 180-second release threshold, unavailable first-progress timing, and four retained uncertain receipts. These remain disclosed release limitations rather than new failures or proof of release readiness.

All new evidence is under `docs/research/evidence/nma-034-review/`. `source-snapshot.json` attributes the reviewed local working tree; existing uncommitted changes and historical evidence were preserved. No original-account migration, gateway restart, commit, push or deployment was performed.

## Resolution — 2026-10-27

The blocking finding above was subsequently repaired and verified at the user's request. The historical verdict and failing reproduction are retained as review evidence. Current status: **Done for local feature acceptance**. See [repair and closure](nma-034-closure.md) for the native receipt-based identity mapping, passing regression results and remaining release boundaries.
