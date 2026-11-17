# ACP Pi context and native API 2.4 follow-up

Date: 2026-11-17 (Asia/Makassar). Status: **this scoped cohort passed; the full migration remains In Progress**. This capture follows the immutable [native-harness cohort](../native-harnesses/README.md); it does not rewrite earlier results. The [migration checklist](../../../architecture/acp-harnesses.md) remains the current acceptance record.

## Native Pi context and skills

The owner's existing global Pi DeepSeek connection supplies this verification input only. Sumopod is not registered in production source. The probe uses managed upstream Pi ACP **0.0.34**, Pi **1.5.2**, official ACP SDK **2.7.0** and wire **1**, with a private temporary execution lane. It does not change global Pi defaults, credentials, extensions or hooks.

The [native report](pi-context.json) and [successful log](pi-context.log) record **three completed turns and 77 assertions** through real owner-mode HTTP/PostgreSQL and scoped ProductTools:

- Read a source file, create/publish an artifact with a nullable native turn ID, and download its exact bytes. A foreign-workspace download returns 403.
- Apply changed persona and workspace instructions on the next native session while preserving settled application history.
- Use the same persistent agent in DM and group with distinct native sessions. DM memory, files and private application skill packages stay absent from the group.
- Read an assigned application skill and its asset, then retain assigned version 1 after version 2 is authored without reassignment. Read inherited workspace skill packages/assets as data with `writable: false`; foreign package reads are denied and the package stays unchanged.
- Retain every completed ProductTools call in the run journal, with no Goal or Routine created. The credential scan finds no selected literal key in private fixture files and skips no oversized files.

This verifies the application skill bridge and inherited workspace package scope. It does not certify inheritance of Pi's global native skill catalog. Pi does not advertise native web search in this profile; no native search parity is claimed. This owner-mode probe is separate from the preceding two-user/real-Cua-domain cohort.

## Concurrent tool journal correction

The [initial native attempt](pi-context-before.json) completed a group tool batch but exposed missing journal entries. Reading the run's `product_tools`/`tool_errors` arrays before the update transaction allowed concurrent completions to overwrite each other. Both read-and-append operations now occur within their existing store transaction. Tool handlers remain concurrent; no additional execution loop or handler-wide lock was added.

The focused regression first [fails before the fix](parallel-before.log), then [passes with six assertions](parallel-after.log). Four handlers overlap behind a barrier; two successful calls and two domain errors all survive in the journal and activity clears. The subsequent native three-turn run independently observes all completed tool names. The initial failure remains evidence, not a passing result.

## Native Tauri contract 2.4 journey

The [native UI report](native-ui.json) and [log](native-ui.log) record a real macOS Tauri client against account-mode HTTP/PostgreSQL, with the official SDK subprocess fixture. The final backend test passes **nine assertions**, covering seven observed UI outcomes: typed form values/bounds, nullable native turn identity, the shared onboarding/app model picker, native reasoning default, frozen completed-run selection, generic Pi configuration import, and an OpenCode public Free connection without a key.

The actual native file chooser imports a synthetic configuration containing two unregistered providers. Selecting the second provider creates a private native-configuration connection; the UI has no explicit Sumopod registration. Both model-picker surfaces use the same component and current five-harness registry. The OpenCode Free creation flow presents no key field. These are consumer/API results, not provider inference, a latency benchmark or distribution acceptance.

The report retains contract **2.4.0**, the native binary hash and served web-index hash. Native screenshots/accessibility observations occurred during the UI session; no standalone native screenshot file is claimed here. The [cleanup audit](native-ui-cleanup.json) records the app quit, synthetic browser auth tab closed, exact synthetic Keychain entry removed, and all three owned ports closed.

## Backend regression and exact source

The [full backend run](backend-all.log) executed **601 tests across 79 files: 600 passed, one failed, 4,176 assertions**. The sole failure was the readiness test's stale `2.3.0` contract expectation. After changing that test literal to `2.4.0`, its [focused rerun](api24-surface.log) passes **457 assertions**, including authentication/scope classification for every installed account route. No production code changed after that full run. This is combined evidence; it is not represented as a single 601/601 green run.

