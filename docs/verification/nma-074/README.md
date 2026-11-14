# NMA-074 organization administration verification

Date: 2026-11-14. Scope: backend organizations, Owner/Admin/Member policy, multiple Workgroups, explicit audiences, invitations, durable membership provisioning, membership/private-work generations, administrative audit/export and additive authentication migration. [Contract](../../architecture/organization-access.md), [milestone](../../backlog/NMA-074.md), [source manifest](source-manifest.json) and [structured results](checks.json) define the evidence boundary.

Git base: `cc1475eba81b6edcef721c0ba97c5439b0a56b61`, plus the working-tree source hashes in the manifest. The initial regression tree includes pre-existing NMA-072 local-cutover changes, pinned by [the implementation manifest](implementation-source-manifest.json). Of 18 pre-existing modified/untracked files, 17 retain their exact initial SHA-256; the shared backlog index is intentionally extended for NMA-074 while retaining its existing NMA-072 amendment. Initial implementation verification did not create a commit, push, deploy or change retained databases/credentials. The cleanup and scoped local-delivery cohort below checks the prepared NMA-074 source independently of those unrelated changes.

## Setup and commands

- macOS ARM64 development host; Bun **1.3.10** (`30e609e0`), Better Auth/OAuth Provider **1.7.23**, Elysia **1.4.30**, `pg` **8.23.1**, Zod **4.4.3**.
- Disposable PostgreSQL `18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29`, created by the existing NMA-072 runner with tmpfs storage, a random credential and loopback-only port. No test-database override was present. The runner removes the container on completion. Test fixtures separately drop their application/auth schemas and temporary directories.
- Real Elysia HTTP over ephemeral loopback ports, verified fixture accounts and HttpOnly cookies. Email verification/recovery/invitations use controlled capture; invitation delivery failure is injected without contacting Resend. One new native organization case completes public-client PKCE and uses the resulting access token over HTTP; it is headless, not an actual Tauri UI flow.
- Version-1 auth SQL is preserved. The schema test generates/reviews only the version-2 provider addition and verifies the fully extended schema against the pinned provider. The upgrade case seeds version-1 users/session/Owner binding, applies version 2, verifies retained identity and rejects a changed historical checksum.

```sh
bun scripts/verification/nma072/run-tests.ts
bun run --filter @ngertiin/server typecheck
bun run --filter @ngertiin/server lint
bun run docs:check
```

The commands above do not activate account mode or reset the retained local installation. No real email, provider inference or external app action is sent.

## Initial implementation results

| Cohort | Executed denominator | Result | Evidence |
| --- | --- | --- | --- |
| Complete backend regression | 464 tests / 53 files / 2,917 assertions | 464 pass, 0 fail | [Raw log](backend-regression.log) |
| New organization HTTP/PostgreSQL cases, included above | 19 tests | 19 pass, 0 fail | `tests/organizations/http.test.ts` section in the raw log; [structured breakdown](checks.json) |
| Existing authentication cohort, included above | 20 tests | 20 pass, 0 fail | Four `tests/auth/` sections in the raw log |
| Backend TypeScript | One invocation | Exit 0 | [Log](typecheck.log) |
| Backend Biome | 227 files | Exit 0, no warnings or fixes | [Log](lint.log) |
| Documentation consistency/local links | One final invocation | Same eight pre-existing imported GPUI-reference link failures; no new failures | [Baseline](docs-baseline.log), [final log](docs-check.log) |

The earlier retained NMA-073 authority-loss timing limitation remains historical. The unchanged PostgreSQL authority-loss case passes in this complete cohort; this does not claim that its prior timing race was fixed here.

## Organization acceptance matrix

| Responsibility | Observed result |
| --- | --- |
| Account roles across two organizations | The same account is Owner in one and Member in another; the second organization rejects its administrative mutation. An unrelated/guessed organization is denied. |
| Creation entitlement | A Member has no creation entitlement by default. An operator grant permits creation without elevating the member in their existing organization. Concurrent creation respects the limit. |
| Owner/Admin/Member capability matrix | Owner-only elevation; Admin can manage ordinary members/Workgroups but cannot invite Admin, grant a role or remove an Owner. Member management is denied. Administrative capabilities never grant private-context reads. |
| Last Owner | Single-Owner removal/demotion fails. Concurrent self-demotions of two Owners serialize and retain exactly one Owner. |
| Multiple Workgroups / audience union | Two Workgroups authorize their union. Removing one membership preserves the other grant; deleting the remaining group removes access. Empty selected groups grant nobody. Explicit All members remains distinct. An Owner without the selected Workgroup has no implicit invocation grant. |
| Cross-organization references | Wrong-organization memberships/Workgroups fail through HTTP and composite SQL constraints. |
| Invitations | Review and acceptance require the intended verified email. Expired/canceled invites fail. Current inviter role/generation and deleted Workgroups are rechecked. |
| Concurrent acceptance | Four acceptances using repeated and different command IDs yield one membership and provisioning intent, with no new agent/model execution. |
| Interruption/atomicity | An injected failure during the acceptance audit rolls back membership, Workgroup links, provisioning, receipt and invitation acceptance. Retrying the same command after removing the fault succeeds. |
| Email delivery failure | Failed delivery retains the pending invitation; explicit retry preserves its provider delivery identity. A recorded sent delivery is not resent. Actual Resend delivery is unverified. |
| Removal/rejoin | Removal denies access, fences prior contexts, suspends the private-work principal and intent, and retains domain data/audit attribution. Rejoin advances membership generation, retains the intent ID and keeps private work suspended. Old accepted invitations/receipts cannot revive access. Only a fresh explicit self-resume clears suspension. |
| Retention/export/deletion | Export contains organizational metadata and excludes private content/credentials. It is Owner-only; organization deletion remains denied. Team ownership and private reassignment boundaries are documented. |
| Reopen and unavailable AI setup | Membership/intent persist through a second auth service opening, without a configured AI account/model. No Tobi/DM materialization is claimed. |
| Authentication/mutation boundary | Raw Better Auth organization operations are not mounted. Foreign Origin and installation bearer requests fail. Native PKCE receives the same Member restrictions. |
| Command replay and contract export | Missing UUID command IDs fail; identical retries return one result; changed payloads conflict without echoing input. Account contract enumerates all 27 organization/invitation routes with request, response, auth and command semantics. |

