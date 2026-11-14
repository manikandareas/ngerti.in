# NMA-075 verification

Date: 2026-11-14. Scope: account-mode private application data and Team-agent configuration on PostgreSQL, with the owner's single-syllable default-name amendment. See [the implementation contract](../../architecture/scoped-agent-data.md) and [milestone](../../backlog/NMA-075.md).

## Cleanup and scoped local delivery

The owner-requested [cleanup and delivery addendum](cleanup-2026-11-14/README.md) verifies the exact staged source independently of earlier NMA-072 local-cutover work. Its delivery manifest supersedes the mixed-worktree source snapshot for commit verification; the original raw logs and manifest remain unchanged.

## Setup and evidence boundaries

Tests use disposable PostgreSQL 18.1 from the pinned `postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29` image, loopback HTTP, independent authentication/application schemas and controlled email capture. The runner forces both test/application database URLs to this disposable database. It does not use the retained development database, activate account mode, remap live data, copy provider credentials or send real email.

Versions are Bun 1.3.10, `pg`/`@types/pg` 8.23.1, Elysia 1.4.30, Better Auth/OAuth Provider 1.7.23, Zod 4.4.3, TypeScript 7.0.2 and `unique-names-generator` 4.7.1. The existing pinned name dictionary is filtered to a curated single-syllable subset, without a dependency update.

The worktree already contained unrelated NMA-072 local-cutover changes and its SQLite-backup test. They are preserved. The full regression includes that pre-existing test; its result is distinguished from the newly authored NMA-075 cases. The importer needed an additional scoped-role adaptation: fixed administrative sequence maintenance, all-scope empty-target checks and nullable schema-extension reconciliation. Original backup/cutover corrections remain intact.

The retained final-run artifacts are [backend output](2026-11-14/backend.log), [server TypeScript](2026-11-14/server-typecheck.log), [web TypeScript](2026-11-14/web-typecheck.log) and [server Biome](2026-11-14/server-lint.log). The [source/config manifest](2026-11-14/source-manifest.json) identifies the final implementation in the mixed worktree. [The complete verified regression](2026-11-14/backend-verified.log) passes 481/481 tests across 54 files with 3,081 assertions (302.42 seconds), before the final receipt-grant refinement. [The final affected cohort](2026-11-14/scoping-final.log), after that refinement, passes 29/29 tests across two files with 222 assertions (18.97 seconds): all 17 NMA-075 cases and 12 persistence cases. The latest results cover 482 unique tests; there was no single 482-test full-suite run. Both TypeScript checks and server/web Biome pass; [web Biome output](2026-11-14/web-lint.log) is retained. [Documentation checking](2026-11-14/docs-check.log) retains exactly eight pre-existing imported GPUI-reference link failures and no new failures.

## Access matrix

All scenarios below use real PostgreSQL queries; account scenarios use real loopback HTTP and verified fixture sessions. Source entities and their derived records use the same scoped SQL context and RLS. `actor_id` is not inferred from a shared agent identity or administrator role.

| Surface | Positive evidence | Negative evidence |
| --- | --- | --- |
| Default agent/DM/welcome | Concurrent provisioning retains one private identity and library-generated name, with no run/inference | Owner cannot get another user's default agent; rejoin does not duplicate it |
| Team configuration | Authorized users read one organization-owned profile; Owner/Admin manages it | Member cannot rewrite shared instructions; administration alone cannot invoke a restricted audience |
| Private conversation | Two people have different DMs for the same Team agent | Cross-user generic get/list, snapshot and history refuse private data |
| Memory/retrieval | The owner reads their private facts, including legacy `shared` visibility within their own scope | Another user, including Owner, cannot retrieve those facts |
| Staging/files/outputs | Private message commit retains immutable bytes; authorized download returns actual content | Foreign upload/artifact/document access is denied; working-file access cannot reach the historical shared machine |
| Parsing/cache | Authorized source download permits a retained derived-document record | Other users cannot list derived records; existing cache regression rechecks authorization and source integrity |
| Preferences | User-specific overlay is retained separately | Another user sees neither the preference nor a rewritten shared profile |
| Shared knowledge | Explicit authorized publication produces an audience-readable record | Member publication is denied; ordinary memory/chat is never promoted |
| Receipts/idempotency | Exact retry returns the original private admission/run | Other users cannot read receipts; removed/rejoined generations and revoked Team-agent audiences cannot replay them or commit a duplicate |
| PostgreSQL role/pool | Statement role is non-owner/non-superuser/non-BYPASSRLS across alternating pooled actors | Other actors' rows are invisible; migration mutation is forbidden |
| Restricted database login | A separate real NOINHERIT login successfully selects the restricted runtime role and reads its scope after reopening Store | The login owns no application table and has no superuser/RLS-bypass authority |
| Database references | Same-scope entity/provisioning/native metadata persists | Cross-organization references and cross-user native-connection references fail in PostgreSQL |
| Team offboarding | Organization agent remains usable after its creator leaves | Former member loses access; no private transcript is transferred |
| Events/history/cursors | Scoped pages and captured-context SSE deliver authorized events | Cross-user/old-context replay fails; removal closes an existing stream |
| Organization switching | Parallel requests with independent organization headers retain their original DM/command identities | A user's other organization cannot read the original organization; an outsider has no membership |
| Goals/Routine | Private responsibility scheduling uses a durable user/organization principal | Owner cannot read another person's responsibilities; private native claims remain closed pending isolation |
| Groups/routing | One human can create a group with their personal and authorized Team agents | Another user's agent cannot be enrolled or selected as responder |
| Native binding metadata | Two actors persist separate same-Team-agent bindings using private fixture connections | Another actor cannot retrieve the binding or inject a foreign connection |
| Retained-owner mapping | Guarded, repeated identical mapping preserves IDs, names and scoped history | A non-bootstrap member cannot map it; old owner-wide data routes close after mapping |

Native-binding metadata is fixture proof, not actual remote provider execution. The existing full regression separately exercises local single-owner adapter/tool fixtures. New multi-user native provider/Cua dispatch, app account routing, real browser/Tauri cache switching, external email, deployed HTTPS, distribution and capacity are not claimed here; their gates remain NMA-076–083 and NMA-063/064.

## Intermediate failures and corrections

The first scope tests exposed missing response-contract registration, a test reading the wrong provisioning wrapper, raw SQL constraint errors being translated to HTTP 500, and inconsistent parameter inference in legacy mapping. These were corrected with explicit response schemas, the actual response wrapper, sanitized constraint errors and explicit UUID assignments.

The first full regression was interrupted after old fixed-name/handle expectations, the entity inventory and privileged test setup failed under the newly restricted role. No final pass denominator is claimed for that interrupted run. Fault injection now uses a test-only administrative connection; application privileges remain restricted. A subsequent focused cohort passed 61/62, with the remaining legacy fixture missing a new nullable command field. Further importer iterations exposed restricted `setval` permission and extension-column reconciliation; both now use the bounded import maintenance path and explicit legacy projections. The corrected persistence/scoping cohort passes 26/26. The first full successful run passes 480/480 ([retained output](2026-11-14/backend.log)). A subsequent 481-test run exposed an invalid manually constructed unknown-run fixture ([retained failed run](2026-11-14/backend-final.log), 480 pass/1 fail). That fixture now uses actual claim/settle/reconcile lifecycle transitions, and the next complete run passes 481/481. Final receipt-grant hardening and its additional regression pass the 29-test affected cohort listed above. Intermediate tool output was not saved as standalone raw files; these observed failure categories and focused denominators are retained here instead of relabeling failed runs as passes.
