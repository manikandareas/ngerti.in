# DM API, streaming and recovery

Date: 2026-10-24. Authority: [NMA-011](https://app.notion.com/p/402abdd6187381b78834f3414718de28),
[product context](https://app.notion.com/p/402abdd618738113aa55c1bd18e53144),
[engine contract](https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f),
[ADR-03](nma-005-domain-contract.md). NMA-007, NMA-009 and NMA-010 were read live and verified Done.

## Delivered behavior

Authenticated `message.send` targets the persistent agent selected by the DM, never a
browser-selected runtime binding. The engine commits the user message, command/request-key
identity, immutable runtime intent, initial events and interruption fences together.
It delegates execution to the existing Hermes authority. Startup reconciles native receipts
and pending public receipts without creating a second lifecycle owner or replaying unknown
external work. Duplicate requests preserve message/run IDs; changed payloads conflict.

New input interrupts unfinished work only in its own DM. Cancelled/failed user messages remain
in history; stale assistant output is suppressed. Execution history excludes the current
persisted user message and future turns. Native joining of consecutive user messages is retained.
Cancellation publishes a durable terminal event even when provider interruption is delayed.
Pre-native preparation failures also reconcile to failed state instead of remaining recovering.

Public snapshot, run and command reads plus SSE use the owner-resolved private transport.
Messages, relevant runs and cursor are read in one authoritative transaction. Snapshots page
backward with a 100-message / 4 MiB budget; event pages have 128-frame / 4 MiB budgets. Decimal
sequences remain strings. Cursor scope/incarnation/future checks occur before SSE headers.
Disconnect does not stop a run; reconnect resumes retained events strictly after its cursor.
Final committed messages have stable author/message/run IDs and replace drafts by identity.
Provider errors publish stable codes instead of raw credentials/paths or provider prose.

## Acceptance evidence

Tests use the actual pinned Hermes service in a separate process, real SQLite/WAL, deterministic
loopback model responses and a real local HTTP/SSE backend process. Public HTTP tests inject the
verified account dependency; existing authentication code is reused, not replaced in production.
No paid-provider or browser UX acceptance is claimed. There are no UI changes in this ticket.

| Criterion | Evidence |
| --- | --- |
| Correct target agent | Two parallel DMs select different persistent agents; actual provider requests contain the expected persona and no other DM's private marker. Caller-supplied agent/owner fields are rejected. |
| Consistent history, streaming and replay | Persisted source message is visible during execution; final authored message is unique. Real SSE emits delta before completion; reconnect after engine SIGKILL returns the exact next event. Same command/request-key replay causes no additional model call. Snapshot pagination and schema-5 upgrade preserve message IDs. |
| User interrupt | New input fences the previous active run; cancelled output is absent; correction runs with scoped history. Other DM stays isolated. |
| Clear cancel/error terminals | HTTP cancel emits run.cancelled before the blocked provider returns; cancellation survives restart. Provider 401 becomes run.failed/RUNTIME_FAILED without provider error prose. |
| Crash boundaries | SIGKILL after atomic DM prepare, after native admission and after final publication preserves one user message and the original run. Reconciliation does not repeat a model call; unknown native claims may remain indeterminate. |
| Owner/cursor boundaries | HTTP owner/thread cursor mismatch is rejected before socket access. Foreign unprovisioned accounts cannot read runs, receipts, snapshots or streams. Invalid/future/wrong-incarnation cursors are rejected. |

Final verification: **53 macOS runtime tests passed**, **10 focused DM tests passed**,
**3 final real HTTP/SSE tests passed** after the final nullable-envelope adjustment,
and **9 HTTP authentication/transport boundary tests passed**. `make check`, explicit engine
Ruff/format, wheel/sdist packaging, documentation checks and diff checks passed.

Supplementary Linux aarch64 verification on an intermediate source snapshot passed **49 tests**
with **2 public-HTTP skips** (the engine container has no backend environment) and one harmless
pytest-cache permission warning. That build started before the final native request-ID history
lookup/refactor and before two additional acceptance tests; it is not a final-source Linux
claim. All final engine behavior is covered by the macOS suite; the final public transport is
also covered by its dedicated real-process rerun.

Exact final commands, results and SHA-256 hashes are recorded in
[evidence/nma-011/verification.json](evidence/nma-011/verification.json).
Author self-review covered atomic ingress, duplicate/rejected identities, interruption races,
pre-admission refusal, bounded transport, migration and the single lifecycle owner. No separate
reviewer was delegated.

Initial verification found an event-query bug: stored command receipts have thread IDs but no
event type. The public query now selects actual typed events. Predecessor reconstruction tests
were updated to remove migration 6 when reconstructing older fixtures. A model fixture initially
looked for an exact last user message; Hermes legitimately merges adjacent user turns after a
failed/interrupted response, so fixture control markers now recognize the last paragraph.
Self-review also changed source-message lookup to the durable native request identity, covering
claim before the adapter has copied back the admission ID. These corrections preceded final tests.

## Provenance, scope and operations

Hermes stays pinned to `7489b22af47ce91b366dde81d5831ea422577498`, MIT. The referenced
[Bot Mode document](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/bot-mode.md)
was read from the exact local checkout. It informs persistent identity/DM behavior and distinguishes
queued delivery from completion. Ngertiin's durable ingress/SSE and product interrupt mapping are
locally authored over the already-pinned admission, result, event and interruption seams; no
upstream code was copied or patched and no new runtime dependency was added.

Migration 6 adds `nma_dm_requests` only. See the
[operations and HTTP contract](../../apps/engine/README.md#direct-message-http-and-sse-nma-011)
for payloads, cursors, backup, exclusive upgrade and complete-volume rollback. Older migration
checksums/native data remain unchanged. No production database was migrated.

This slice uses direct authority reads, as the existing agent/thread endpoints do. It does not
implement a PostgreSQL projection consumer; ADR-03's atomic checkpoint rules remain required if
one is introduced. Empty goals and attachment rejection are explicit: goal capture, group ingress,
artifact integration and DM UI remain their ordered tickets. No engine cutover, deployment, OS
isolation, event compaction, live-provider reconciliation or exactly-once external effect claim.
The whole scoped context still follows NMA-009's existing retrieval behavior; bounded API pages
are not a claim of model-context compaction or a load-tested retention strategy.

Changes remain in the working tree on base `7fd7d78bbf0fb55f90f35b2fd7250f7508b37148`, identified
by the manifest's source hashes. No commit or push was requested or performed.
