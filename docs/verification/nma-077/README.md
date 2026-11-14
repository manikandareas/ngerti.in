# NMA-077 provider connection verification

Date: 2026-11-14. Status: **Done** for verified provider connections. After the initial unavailable-account report, the owner supplied a second account and completed both device logins. The [two-account follow-up](free-account/README.md) verifies a Free account and a distinct comparison account. [The implementation contract](../../architecture/provider-connections.md) defines the API, native credential authority, storage and restore boundary. Production organization native admission remains closed; NMA-078, NMA-079 and the web/Tauri/deployment/distribution gates retain their scope.

## Source and configuration

Git baseline: `f5a3e02cffd3ad63cf89d42b83d111c6bb199931`, with uncommitted task changes. The [initial final-source manifest](final-source.json) records the earlier completed implementation and Bun **1.3.10**; the [two-account manifest](free-account/source.json) records the account-plan follow-up and its exact source hashes. The regression includes the pre-existing NMA-072 SQLite-backup/cutover work; it is labeled separately and is not attributed to this implementation. No commit, retained installation migration, live profile change or deployment was performed.

PostgreSQL uses the existing disposable runner and pinned PostgreSQL **18.1** Alpine image digest. Dependencies remain `pg` **8.23.1**, Zod **4.4.3**, Elysia **1.4.30**, Better Auth/OAuth Provider **1.7.23** and Muse SDK **1.4.14**. Native observations use Codex **0.169.0** and Muse **1.4.14-R7309.1**. No new runtime or package dependency is introduced. The [runtime manifest](runtime.json) pins CLI entrypoint/protocol hashes and the installed server dependencies.

The [1.34.0 contract snapshot](../../contracts/1.34.0.json) was exported from authenticated `/v1/contracts` with disposable PostgreSQL and account state: **143 routes**, provider contract **nma-077.1**, and `pending_nma_079` scoped readiness. Export invokes no native/provider operation.

## Executed results

| Cohort | Result | Evidence |
| --- | --- | --- |
| Account-mode contract export | 1/1 test, 7 assertions; 143 routes | [Log](logs/contract.log), [snapshot](../../contracts/1.34.0.json) |
| Real remote Codex | 1/1 test, 18 assertions; device login, catalog, refresh/restart, two useful inference/tool lanes | [Native report](native-codex.json), [source at execution](native-source-initial.json) |
| Real selected Muse API key | 1/1 test, 9 assertions; login, catalog, inference, scoped tool and native-file key absence | [Native report](native-muse.json), [log](logs/native-muse.log) |
| Affected HTTP/contract/provider cohort | 41/41 tests, 290 assertions | [Log](logs/affected-http.log) |
| Sequential backend regression before the final refresh correction | **510/511 tests**, 3,206 assertions; one simultaneous-refresh failure | [Log](logs/regression-sequential.log) |
| Final affected refresh/provider cohort | **81/81 tests**, 343 assertions | [Log](logs/refresh-final.log) |
| Final harness/key cohort after API-key authority hardening | **60/60 tests**, 260 assertions | [Log](logs/key-final.log) |
| Native Codex API-key storage protocol | **1/1 test**, 3 assertions; deliberately invalid fixture key, no provider inference | [Report](native-codex-key-storage.json), [log](logs/native-codex-key-storage.log) |
| Server/web TypeScript and server Biome | Pass | [Typecheck](logs/typecheck.log), [lint](logs/lint.log) |
| Documentation check | Eight pre-existing imported GPUI link failures, no new failures | [Log](logs/docs-check.log) |
| Known live-credential scan | Zero matching files across 65 checked files, using 12 private local credential values without printing them | [Result](secret-scan.json) |
| Real distinct accounts including Free | **1/1 test, 33 assertions**; two private Team-agent lanes, refresh/restart, inference/tool, cross-resume rejection and isolated retirement | [Report](free-account/native.json), [scope and source](free-account/README.md) |
| Account-plan protocol fixtures | **2/2 selected tests**, 10 assertions; Free plan inspection and authority token plan delivery | [Log](free-account/plan-fixture.log) |
| Final account-plan/provider cohort | **92/92 tests**, 540 assertions | [Log](free-account/affected.log) |
| Follow-up TypeScript, server Biome and account-mode contract export | Pass; export **1/1 test**, 7 assertions, 143 routes | [Typecheck](free-account/typecheck.log), [lint](free-account/lint.log), [contract](free-account/contract.log) |
| Follow-up documentation and secret checks | Same eight pre-existing imported GPUI link failures; zero known credential matches | [Docs](free-account/docs-check.log), [scan](free-account/secret-scan.json) |

