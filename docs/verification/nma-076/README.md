# NMA-076 execution-domain verification

Date: 2026-11-14. Scope: backend execution-domain, file/browser/process and viewer isolation. The [implementation contract](../../architecture/execution-domains.md) defines operator setup, trust boundaries and recovery. Application scoped native admission remains closed pending NMA-077/078; this report does not promote NMA-079, web/Tauri acceptance, deployment or distribution.

## Source and configuration

Baseline Git revision: `74cfabc23e43c962e9e3b58c91b5d0671da093d9`, with the local implementation changes. The [final source manifest](final-source.json) and native reports contain 46 per-file SHA-256 hashes, the contract version and Bun version; these identify each cohort's actual source rather than implying a new commit. The final adapter cohort includes the permission-guidance clarification made after the physical Cua cohort. A subsequent shutdown-context routing refinement is verified by the final 17-test domain cohort, including release of the correct domain input lease. Physical isolation modules are unchanged between those cohorts.

- Bun **1.3.10**, `@trycua/cua` **0.10.1**, spacesd **0.8.0**, bundled Driver contract **1**.
- Full ARM64 image: `ghcr.io/trycua/linux:24.04@sha256:9ac0d6f6f7dd95392554ec95163f83c5061de3db05b64977696c78d71cd4861c`.
- PostgreSQL **18.1-alpine**, `pg` **8.23.1**, `@bufbuild/protobuf` **2.15.0**, Elysia **1.4.30**; retained manifest/lockfile hashes are included.
- Declared native host: Docker **29.8.2**, OrbStack **aarch64**, **8 CPUs**, **4,179,832,832 bytes** VM memory.
- Explicit native policy: two retained slots, **768 MiB**, **1 CPU** and **512 PIDs** per domain, no additional swap. The native cohort uses three principal/domain identities, with two concurrent environments.
- Account-mode contract **1.33.0**, [full installed export](../../contracts/1.33.0.json): **141** routes. `scoped_data.readiness_gate` stays `pending_nma_079`.

The runner starts disposable PostgreSQL. Cua/container state and copied verification credentials live in temporary fixture directories. Probes do not reconfigure or restart the retained installation desktop. No credential is mounted into a Cua environment or written to a report.

## Scoped local delivery

The [staged-source recheck](delivery-2026-11-14/result.json) passes 17/17 affected tests, server/web typecheck and lint; documentation retains the same eight imported GPUI-reference failures. It excludes separately retained NMA-072 local-cutover files and hunks. The original source manifests keep their actual working-tree hashes; only the unrelated `verify:foundation` script change differs among the final manifest's 46 source paths. The original full-suite denominator includes the separately retained SQLite-backup test. [Integrity hashes](integrity.json) preserve all original raw logs and timestamped reports, including failed iterations.

## Results and denominators

| Cohort | Executed result | Evidence |
| --- | --- | --- |
| Domain/real-session HTTP tests | **17/17 tests**, 62 assertions, two files | [Affected backend log](logs/domain-tests.log) |
| Native Cua | **12/12 checks**, one test, 44 assertions | [Native report](2026-11-14T09-29-27.156Z/native.json), [log](logs/native-final.log) |
| Native adapters | **2/2 lanes**, one test, 24 assertions | [Harness report](2026-11-14T09-38-57.649Z/harnesses.json), [log](logs/harnesses-final.log) |
| Contract export | **1/1 test**, five assertions; 141 routes | [Export log](logs/contract.log) |
| Full backend regression | **497/499 passed**, two failures; 3,118 assertions across 56 files | [Full log](logs/full-suite.log) |
| Runtime-discovery isolation | **4/4 tests**, 25 assertions | [Isolated log](logs/runtime-isolated.log) |
| Repeated discovery/replacement cases | **20/20 executions**, ten repeats of each selected case, 140 assertions; 20 unrelated cases filtered | [Repeat log](logs/runtime-repeat.log) |
| Server/web TypeScript, Biome, web build | Passed; web build retains the large-chunk warning | [Summary](summary.json), [typecheck](logs/typecheck.log), [lint](logs/lint.log), [build](logs/web-build.log) |
| Documentation | Eight retained imported GPUI-reference link failures; no new broken links | [Documentation log](logs/docs-check.log) |

