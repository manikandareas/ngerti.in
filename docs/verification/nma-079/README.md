# NMA-079 API and isolation verification

Status: **Done** for the backend API/isolation gate. Contract **2.0.0** is the verified breaking organization/user consumer contract. The [consumer guide](../../architecture/server-organizations-api.md) defines authentication, onboarding, connection choice, retry, cursors, switching and disconnect behavior. The executable [contract](contract.json), [authentication matrix](authentication-matrix.json), [entity matrix](entity-matrix.json) and [native report](native/report.json) retain their actual denominators. The [surface matrix](surface-matrix.json) and [manifest](manifest.json) retain route outcomes and exact source/dependency hashes. Native runtime hashes must match the current engine before `report.ts` accepts the gate.

## Executed results

| Cohort | Result and evidence |
| --- | --- |
| Registered HTTP access policies | **145/145**: 135 observed account-mode successes and 10 explicit resource-state/method restrictions; [matrix](surface-matrix.json), [enumerated cases](access-cases.json) |
| Missing credentials | **142/142** protected surfaces reject access; public metadata and the separately allowlisted auth protocol are excluded from that denominator; [matrix](authentication-matrix.json) |
| Entity/private-context matrix | **37/37** entity kinds; two organizations, three member actors, one outsider and two Workgroups; [matrix](entity-matrix.json) |
| Broad regression before final scope amendments | **541/541 tests**, 4,133 assertions across 62 files; [log](regression.log) |
| Final callback, credential, notification, queue and PostgreSQL cohort | **59/59 tests**, 887 assertions across seven files; [log](final-scope.log) |
| Revoked native stop with no terminal receipt | **1/1 test** retains unknown/requested intent and forbids retry; [log](stop-timeout.log) |
| Explicit account-mode HTTP cases | **8/8 tests**, 206 assertions including same-organization foreign users and the same account in another organization; [log](surfaces.log) |
| Native Cua isolation/recovery | **12/12 checks**, one test/44 assertions; [log](cua/run.log), [report](cua/2026-11-14T14-59-51.871Z/native.json) |
| Native Codex and Muse | **4/4 lanes**, one test/28 assertions: normal HTTP admission, private binding, inference, useful `read_run_context`, own marker/thread, foreign-read denial and same-operation replay; [log](native/run.log), [report](native/report.json) |
| Server TypeScript / Biome | Pass; [typecheck](typecheck.log), [lint](lint.log) |
| Documentation | Full check retains eight unchanged imported GPUI link failures; bounded check passes after byte-verifying the three excluded imported files; [full log](docs-check.log), [bounded log](docs-scoped.log), [exclusions](docs-scoped-exclusions.json) |

An authorized resource-state error is recorded as that error, not successful execution: a queued run cannot be steered/retried, a non-completing Goal cannot recover completion, unavailable native interactions remain explicit, organization deletion stays disabled, and MCP GET returns 405 only after a valid run lease. Both foreign-user and cross-organization denial are exercised before the authorized mutation so deletion cannot hide an authorization failure.

## Implemented boundaries

- Every registered HTTP surface declares its authentication/scope class. Export also enumerates entity, command, tool, event, viewer and privileged internal boundaries. The bootstrap readiness and legacy-binding paths remain guarded even when a member supplies an organization header. Contract metadata is available to authenticated consumers.
- The scheduler resolves durable organization/user principals, recovers foreign-authority accepted work to unknown, prepares the selected private binding and dispatches through the normal lifecycle/broker path. Missing private execution domains never use host workspaces or the legacy desktop.
- Native events, credential callbacks, cancellation callbacks and recovery watches bind the admitted resource context. Browser logout does not lend or revoke a durable principal. Commit listeners start without the writing request's actor, transaction, publication privilege or session authorizer; each scoped collector restores its own principal. Active native transports are protected from another actor's cache eviction. The detached embedded MCP callback regression exercises the same boundary that initially caused a successfully completed Muse run to become unknown under legacy RLS.
- Authorization leases reuse their existing authentication transaction for current membership/session checks. Concurrent private transactions do not hold every pool connection while waiting for nested authorization connections.
- Revocation requests native stop and prevents late publication. A narrow application-authority boundary records only the exact reserved run/token/epoch outcome, independently of a revoked actor. A matching cancelled terminal confirms cancellation; an unknown terminal retains requested intent and cannot grant a retry.
- Preparation state transitions are transactional. An already-blocked head cannot be prepared again by a stale dispatcher snapshot, and later queued input cannot bypass it.

