# Conversation preparation follow-up

Local follow-up to the conversation latency amendment, 4 November 2026. This
locally authored change reuses the existing lifecycle/broker and preparation API;
it imports no new upstream module or dependency and does not change the API schema.

## Behavior

- Preparation observes only the selected DM's mounted composer. Selection settles
  for 100 ms before a request; changing selection, opening Settings, pending work,
  disconnecting or unmounting cleans up listeners, scheduled retries and HTTP reads.
- Composer focus, pointer activity and input renew readiness, including Lexical's
  intercepted `beforeinput` path. Global keyboard/pointer listeners are removed.
  Returning to a visible tab can renew readiness when its composer remains focused.
- `skipped`, `preparing` and failed HTTP requests get at most four retries with
  1/2/4/8-second delays. Ready/exhausted attempts require fresh activity after a
  10-second cooldown. HTTP reads have a five-second timeout. There is no perpetual
  idle polling.
- A ready session refreshes its idle expiry. A fourth idle DM replaces the least
  recently used idle transport within the existing three-session cache; its native
  binding remains resumable. Active, queued and unknown work prevent speculative
  eviction. Final dispatch still rechecks account, grants, billing and scope.
- Existing-file submissions without uploads skip the redundant receipt GET and
  replay the exact durable POST. Plain text already uses a direct command path.
  Upload submissions retain their receipt check.

Aborting an HTTP read does not claim to cancel native initialization that the
server has already accepted. A later selection retries boundedly through the
same broker; no model inference or tool lease is admitted by preparation.

## Verification

- `apps/server`: `bun test tests/harness.test.ts tests/submission-replay.test.ts
  tests/conversation-latency.test.ts tests/attachments.test.ts
  tests/groups/attachments.test.ts` passes 72 tests. Native clients are fixtures.
  Tests cover idle replacement/resume, active/unknown protection and concurrent
  exact retries after restart with unchanged existing file bytes.
- `apps/web-client`: four focused verification unit tests pass; production build,
  strict typechecks and scoped Biome checks pass.
- The final complete Playwright conversation run passes **56/56** checks across
  desktop/mobile. The configuration includes `preparation.spec.ts` for
  navigation/Settings scope, repeated editor input,
  bounded retry through ready, retry exhaustion and selection cleanup. These
  use the real application and isolated HTTP/SQLite, with preparation responses
  intercepted; they do not establish native/provider latency.

The first complete browser run passed 55/56 checks and reported Playwright's
`Route is already handled` from the existing mobile steering snapshot fixture.
That exact test passed immediately in isolation without application changes;
the subsequent complete run passed all 56 checks with retries disabled.
Earlier preparation test failures identified Lexical's intercepted `beforeinput`
path and a desktop-only Settings selector; both were corrected before final
regression verification. No deadlines or behavioral assertions were relaxed.

A separate tool-activity amendment appeared in the shared working tree after
the initial static checkpoint. The 72 focused backend tests still pass after
those edits. The backend typecheck originally passed; a late shared-tree
check reported TS2339 at `apps/server/tests/activity.test.ts:79` (`connection_id`
on the broad fixture entity type). This follow-up does not modify that separate
test or claim a clean static check for the concurrent amendment.

Before committing, an isolated checkout of only the staged follow-up passed both
backend/frontend typechecks, scoped Biome checks, 72 backend tests, four web unit
tests and the production web build. Concurrent tool-activity changes are excluded
from that staged snapshot.

No user database reset, live inference, billing change or push is part of this
verification. The local commit is managed separately from the test runs. The existing large-chunk build warning remains. Historical
verification manifests retain their captured source hashes.
