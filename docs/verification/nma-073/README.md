# NMA-073 authentication verification

Date: 2026-11-14. Scope: PostgreSQL-backed user authentication, guarded initial-owner binding, browser/device sessions, native public-client S256 PKCE and continuous session fencing. The [implementation contract](../../architecture/user-authentication.md) owns setup, schema, routes, native token semantics and boundaries. This report does not establish organization/data isolation, product onboarding, actual Tauri integration, real email-provider delivery, HTTPS deployment or distribution.

## Source and setup

Git base: `96a99a550d4680a29df98dd049d6db331509feee`, plus the working-tree sources recorded in the manifest. Pre-existing NMA-072 local-cutover changes, retained installation data, credentials and unrelated work were preserved. Initial implementation verification did not create a commit, push, activate live auth or deploy. The cleanup/local-delivery verification is recorded below.

- Bun **1.3.10**, TypeScript **7.0.2**, Elysia **1.4.30**, `pg`/`@types/pg` **8.23.1**.
- Better Auth and OAuth Provider **1.7.23**, exact pins in server package and `bun.lock`.
- Disposable PostgreSQL **18.1** using `postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29`, tmpfs data, random private password and random loopback port, cleaned up by the existing verification runner. The retained OrbStack/application database was not used.
- Each auth test uses its own application and auth schemas, random auth secret, controlled email capture, real loopback HTTP server and a separate native callback listener. No real email, model-provider invocation or native Cua deployment is involved.
- Published package integrity: `better-auth` SHA-512 `5+nXB7AmlfZv/8vqknX/aTWya02qbMuk+v4BK5U7qYZH97Aj/Rxwv1RrP5ol9HZGmxQVzMhCnTUT0JTLdzyhLA==`; `@better-auth/oauth-provider` SHA-512 `Y2KwkpmvGJ7ob3TLeg8s6RTO06ExqxECtJ7oJFuGkcAM4GTFtpbBMa9yA5qjlZ2BZLMOw2/G2fqauSBryJAF1w==`.
- Retained auth SQL SHA-256: `e71c66f708d29f7d35d1e7857859a8e95cc993365843ffb580f7d9e95e9cf0d4`.
- Installed Better Auth migration module SHA-256: `3f5bdad9b790ee8e0e958a0645b01957c6fa029c75b34da461be0aff0713528a`.
- Installed OAuth authorization/token implementation SHA-256: `96c57ff2076c0b074c7c2de47a2cdcb354753ee7642f45d582f923f0b13fd0c3`; token hashing/resource module SHA-256: `a9c6f30f98fb0ba7552b2b3c20b71334629f82691cdcafb3232e39d2f1c62a07`.

The initial representative compatibility test completed signup, public native client registration, S256 code authorization and token exchange through Elysia/PostgreSQL over real HTTP **before** expanded production configuration was implemented. The final suite retains that independent compatibility test as well as the complete application boundary tests.

## Executed checks

Commands run from the repository root:

```sh
bun scripts/verification/nma072/run-tests.ts tests/auth
bun run test:server
bun run --filter @ngertiin/server typecheck
bun run --filter @ngertiin/server lint
bun run docs:check
```

The schema-generation regression compares the complete retained SQL with the exact provider options plus Ngertiin ownership tables. Deliberate regeneration uses `NGERTIIN_WRITE_AUTH_SCHEMA=1 bun scripts/verification/nma072/run-tests.ts tests/auth/schema.test.ts` on disposable PostgreSQL, followed by reviewing the SQL and checksum.

The final outcomes are recorded below; [the exact source manifest](source-manifest.json) pins the code prepared for local delivery; [the initial source manifest](implementation-source-manifest.json) retains the original cohort snapshot. Test output contains test names/counts and fixture timing, not passwords, auth headers, OAuth codes or tokens.

| Cohort | Planned / executed | Outcome |
| --- | --- | --- |
| Initial pinned compatibility flow | 1 / 1 | Pass, 7 assertions |
| Focused auth/schema/native/security tests | 20 / 20 | Pass, 141 assertions; [log](auth-focused.log) |
| Full backend regression | 445 / 445 across 52 files | Pass, 2,710 assertions; [log](backend-regression.log) |
| Backend TypeScript | 1 / 1 | Pass; [log](typecheck.log) |
| Backend Biome | 1 / 1 | Pass, no warnings; [log](lint.log) |
| Documentation consistency/local links | 1 / 1 | Fails on the same 8 pre-existing skill-reference links; [baseline](docs-check-baseline.log), [final](docs-check-final.log), [comparison](docs-check-comparison.json); 0 new failures |

## Acceptance coverage

| Boundary | Evidence |
| --- | --- |
| Initial Owner is not first public signup | Unverified login denied; verified unbound account denied application entities/events; intended verified email required for bootstrap; unauthorized account/anonymous claim rejected; expiry, replay and concurrent double claim rejected; only one winning transaction; no operator HTTP grant issuance |
| Browser lifecycle and safe session transport | Real HTTP registration, controlled verification delivery, login, safe session/device list, renewal, device revoke and logout; cookies HttpOnly/SameSite; separate HTTPS-configured provider response serializes Secure cookies; missing/foreign Origin mutations rejected |
| Native client contract | Real HTTP authorize/code exchange with S256; separate loopback callback receives code/state/issuer; client helper validates state, issuer, redirect and duplicates before a one-use exchange; no client secret; opaque access plus rotating renewal credentials |
| Negative OAuth cases | Incorrect verifier, callback redirect, requested API audience, code replay, plain PKCE and public/admin registration rejected; expired session cannot renew/open API/SSE; invalid callback issuer/state rejected |
| Independent device revocation | Browser and native receive different session IDs; device revoke leaves another login active; native device remains valid after authorizing browser logout; password recovery retires browser/native and offline credentials; API/SSE are denied after revocation |
| Continuous delivery | Existing real HTTP SSE closes after session/token revocation; per-device Computer viewer ticket/renewal fenced using a controlled Cua RPC fixture; abort closes the view; another session cannot renew the issuing session's view |
| Durable auth state | Reopening auth service preserves valid sessions and explicit Owner mapping; signup/logout never becomes a domain receipt/event and logout preserves retained agent records |
| Secret handling | Browser JSON token removal, no raw session-list endpoint, safe own-session projections, generic errors, controlled delivery only, explicit token hashes, auth data excluded from domain events/receipts, provider logger disabled; existing harness environment allowlist excludes auth/email configuration |
| Dependency/schema/contract provenance | Exact pins/lockfile, checked SQL/checksum, independent compatibility test, source hashes, route/auth-class export and native contract documented; account contract keeps NMA-079 pending |