The [manifest](manifest.json), [source patch](source.patch.gz) and [archive receipt](source-archive.json) preserve the current affected tree. A separate temporary Git index checks patch application and every reconstructed file hash. Executed probe sources are retained separately because later formatting, explicit optional-value guards and the UI report's completion flag placement postdate execution. They do not change the successful path; the report's source hash identifies the exact native Pi script used. Source checks, typechecks and [documentation checks](docs-check.log) accompany the archive. Earlier sealed captures are unchanged. No commit, push or deployment is included.

Full server lint and both server/web typechecks pass. The [40-file affected web source check](web-source-check.log) passes. The [full web lint](web-full-check.log) retains one existing formatter error in unrelated sign-in artwork provenance and 11 warnings. Its [baseline receipt](web-lint-baseline.json) verifies that file is unchanged from HEAD; it is not counted as a clean full-web check or reformatted in this scope.

## Remaining acceptance by research cohort

| Research cohort | Current proof and remaining boundary |
| --- | --- |
| Shared core per profile | Codex and upstream Pi complete useful turns and reload. Both Pi candidates were compared; OpenMA fails the actual useful-tool gate. OpenCode's selected Free model has only quota-failure proof. Claude native remains unverified by owner choice. |
| Isolation and auth | Native Codex/Pi use distinct private app lanes and real Cua domains, with revocation/no-fallback proof. Both lanes share the selected vendor identity. Distinct vendor identities and real credential expiry/renewal remain unverified; an invalid Pi key is a separate rejection test. |
| Tool lifecycle | Shared tests cover pre-dispatch discovery, immutable leases, stale/in-flight calls and ordered self-stop. Native Codex/Pi controls and useful scoped calls are retained. Equivalent native acceptance for OpenCode/Claude remains open. |
| Controls and recovery | Shared tests cover cancel/completion races, process loss, unknown acknowledgements and fresh run endpoints without blind replay. Native Codex/Pi control/reload results remain scoped; this phase adds no claim of vendor-wide recovery acceptance. |
| Instructions/catalogs | Native Codex and Pi apply changed instructions and scope private context. Pi package reads/version pinning pass here. Claude's delayed-instruction behavior and full native catalog isolation for the remaining profiles are unverified. |
| Protocol and UI | Shared projector/error/interaction tests and actual browser/Tauri journeys pass. Provider-specific inference is measured separately; fixture UI never closes a native provider gate. |
| Migration and maintenance | Old Codex execution paths are retired with recovery source, Muse remains on SDK/MSP, and explicit binding replacement prevents silent interchange. Pins, hashes and upgrade checks are retained. A future SDK upgrade must rerun the cohort; this phase does not claim one occurred. |

The selected OpenCode model is `opencode/glm-5.3-flash-free`. Its native Free quota remains the blocker for successful inference/useful tools/reload; no paid model or billing fallback is authorized. Claude remains explicitly unverified. The implementation estimate is approximately 90%; this is a qualitative progress estimate, not a native acceptance pass rate.

```sh
NGERTIIN_ACP_NATIVE_CONTEXT=1 NGERTIIN_ACP_NATIVE_CONTEXT_PROFILE=pi bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/native-context.test.ts
bun scripts/verification/nma072/run-tests.ts tests/harness.test.ts --test-name-pattern 'parallel product tools'
bun run test:server
bun scripts/verification/nma072/run-tests.ts tests/organizations/readiness.test.ts --test-name-pattern 'every installed account surface'
NGERTIIN_ACP_NATIVE_UI=1 NGERTIIN_ACP_NATIVE_UI_CONFIG=1 NGERTIIN_ACP_NATIVE_UI_CAPTURE=api24 bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/native-ui.test.ts
bun scripts/verification/acp/capture-pi-context.ts
```