The real Codex cohort uses one newly authorized subscription connection. The user completed the native device-code ceremony in a browser; no existing native home or refresh-token file was copied. One account authority refreshes credentials for two controlled actor/binding homes. Both native consumers complete inference with `gpt-6.1-sol` and call the actual application's `ngertiin.read_run_context` gateway. Separate private markers and thread IDs are verified, as are distinct native homes/session IDs. The authority closes/restarts, reads persisted native auth and completes refresh again. Disconnect closes both consumers/authority, removes their native files and rejects another launch through the tombstone. All credentials and disposable state are removed by fixture cleanup.

That first native proof uses controlled fixture principals and a single-owner application test seam. It does not enable production organization claims or itself prove two distinct live provider accounts. The [execution-time source manifest](native-source-initial.json) identifies the earlier native cohort; later canonical-path normalization and initializing-process retirement are verified by the final fixtures and the native Muse cohort rather than relabeled as the same native Codex execution.

The subsequent two-account probe uses real loopback HTTP-authenticated application principals, disposable PostgreSQL, one shared Team agent and separate personal connections/private DMs. Native Codex reports `free` with three catalog models and `prolite` with eight. Each account uses its own reported default: `gpt-6-luna` and `gpt-6.1-sol`, respectively. Both complete inference and actual `ngertiin.read_run_context` calls with only their private marker/thread. Distinct hashed provider identities, authority restart/refresh, separate native homes, absent lane `auth.json`, own-session resume, rejected cross-account resume, private resource reads and an unchanged Team-agent connection are asserted. Retiring Free rejects its relaunch while the comparison account still refreshes and resumes.

This probe synthesizes accepted dispatch state only inside its disposable fixture because production scoped `claimNext`/dispatch remain closed. ProductTools retains real current organization, actor, connection, binding and grant checks. It proves provider routing and useful tools within that boundary, not a production organization admission journey. `account_plan` records the observed native plan and is passed through external-token login/refresh. The legacy `billing_source: subscription` value means the ChatGPT account lane, including Free; no provider API key is supplied and no paid entitlement is inferred from that enum. Fixture cleanup removes both credential authorities, native session files and disposable application/database state.

The Muse cohort reads the explicitly selected `MUSE_API_KEY`/`META_API_KEY` from private local configuration without printing it. A fresh AES-256-GCM reference supplies only that key to an isolated native environment. The native provider reports API-key billing; model discovery, completed inference and an actual application tool call are checked independently. The probe searches native home files for the submitted key and finds zero matches. Muse subscription remains **unverified**.

## Fixture coverage

Real HTTP with disposable PostgreSQL/account sessions covers personal versus organization connection visibility, management versus audience invocation, private user/conversation precedence, organization default inheritance only when unset, no fallback after revocation, unchanged Team configuration, frozen account/model/billing snapshots, SQL-level cross-actor reference rejection and snapshot immutability. Goals/Routine retain the selected connection after UI preferences change; the retained NMA-074/075 cohorts continue covering membership suspension and rejoin fencing.

Additional protocol/storage coverage checks simultaneous refresh consumers against one credential writer, authority restart, ephemeral Codex access-token delivery, account identity checks, separate native HOME/CODEX_HOME generations, API-key ciphertext tampering/relocation, secret-free events and command receipts, idempotent key replacement, cleanup of initializing processes without stopping another connection, and restored native files rejected against a retained tombstone ledger. Missing legacy nullable snapshots normalize without allowing a different admitted selection.

