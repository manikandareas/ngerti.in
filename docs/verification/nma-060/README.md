# Engine/API gate verification

NMA-060 is **In Progress**. Its independent consumer-contract and coverage work is implemented; the API readiness gate remains **pending**. This report does not open the UI phase. Live Notion prerequisite inspection found **9/10 dependencies Done**; NMA-050 is In Progress because Muse subscription-backed inference/useful product-tool use and the native interactive permission-decision cycle remain unverified. That dependency is not silently implemented or marked Done here.

The [consumer contract guide](../../architecture/api-consumer-contract.md), [versioned schema bundle](../../contracts/1.11.0.json), [consumer fixtures](consumer-fixtures.json), [coverage](coverage.json), [scope decisions](scope.json) and [prerequisites](prerequisites.json) are the reviewable gate deliverables. They separate mapping, fixture validation, retained native observations and acceptance.

## Implementation

- Fix the event-schema omission for six browser/Composio entity kinds. Derive replay variants and entity kind validation from the same registry. Preserve historical event bytes and unknown outcomes.
- Publish HTTP request schemas from actual installed routes, explicit command/operation authentication and idempotency, main response projections, tools, minimum/tested harness versions and protocol semantics. Request schemas use input/default semantics.
- Provide isolated HTTP consumer examples for snapshot/replay, tombstones, original receipts versus current state, SSE reconnect, safe errors and SQLite restart. No provider request or external operation runs in this consumer probe.
- Map all 83 live matrix decisions, including 47 required backend decisions, to their phase/disposition. Validate required route/tool/entity/test/evidence references. Mapping is not proof of acceptance.
- Refresh active startup/contract documentation. Active Bun workspace, launcher and CI do not load historical Python engines or a Hermes fallback. Historical source/evidence remains; complete remaining dead-source cleanup is still open.

## Verification and boundaries

[consumer.json](consumer.json) records six passing in-process HTTP contract scenarios. [retained.json](retained.json) checks immutable evidence files from ten prerequisites, then opens the existing native-verification SQLite database **read-only** to validate historical entity/event schemas and envelope identity. The database scan does not dispatch, reconcile, rewrite events, copy credentials or reset state. Its retained Composio unknown effects remain unknown.

Current backend tests include concurrency, privacy, revocation, cancellation and protocol/process recovery fixtures. These do not become fresh native-provider crashes. Exact final results and commands are recorded in [verification.json](verification.json); intermediate failures are retained in [iterations.json](iterations.json). Current source drift is recorded separately from immutable evidence integrity.

| Check | Current result |
| --- | --- |
| Backend suite | 231/231 pass, 0 fail/skip, 1388 assertions; includes four added contract regressions. |
| Server lint/typecheck and verifier typecheck | Pass. |
| Consumer HTTP/SSE/receipt/restart scenarios | 6/6 pass; 77 route entries, 26 entity schemas and 35 product tools exported. |
| Foundation process/HTTP and broker HTTP | 8/8 and 5/5 pass, 0 fail/skip. |
| Required coverage | 47/47 backend decisions mapped; all 83 matrix decisions retain phase/disposition. |
| Retained evidence integrity | 341/341 immutable evidence files across ten prerequisite manifests match. Source drift is separately listed. |
| Read-only historical payload validation | 2051 events across all 26 kinds and 442 entities pass; two Composio effects stay unknown. Both runtime Zod and the published event JSON Schema validate the replay. |
| Active import audit | 66 local modules, zero historical Python imports; old entry-point refusal markers remain. Full obsolete-source removal is open. |
| Native requests in this gate | Zero; retained native reports remain separate. |

The current PATH detects Codex **0.166.0**, while the retained native minimum/tested version is **0.165.0**. Detection does not establish fresh native compatibility. Muse is missing from the default PATH; the explicit existing `.dev/nma050/muse` reports **1.4.14-R7309.1**, matching the retained SDK **1.4.14** cohort. [provenance.json](provenance.json) records these observations, exact source hashes and upgrade checks.

Retained native outcomes are in the original reports, with original denominators/failures/limits: [Codex](../nma-049/README.md), [Muse](../nma-050/README.md), [identity](../nma-052/README.md), [controls](../nma-053/README.md), [files](../nma-054/README.md), [learning](../nma-055/README.md), [groups](../nma-056/README.md), [goals/Routine](../nma-057/README.md), [browser/VNC](../nma-058/README.md) and [apps/visual/research](../nma-059/README.md). They include Codex subscription and explicitly selected Muse developer credits. They are not a new frozen-build native cohort. Unsupported capability boundaries and unknown effects are not promoted to passes.

## Reproduction

```sh
bun scripts/verification/nma060/consumer.ts
bun scripts/verification/nma060/coverage.ts
bun scripts/verification/nma060/retained.ts
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun run verify:foundation
bun scripts/verification/nma048/http.ts
```

`consumer.ts` creates and removes only temporary fixture state and writes the generated contract/examples/report. `coverage.ts` validates references and writes coverage. `retained.ts` requires the existing private verification installation, or an explicit database path argument; it never initializes a replacement database. Missing state is a failure, not a skipped pass. The process/HTTP probes own and remove their temporary installations and stop their child processes. Live Notion dependency states must be refreshed again before closure; the saved prerequisite snapshot is not a live status source.

## Remaining acceptance

1. NMA-050 must close subscription request/tool and live permission acceptance with real evidence. Current scope explicitly leaves credential-unavailable acceptance open.
2. Finish reviewing/documenting operation-specific response surfaces beyond the published core projections and capture the final native integration/fault denominators on the chosen revision. Preserve prior unknowns; do not replay historical external operations.
3. Complete the remaining obsolete-source cleanup audit/removal, preserving unrelated work, data and historical evidence. No migration/dual-engine path is required.
4. Reverify all gate criteria/dependencies before setting Done. Gate Done will mean engine/API readiness only; UI, installation and production remain separate.

No commit, push, deployment, UI edit, external message, native inference or user-data reset is performed for this gate work.