## Evidence boundaries

The retained initial regression executed 525 tests with 524 passes and one preparation race failure. It ran while implementation was starting and is not final-source acceptance. Initial fixture failures also exposed an incomplete machine host fixture and nested authentication pool contention. Retained iteration logs preserve those failures; they are not clean passes.

The native probe uses real loopback account authentication, disposable PostgreSQL, private Cua environments and normal HTTP admission/claim/dispatch. It reads an existing short-lived Codex access token without copying refresh tokens or mutating its source authority, and uses the explicitly selected Muse API key. The same external Codex account may serve the two fixture actors; distinct-provider-account/Free evidence remains the separate [NMA-077 report](../nma-077/free-account/README.md). Fixture actors, provider identities and effective billing are different dimensions.

Earlier native Codex lanes completed useful tool calls with private thread/marker responses. Initial Muse attempts completed native inference and the same useful tool, but detached activity callbacks lost application scope and produced an unknown application outcome. Post-correction native probes complete all four lanes through the normal dispatcher. Muse subscription remains unverified. A later parallel affected run exceeded one fixture startup deadline; the unchanged deadline passes in the retained sequential cohort. No native unknown outcome or failed iteration is relabeled as a pass.

The HTTP observer wraps test API handles only and records route templates, mode, response status and one-way fingerprints of fixture actor/organization context. It retains no request/response bodies, cookies, tokens or credentials. Positive account-mode coverage, negative access coverage and legacy-mode success are reported separately. Missing account-mode positive cases are not treated as passes.

Browser/Tauri UI, deployed transport/restore, general installation and production capacity remain later gates. Historical NMA-060 and NMA-072–078 evidence retains its captured scope and is not relabeled as this delta.

## Reproduction

```sh
NGERTIIN_NMA079_REPORT_DIR="$PWD/docs/verification/nma-079" \
  bun scripts/verification/nma072/run-tests.ts \
  --preload ../../scripts/verification/nma079/observe.ts

NGERTIIN_NMA079_REPORT_DIR="$PWD/docs/verification/nma-079" \
  bun scripts/verification/nma072/run-tests.ts tests/organizations/readiness.test.ts tests/organizations/surfaces.test.ts

NGERTIIN_MUSE_EXECUTABLE="$PWD/.dev/nma050/muse" NGERTIIN_NMA079_NATIVE=1 \
  bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma079/native.test.ts

bun scripts/verification/nma079/report.ts
bun --filter @ngertiin/server typecheck
bun --filter @ngertiin/server lint
bun run docs:check
```

`bun run verify:organizations-api` runs the disposable regression/observer and evaluates retained evidence. Add `--native` with the explicitly selected provider executable/configuration to regenerate native Cua/provider proof. A changed runtime hash keeps the gate incomplete until that native proof is refreshed.

Native verification requires the explicit retained provider configuration and Docker. Its containers, networks, volumes, actors and database state are disposable. No installed database, production credentials, source authority or historical contract snapshot is reset. Read the report for pass/fail/skip and remaining conditions; a source export alone is not acceptance.

## Commit source verification

The initial local-tree native probe included a pre-existing NMA-072 SQLite importer change. That unrelated cutover work remains outside the NMA-078/NMA-079 commits. The final commit slice was exported to an isolated checkout: [96/96 affected tests](commit-source/affected-tests.log), 1,335 assertions across ten files, and [server typechecking](commit-source/typecheck.log) pass. A fresh native probe completes all four Codex/Muse lanes with 28 assertions, and the [source gate](commit-source/gate.log) reports no native runtime drift for that slice. The current native report, manifest and surface matrix describe this commit source; [the preceding native report](iterations/precommit-source/native-report.json), [log](iterations/precommit-source/native-run.log), manifest, matrix and secret scan remain byte-preserved.

The [commit documentation check](commit-source/docs-scoped.log) passes for 307 Markdown files and 3,073 local links after excluding the same three byte-verified imported GPUI guides. It does not relabel their eight known broken links as passing. The source gate deliberately detects the uncommitted importer difference if run from the remaining mixed local tree.