## Storage and restore observations

The native host reported **FileVault is On**. Scoped native Codex login/delivery requires explicit `NGERTIIN_PROVIDER_NATIVE_STORAGE=encrypted-volume`; this is an operator attestation, not automatic attestation of another server or backup target. API-key encryption uses a private binary 32-byte master key file; deployment must keep its recovery separate from ordinary state backups. No real master key or provider token is included in this evidence.

Local retirement writes/fsyncs a separate tombstone ledger before deleting native/key files. Restoration tests retain that latest ledger while putting old native files back. A coordinated deployed database/blob/credential/volume restore, preservation of an external latest ledger during whole-state rollback and actual provider-side credential revocation are **not** claimed. NMA-082 owns the coordinated restore drill; an old revocation ledger must never replace the latest one.

## Retained failed iterations

The initial mixed-worktree regression executed **509 tests: 499 pass, 10 fail**. It exposed missing response contracts for the two new routes, a protocol fixture incorrectly replying to a server-request response, and a synthetic execution-domain fixture without the newly required private provider selection. Those were corrected and the affected HTTP cohort passed 41/41. The initial logs remain under `iterations/`.

Overlapping later regression runs overloaded this development host and produced timing-sensitive streaming/recovery failures, including short polling deadlines and a native learning-probe timeout. The overlapping full runners were stopped and their logs retained. No timeout or product policy was loosened. The subsequent sequential cohort passed 510/511 tests and found a real refresh-coalescing race: asynchronous per-consumer permission checks let a fast refresh finish before another already-arrived consumer joined it. The authority now registers the shared operation before those checks, while retaining native-access authorization and every consumer's before/after checks. The final affected cohort passes 81/81 tests after the correction. A later storage review also made API-key account-inspection processes ephemeral, preventing a duplicate plaintext native auth file outside the encrypted key vault. Its final harness/key cohort passes 60/60 tests; a real Codex local account-protocol probe with a deliberately invalid fixture key confirms `auth.json` is absent. That local probe performs no catalog/inference request and is not presented as valid provider API-key authentication. No interrupted or failed cohort is represented as a clean 511-test execution.

Muse probe iterations first omitted the required startup model, then exposed a non-canonical `/var` workspace alias rejected by native MSP. The probe now uses the application adapter, and credential roots normalize to the real canonical path. A misplaced constructor edit was caught by typecheck during that correction and fixed before the successful native run. Intermediate logs remain under `iterations/` with secrets redacted.

## Remaining deployment and later-gate conditions

- Native external-token delivery is an experimental Codex protocol, verified on 0.169.0. Provider eligibility for commercial/hosted service use must be resolved through the supported Sign in with ChatGPT integration before such deployment; this owner-operated probe grants no subscription-sharing entitlement.
- Production organization native admission remains closed pending NMA-078 app/MCP/skill isolation. No web/Tauri UI, deployed HTTPS, capacity, fresh-device installation or production readiness is claimed.

## Reproduction

```sh
bun scripts/verification/nma072/run-tests.ts
bun scripts/verification/nma072/run-tests.ts tests/harness.test.ts tests/codex.test.ts tests/provider-storage.test.ts tests/organizations/providers.test.ts tests/machines/execution-domains.test.ts
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma077/contract.test.ts
```

The opt-in native scripts are `scripts/verification/nma077/remote-codex.test.ts`, `two-accounts.test.ts` and `muse-key.test.ts`. The Codex probes require new user-completed device logins and an attested encrypted native volume; the two-account probe requires Free first and a distinct account second. The Muse probe requires the explicitly selected private key. Their `NGERTIIN_NMA077_*_PROBE` flags prevent accidental provider work in the ordinary regression suite. Do not run multiple full cohorts simultaneously on the measured host.
