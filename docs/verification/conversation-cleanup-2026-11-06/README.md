# Conversation cleanup and local delivery

Date: 2026-11-06. This records the cleanup after the accepted interaction UI follow-up. Product behavior is unchanged by the refactor.

## Changes

- The retry guard and published retry eligibility reuse one unresolved-effect predicate, preserving conflict and reconciliation error behavior.
- Native question and approval presenters have separate modules. Native orchestration keeps its request identities, acknowledgments and recovery fences.
- Studio reuses the production assistant row. Unused identity props were removed; group avatars and DM presentation remain consistent.
- Computer status labels and interaction payload construction use explicit branches. New tests assert their claimed runs and dispatch tokens instead of relying on non-null assertions.

## Verification

| Check | Result |
| --- | --- |
| `make check` | Pass: lint, typechecks and 411 backend tests |
| Frontend unit tests | 50 pass, 0 fail |
| Conversation/Studio/avatar browser regression | 14 pass, 0 fail; desktop and mobile |
| Native/product interaction and retry browser regression | 22 pass, 0 fail; desktop and mobile |
| `make build` | Pass; existing large-chunk advisory |
| `make docs-check` | Baseline failure: 85 historical broken-link occurrences, 75 unique links; no new broken links |

The historical-link baseline was compared against document contents from commit `69ac673412ca155aa18db2d6ed3be1df751efd40`. Archived source references were not rewritten. Browser checks use isolated HTTP/protocol fixtures with application persistence; cleanup does not claim a new provider-native or active Computer cohort.

Machine-readable results: [verification.json](verification.json). Raw command output is retained under `logs/`; [conversation report](conversation-report.json) and [interaction report](work-report.json) preserve per-test results. Immutable evidence whitespace, when present, is recorded with exact hashes in [whitespace-exceptions.json](whitespace-exceptions.json).

## Earlier evidence

- [HITL history, mention and avatar follow-up](../conversation-followup-2026-11-06/report.html): nine screenshots from direct computer use.
- [Full earlier computer-use report](../computer-use-2026-11-06/report.html): original 33-scenario report and its original limitations.
- [Implementation verification](../conversation-implementation-2026-11-06/README.md): backend, protocol, browser and native evidence for their captured scope.

Delivery is split into backend, frontend and evidence commits. The unrelated Tauri skill and lockfile changes remain uncommitted. No push or deployment was performed.
