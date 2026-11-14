# NMA-078 verification - 2026-11-14

The [implementation contract](../../architecture/scoped-apps-skills.md) defines account ownership, resource restrictions, supported catalog paths and Team publication. [Manifest](manifest.json) records the Git base, final working-tree source hashes, SDK modules, dependency versions, setup and scope boundaries. Unrelated NMA-072 development-cutover work is retained.

## Acceptance observations

| Cohort | Denominator and outcome | Evidence |
| --- | --- | --- |
| Scoped HTTP/PostgreSQL accounts, grants and skills | 40/40 tests pass, 206 assertions | `apps/server/tests/organizations/integrations.test.ts` |
| SDK session account/identity drift, effects, restart and authority loss | Included in the same final 40-test cohort | `apps/server/tests/integrations.test.ts`, `apps/server/tests/persistence/postgres.test.ts` |
| Native/global configuration rejection before process creation | Both adapters reject an unsupported project configuration | `apps/server/tests/harness-catalog.test.ts` |
| Real Composio organization read | 1/1 completed useful read, non-empty log ID, actor attribution; member does not authorize a personal account | [Organization result](live-app.json), [retained initial run](live-app-initial.log) |
| Real Composio personal read | 1/1 completed useful read after member-owned authorization, non-empty log ID, actor attribution | [Personal result](live-personal.json), [personal run](live-personal.log) |
| Native catalogs and bounded package reads | 4/4 final actor/harness lanes pass, 20 assertions; two private homes each for Codex and Muse | [Native result](native-skills.json), [native run](native-skills.log) |
| Installed account-mode contract export | 1/1 test, 10 assertions; 145 routes at 1.35.0 | [Export run](contract-export.log), [snapshot](../../contracts/1.35.0.json) |

The organization and personal reads discover `GITHUB_GET_THE_AUTHENTICATED_USER`, check its empty required-argument set, explicitly assign it and execute once through the backend Applications service. Both use authenticated fixture application principals, real PostgreSQL and real Composio sessions, with a synthetic accepted-run seam. They prove account routing and a useful provider call; they do not establish browser/Tauri UI, native model-driven application calls, or production multi-user admission. The user was explicitly told that the same GitHub account may be used for these connections; no two-distinct-GitHub-account claim is made. Reports omit profile payloads, tokens, OAuth links and raw arguments. Local access is revoked after each completed lane; upstream token revocation is not claimed.

Fixture coverage includes another organization, another user in the same organization, management versus invocation rights, Workgroup removal, pending OAuth invalidation and initiator binding, reconnect denial, exact connected-account mismatch, search/schema filtering, revoked generations during native preflight, exact argument-resource restrictions, actor-private receipts, late outcome retention after membership removal, unknown holds across actors and recovery, lost authority fencing, SQL skill-revision immutability, pinned shared assignment updates, private same-name overlays, provider-selected inherited inventories and unchanged app-account routing after provider selection changes.

## Native interpretation and retained failures

The native probe uses the installed Codex **0.169.0** App Server and Muse **1.4.14-R7309.1** MSP binary, SDK **1.4.14**, each with two clean private actor homes. Codex discovers the corresponding private package in `skills/list`. Muse successfully supplies `skill/list`, but does not discover the injected test package there; the existing application bridge reads and hashes that private `.muse/skills` package. Both paths exclude the other actor's package and retain the original bytes. This is native catalog plus real bounded filesystem-read proof, with no inference request or subscription claim.

Four earlier native-probe attempts failed before the final accepted 4/4 cohort: missing private `TMPDIR`; Muse skill listing without a native session; an unpinned Muse startup model disagreeing with the session projection; and an incorrect verifier assumption that Muse natively discovers the same package folder as its application bridge. The verifier now supplies a private temporary directory and pins the startup/session model, while reporting native discovery separately. [Model-projection failure](native-skills-initial-failure.log) and [discovery-assumption failure](native-skills-discovery-failure.log) retain the latter two observations. No application fallback or alternate billing was used to turn those failures into passes.