The full backend cohort precedes the final prompt-only permission clarification; the final live adapter cohort verifies that later text. The full regression's two unmodified runtime-discovery tests each hit the existing three-second executable-probe timeout. Both pass in isolation and in the 20-execution minimized loop. The combined-suite timing cause is **unresolved**; no probe timeout was relaxed and no blanket 499/499 full-suite pass is claimed. An earlier full attempt and corrected contract/session fixture expectations remain under [iteration logs](iterations/). Scope-specific, native and adapter results remain separate from that full-suite limitation.

## What the native evidence proves

The Cua cohort resolves two people in one organization and the same person in a second organization using fixture principals. It provisions no environment during metadata resolution. Two simultaneous containers have distinct retained homes, browser state, process namespaces and control credentials. The same relative file path contains different actual bytes. A shell can observe its own private process marker and cannot observe the other domain's marker; another domain's token cannot access protected files or spawn a process.

Real Chromium instances retain different cookies for the same owned loopback origin. A retained container restart preserves its file and cookie without disturbing the other environment. A private upload materializes into the resolved domain, is absent from the other domain and keeps immutable download bytes after its working copy is changed. A native view-only ticket rejects clipboard mutation and filesystem RPCs. A deliberately added second network causes visible attestation failure before file access; restoring the declared configuration permits access again.

Native process handles survive backend detach/restart through the execution ledger and stored output offsets. Cancelling one fixture run terminates its attributed native process while the other domain's process remains running. Capacity rejects a third environment, and explicit teardown frees a slot while a missing retained identity remains an error. Cleanup targets only fixture-owned resources and preserves the operator-owned desktop.

These native principals are controlled backend fixtures. Separate real verified-account HTTP tests prove current membership/session resolution, copied-ticket denial across people and device sessions, active media closure on actual session revocation and member removal, and rejection of later file access. The HTTP media upstream in that cohort is a protocol fixture; native Cua ticket enforcement is verified separately. This combination does not claim real product web/Tauri journeys or deployed ingress.

## Native harnesses and permission guidance

Codex **0.169.0**, using ChatGPT **subscription**, and Muse **1.4.14-R7309.1** / SDK **1.4.14**, using the explicitly selected **API key**, each complete useful `machine_exec`, `read_file` and `computer_call` work in a resolved private environment. Each marker is checked against actual Cua file bytes. No forbidden host file appears, and both final lanes report zero native host shell/file tool calls. Provider credentials remain in private backend fixture homes. Muse subscription remains unverified.

The adapter probe deliberately uses a single-owner application fixture attached to the private environment resolved for a fixture organization/user. It verifies both adapters' physical work location and host restrictions. It does **not** bypass or reopen production scoped `claimNext`/dispatch, which remains closed until NMA-077/078 verify provider/app credential routing. The run-tool context test similarly labels its synthetic accepted-run seam rather than presenting it as native admission.

Retained failed iterations include argument-schema errors and a Muse response that inferred application-tool denial from native read-only labels without calling a tool. The final session guidance explicitly identifies the separately server-authorized domain tools and requires respecting actual tool denials. The final native adapter cohort passes after that clarification. An earlier credential probe incorrectly expected public `GetCapabilities` metadata to be protected; the final negative probes use protected filesystem/process RPCs instead.

## Reproduction and remaining gates

```sh
bun scripts/verification/nma072/run-tests.ts tests/machines/execution-domains.test.ts tests/machines/authorization.test.ts
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma076/native.test.ts
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma076/harnesses.test.ts
bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/nma076/contract.test.ts
```

The native commands require Docker and the pinned image. The harness command additionally reads the explicitly configured Codex subscription login and Muse API key into private temporary contexts; it performs provider inference and preserves billing selection. It never switches credentials or billing on failure.

Observed final idle samples were approximately **424.5 MiB / 6.72% CPU** and **544 MiB / 0.98% CPU** for the two environments. These are samples on the declared workload, not a load benchmark, disk quota or production user-count promise. Infrastructure operators remain trusted; no hypervisor certification is claimed. The viewer media bridge remains local loopback transport. NMA-081/082 still own actual remote Tauri and HTTPS/WSS ingress/restore proof; NMA-079 and NMA-083 own their API/integrated gates. Desktop-rs remains paused.