## Intermediate failures retained

The first extended-provider integration run passed 3 cases and failed 17 before sign-in because the migration verifier correctly rejected the required extra `teamMember.organization_id` column as unknown to Better Auth. [Original failure log](intermediate-auth-failure.log). A minimal [schema diagnostic](intermediate-schema-failure.log) identifies that exact finding. The fix declares the organization-scoped team-membership field through the companion provider schema before generating migration 2, so provider inspection and the composite product constraints agree.

An [intermediate organization/auth cohort](intermediate-auth-organizations.log) subsequently passed 37/37 tests (17 organization plus 20 auth), before the additive-upgrade and native-organization cases were added. Intermediate sources were still being edited; their logs are diagnostic history, not the source manifest for the final 464-test cohort. The final manifest pins the completed source, and [evidence hashes](evidence-sha256.json) pin retained report/log bytes.

## Limits and handoff

- This milestone verifies organization administration and its durable membership execution-principal state. NMA-075 must consume that fence throughout scoped Goals/Routine, admission/dispatch/replay and data APIs. Existing single-owner responsibilities were not relabeled as organization data, and no already running multi-user scheduler or Team-agent ownership migration is claimed.
- The provisioning intent is durable and idempotent; private Tobi/DM materialization belongs to NMA-075. General private application APIs remain restricted to the explicitly bootstrapped account. Administration does not grant private-data access.
- Controlled delivery is not real provider email. A crash or timeout leaves retryable pending/failed delivery; a provider timeout may have sent the message. The stable key uses [Resend's documented 24-hour deduplication window](https://resend.com/docs/dashboard/emails/idempotency-keys), without claiming indefinite exactly-once delivery.
- SQL constraints and auth-schema locks are not application-table RLS or OS privacy evidence. NMA-075 owns application-data authorization/RLS; NMA-076 owns native execution domains and viewer isolation; NMA-077/078 own provider/app scopes.
- No live account-mode activation, deployed HTTPS, actual Tauri secure storage, web/mobile onboarding UI, native Cua/provider cohort, server restore or fresh-device distribution is claimed. NMA-079, NMA-080/081, NMA-082/083 and NMA-063/064 retain their gates. Desktop-rs remains paused.

## Cleanup and scoped local delivery — 2026-11-14

Cleanup separates route classification from HTTP registration, moves organization metadata/invitation-list queries into the service, makes newly created organization scope explicit rather than casting a generic result, requires a resolved membership context for removal, and replaces nested email-copy branches with a purpose-keyed mapping. HTTP shapes, role policy, schema and lifecycle boundaries are preserved.

The staged source was materialized in an isolated Git worktree and installed with `bun install --frozen-lockfile --ignore-scripts`. It excludes all 17 pre-existing NMA-072 file changes and its local-cutover paragraph in the shared backlog index. The final [source manifest](source-manifest.json) pins all 25 relevant source files and the exact verification tree; the [implementation manifest](implementation-source-manifest.json) remains tied to the earlier mixed-worktree cohort.

| Check on prepared NMA-074 source | Outcome | Evidence |
| --- | --- | --- |
| Complete isolated backend cohort | 463 pass, 0 fail; 52 files, 2,892 assertions | [Raw log](cleanup-2026-11-14/backend-regression.log), [structured results](cleanup-2026-11-14/checks.json) |
| Organization/auth cases included above | 19 organization + 20 auth pass | Sections in the complete log |
| Backend TypeScript and Biome | Both exit 0; 227 files checked, no lint warnings | [TypeScript](cleanup-2026-11-14/typecheck.log), [Biome](cleanup-2026-11-14/lint.log) |
| Frozen dependency install | Exit 0; install scripts disabled | [Install log](cleanup-2026-11-14/install.log) |
| Documentation consistency/local links | Same 8 imported GPUI-reference failures; no new failures | [Log](cleanup-2026-11-14/docs-check.log) |

The isolated cohort has one fewer test than the initial 464-test mixed-worktree run because the uncommitted NMA-072 SQLite-backup test is intentionally excluded. The unchanged PostgreSQL authority-loss test passes in both recorded cohorts. Raw initial/intermediate logs retain their original bytes.

The prepared local commit contains only NMA-074 implementation, tests, specifications, status and evidence. The 17 unrelated file hashes and the shared backlog's retained NMA-072 paragraph are verified unchanged. No push, live configuration activation, retained-data reset or deployment is part of this delivery.