## Failed iterations and corrections

The first expanded schema attempt rejected an incompatible hashed-client-secret option with the opaque-only provider; that option was removed because the fixed public native client has no secret. Initial application integration exposed a UUID/text mismatch in the owner-binding foreign key; the retained schema now uses UUID consistently. A later HTTP iteration tried parsing empty redirect bodies as JSON, turning successful email verification/authorization into a 400; redirects now retain their transport. The same empty-body behavior was separately corrected for OAuth revocation. Formatter-only failures were corrected. These failed iterations are not counted as passing acceptance evidence; the final cohorts use the corrected sources.

The pinned OAuth provider intentionally permits some `offline_access` behavior beyond an ended authorizing session. Ngertiin adds a distinct native session, explicit refresh-session validation and offline-token revocation to enforce application device semantics. Tests exercise browser logout separately from native revocation/password recovery. This is a local adaptation, not a claim that upstream session-bearer and OAuth-token plugins are interchangeable.

## Limits and remaining gates

- Account-mode activation on the retained local installation is not performed. It requires the operator's actual HTTPS origin, private random secret, Resend sender/key and explicit Owner email. The current local-development UI continues using its retained private installation-token profile.
- The email adapter is implemented, while verification uses controlled capture. No message was sent to a real person; real Resend sender/delivery is unverified.
- HTTP/native probe traffic is loopback HTTP under the explicit development exception. Secure-cookie serialization is checked separately under an HTTPS provider configuration. Certificate-validated ingress/proxy behavior is NMA-082; this is not deployed HTTPS proof.
- The Computer viewer test uses fixture RPCs and the real session lease, not a new live Cua/native-provider cohort. Existing machine regression tests retain their original scope. Cross-user execution isolation remains NMA-076.
- The native probe is headless. Web login/reset screens, actual Tauri system-browser listeners, OS credential storage, renderer transport and profile/cache isolation remain NMA-080/081.
- Registered accounts do not receive owner-wide data merely by logging in. Organization roles/invitations and scoped private/Team data remain NMA-074/075. No new multi-user privacy or full API-readiness claim is made.
- SSO/SCIM, mandatory passkeys/MFA and Codex/Muse subscription authentication remain outside NMA-073.

## Cleanup and scoped local delivery — 2026-11-14

Cleanup removes unchecked native-identity casts after validation, uses the shared native-client identifier, avoids repeated URL parsing and makes route authentication classification explicit. Authentication behavior and the unactivated local-development profile are preserved. The final [source manifest](source-manifest.json) records the prepared code; [the initial manifest](implementation-source-manifest.json) remains tied to the initial 445-test mixed-worktree cohort.

An isolated Git worktree was materialized from the staged tree and installed with `bun install --frozen-lockfile --ignore-scripts`. It excludes all pre-existing NMA-072 SQLite/OrbStack changes, including the additional SQLite-backup test, so this cohort has 444 tests across 51 files. [Structured results](cleanup-2026-11-14/checks.json), [full backend output](cleanup-2026-11-14/backend-regression.log) and [PostgreSQL rerun](cleanup-2026-11-14/authority-rerun.log) retain their exact outcomes:

| Check | Outcome |
| --- | --- |
| Authentication cases within the complete staged-source cohort | 20 pass, 0 fail |
| Complete staged-source backend cohort | 443 pass, 1 fail, 2,695 assertions |
| Isolated PostgreSQL cohort rerun | 11 pass, 0 fail, 57 assertions |
| Backend TypeScript and Biome | Both pass; 217 files checked, no lint warnings |
| Documentation | Same 8 pre-existing imported GPUI-reference link failures; no new failures |

The unchanged `authority session loss fences an in-flight publication and a pooled reconnect never owns its lock` test expected `STALE_DISPATCH` but observed a successful transaction in the full cohort. The test resumes its writer after `pg_terminate_backend(pid)` returns; that default call acknowledges the signal rather than waiting for termination, as specified by the [PostgreSQL server-signaling documentation](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL). This is consistent with a termination-timing race, but the root cause is not conclusively proven or fixed here. `Store`, the PostgreSQL test and the fixture helper are byte-identical to the base revision, and the isolated 11-test PostgreSQL rerun passes. This cohort is recorded as flaky, not as an all-green full regression. No unrelated persistence change was folded into NMA-073.

The local commit stages only NMA-073 hunks in `.env.example`, `README.md` and the backlog index. Fifteen unrelated file hashes were checked unchanged. Raw evidence bytes are preserved: the original `backend-regression.log` contains runner-added spaces on prefixed blank lines and is the only ordinary whitespace-check exclusion. [The evidence hash manifest](evidence-sha256.json) pins every retained log.
