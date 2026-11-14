# Native two-account Codex verification including Free

Date: 2026-11-14. Result: **1 pass, 0 fail, 33 assertions**, 266.85 seconds. The owner completed both new device-code ceremonies. No existing authenticated native home was copied. [The native report](native.json) contains observations without account identifiers, login codes or credentials. [The source manifest](source.json) records SHA-256 hashes at completion; production changes during the probe were formatting only. The account-plan additions and current exported contract are also included. Earlier source/cohort manifests remain unchanged in the parent directory.

| Observation | Free account | Comparison account |
| --- | --- | --- |
| Native observed plan | `free` | `prolite` |
| Catalog size | 3 | 8 |
| Native reported default used | `gpt-6-luna` | `gpt-6.1-sol` |
| Login, inference and actual `ngertiin.read_run_context` call | Pass | Pass |
| Authority restart/refresh and own-session resume | Pass | Pass |

The two provider identities differ. Both authenticated application actors use the same Team agent with separate personal connections, DMs, native homes and private bindings. Each inference returns its own marker/thread and excludes the other marker. Private connection/binding reads fail across actors, and the Team-agent connection remains unset. Resuming the comparison session from the Free home fails with `NATIVE_REJECTED`. After Free is locally disconnected and fenced by its tombstone, the comparison account still refreshes and resumes.

The legacy `subscription` billing enum denotes the ChatGPT account lane, including Free. Native `account_plan` supplies the observed plan, and `chatgptPlanType` preserves it during external-token delivery. No provider API key, model/account fallback or paid-plan assumption is used.

The fixture uses real loopback HTTP authentication and disposable PostgreSQL for application scope. It synthesizes accepted dispatch state inside the disposable test because production scoped admission remains closed pending NMA-078. The real ProductTools gateway continues checking organization, actor, connection, binding and current grants. This is provider/backend evidence; UI, deployed transport and commercial/hosted eligibility retain their separate gates.

Runtime/dependency versions remain those in the [parent runtime manifest](../runtime.json): Codex 0.169.0, Bun 1.3.10 and PostgreSQL 18.1 with the existing pinned image. The host reported FileVault On. Native storage was explicitly attested with `NGERTIIN_PROVIDER_NATIVE_STORAGE=encrypted-volume`; this does not attest a deployment or backup target. Fixture cleanup removes native credential/session state and the disposable database. Login codes and credential payloads are excluded from retained logs.

Follow-up checks pass: 92/92 affected tests with 540 assertions, server/web typecheck, server Biome and contract export (1/1 test, 7 assertions, 143 routes). Two selected plan/refresh fixtures pass with 10 assertions. The documentation check retains the same eight imported GPUI link failures, and the known-credential scan has zero matches. Earlier failed or partial regression cohorts retain their original denominators in the [parent report](../README.md).

Reproduce only with two owner-authorized accounts and an attested encrypted native volume:

```sh
NGERTIIN_NMA077_TWO_ACCOUNT_PROBE=1 \
NGERTIIN_PROVIDER_NATIVE_STORAGE=encrypted-volume \
NGERTIIN_NMA077_TWO_ACCOUNT_REPORT=/tmp/ngertiin-nma077-two-accounts.json \
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma077/two-accounts.test.ts
```