The initial live runner completed its organization read, then timed out waiting for personal OAuth: one runner failure, no personal tool dispatch and no unknown external effect. The original [partial report](live-app.json) keeps `completed: false`; its organization lane remains a known completed read. The user then completed a fresh personal authorization; the personal-only runner passes. These are two successful external reads in total, with zero unknown tool outcomes, rather than a claim that the original two-lane runner passed.

An initial broad regression was interrupted after new publication routes lacked response-contract mappings; [its retained log](regression-initial-failure.log) contains the actual failures and incomplete denominator. Adding the reviewed publication/assignment response schemas repairs `/v1/contracts`; the subsequent affected contract cohort passes 28/28 tests with 319 assertions. A subsequent writer-order/authority correction initially re-entered member authorization during late settlement; that intermediate affected run passed 39/40 tests and failed the revoked-member known-outcome assertion. The final narrow authority check uses its existing administrative transaction, retains the lifecycle lock/epoch fence and passes both late-outcome and lost-authority cases in the final 40/40 cohort. [A second broad intermediate run](regression-before-authority-hardening.log) was stopped before final hardening; no clean full-suite result is claimed for either interrupted run. The full NMA-079 readiness gate remains separate.

## Commands and final checks

Run isolated database tests with the existing disposable PostgreSQL runner:

```sh
bun scripts/verification/nma072/run-tests.ts tests/integrations.test.ts tests/organizations/integrations.test.ts tests/persistence/postgres.test.ts tests/harness-catalog.test.ts
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma078/contract.test.ts
bun run --filter @ngertiin/server typecheck
bun run --filter @ngertiin/server lint
bun run typecheck:web-client
bun run docs:check
```

The explicitly enabled native probe uses `NGERTIIN_NMA078_NATIVE_SKILLS=1` and an output path in `NGERTIIN_NMA078_NATIVE_REPORT`. The live probe uses `NGERTIIN_NMA078_LIVE_APP=1`, an owner-only temporary `NGERTIIN_NMA078_OAUTH_FILE`, and `NGERTIIN_NMA078_APP_REPORT`. `NGERTIIN_NMA078_APP_LANE=personal` runs only the personal lane. The live probe needs the existing Composio project key and user-completed Connect Link authorization; the native probe uses the existing explicitly selected Muse API key only for native session setup, without inference. Never copy credential values into evidence or run these probes as an automatic fixture fallback.

Production scoped native preparation/dispatch remains closed for the NMA-079 API/isolation gate. The new scoped app APIs and publication endpoints are available for backend verification. Web/Tauri onboarding and management UI belong to NMA-080/081; deployment/restore and distribution retain their own milestones. Arbitrary custom MCP endpoint forwarding, public marketplace publication, and automatic publication of private chat/memory are outside this milestone.


Final server typecheck, full server lint and web-client typecheck pass. Repository `docs:check` reports eight existing broken links inside the unchanged GPUI skill references. [Baseline comparison](docs-check-baseline.json) verifies that all affected source files are byte-identical to HEAD. The task adds no new failing documentation link or backlog consistency error; those unrelated skill packages are preserved. See [docs-check output](docs-check.log).


The full regression also exposed a Codex cancellation-fixture preparation wait that exceeded its three-second setup deadline while the run was still dispatching. The unchanged fixture passes in an isolated recheck (2/2 tests, 11 assertions); the final verifier allows ten seconds for native preparation and keeps its original three-second cancellation-confirmation deadline. That final cancellation cohort passes 2/2 tests with 11 assertions. The full-suite result below retains the original failure rather than claiming that the earlier run used the adjusted deadline. See [final cancellation checks](cancellation-final.log).


Final broad regression completed **524/525 tests**, with **3,296 assertions** across 60 files. Its single failure is the original three-second Codex preparation wait described above; all other 524 tests pass on the final production code. The subsequent adjusted cancellation cohort passes 2/2 with 11 assertions, and the final app/PostgreSQL/authority cohort passes 40/40 with 206 assertions. No clean 525-test rerun after the verifier-only deadline adjustment is claimed. [Broad regression output](full-regression.log).
