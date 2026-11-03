# Conversation cleanup and local commits — 3 November 2026

This closes the approved conversation timeline, readable references, milestone layout, and expanded composer work. Earlier implementation, layout, and composer evidence remains in the parent directory and its follow-ups; those capture-time reports and their hashes remain unchanged.

## Cleanup

- Removed the unused client-inferred message timeline. The durable publication journal is the rendering authority.
- Removed the unused mutable status prop from the milestone renderer.
- Moved DOM wrapping measurement into `composer-layout.ts`, keeping Lexical editor lifecycle separate from layout details and preserving wrap-boundary stability.
- Replaced nested reference-label/token conditionals with explicit helpers and reused one Markdown file-link constructor.
- Read queued run history into typed records once instead of repeatedly parsing and re-serializing JSON during admission checks.
- Retained historical actor identity, immutable event order, scope boundaries, direct Routine rows, current mention styling and the approved composer spacing.

## Verification

The workspace had independent avatar work in progress. A detached, temporary checkout at baseline `4df6a93` received only the 59 selected source/contract/test/script paths, excluding that avatar work. `source-files.json` records those bytes, including deletions. All selected paths matched the checked copy before staging.

- Backend: **315 passed, 0 failed**.
- Web units: **14 passed, 0 failed**, 8,630 assertions.
- Conversation/composer browser suite: **20 passed** across desktop/mobile.
- Composer/reference browser suite: **26 passed** across desktop/mobile. These suites overlap in composer coverage; the totals are separate executions, not distinct scenarios.
- Server typecheck/lint, isolated web build/lint, strict audit-script typecheck and formatter round-trip passed. Audit formatter output was byte-identical.
- The final root web build also passed after independent avatar commit `2acf483` was present. Its existing Vite large-chunk warning remains.
- Credentials scan found no bearer/provider credential values in the retained reports. All earlier evidence manifests remained valid.
- Staged source whitespace checks passed. Raw tool logs retain their original bytes when whitespace diagnostics are intrinsic to the captured output.

The first concurrent backend run reported one failure in the existing background-descendant writer fixture. Its unchanged targeted recheck passed, followed by the complete sequential isolated 315-test pass. Process supervision and its assertions were not modified. The initial failure and successful reruns are retained separately.

Root Biome excludes verification scripts. The audit script was therefore checked through the server configuration using stdin. An initial stdin check-mode diagnostic is retained; the successful write-mode formatter/linter round-trip produced identical bytes.

## Local commit boundaries

1. `47b8e6b` — `feat(server): persist ordered conversation milestones`
2. `0f8a3ca` — `feat(web-client): unify conversation references and composer layout`
3. Verification reports and the read-only native audit helper are committed separately.

No avatar files were staged by these commits. The independent avatar commit was preserved. No push, native provider rerun, user-data reset, or deployment was performed as part of cleanup.
