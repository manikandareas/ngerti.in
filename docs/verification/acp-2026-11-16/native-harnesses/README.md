# ACP native harness credentials and failure handling

Date: 2026-11-17 (Asia/Makassar). Status: **this scoped cohort passed; the full migration remains In Progress**. The [migration checklist](../../../architecture/acp-harnesses.md) retains the remaining gates. Earlier [cutover](../cutover/README.md) and [Codex native-context](../native-context/README.md) captures remain unchanged.

## Credentials follow the selected harness configuration

The owner's DeepSeek/Sumopod choice is a **Pi verification input**, not a built-in provider or product default. Server and web source contain no Sumopod-specific registry, endpoint, credential mapping, schema or UI branch. Existing Pi provider IDs and HTTP(S) endpoints come from selected native configuration; the application privately binds that configuration without inheriting global defaults, other credentials, extensions or hooks. OpenCode's public Free route has no credential. Model/provider/billing selections remain frozen per run. No global configuration was written, no API key was requested in chat, and no paid/provider fallback was introduced.

API **2.4.0** adds generic native configuration reuse, explicit public Free billing and a safe `PROVIDER_LIMIT` diagnostic. The [consumer delta](../../../architecture/server-organizations-api.md#harness-credential-delta--240) describes the routes and constraints. The [69-test affected cohort](regression.log), **452 assertions**, verifies API export, unknown native providers (including a dotted identifier), encryption, private scope, lifecycle and shared ACP protocol behavior. Typecheck, source checks, web build and docs checks are retained separately.

## Native results

All execution uses official ACP SDK **2.7.0**, wire **1**, through the shared connection/session/projector. Sumopod appears only in verification inputs and evidence. It is not an application integration commitment.

| Cohort | Result and boundary |
| --- | --- |
| Pi upstream ACP 0.0.34 / Pi 1.5.2 | [Two useful turns and explicit reload](pi-positive.json), **15 assertions**. Both invoke `read_run_context`, retain the marker/thread and use the same authorized native session on reload. The existing global Pi DeepSeek connection supplies the selected credential/configuration; literal key bytes are absent from private execution files. |
| Pi controls | [FIFO, cancellation and self-stop](pi-controls.json), **19 assertions**. Unsupported steering is rejected and queued input later completes through FIFO. Cancellation is confirmed by the native response. Self-stop's product receipt is delivered before interruption. The log retains a `TOOL_UNAVAILABLE` diagnostic during this cohort; it is not counted as a useful tool success. |
| Pi invalid credential | [Native provider rejection](pi-invalid.json), **10 assertions**. A synthetic invalid key against the selected native endpoint fails with `NATIVE_REJECTED`; it does not return an empty successful turn or switch credentials/provider. This is not a real account-expiry/renewal test. |
| Pi two app users | [Two private accounts/domains](pi-accounts.json), **41 assertions**. Two users in one organization use the same Team agent with distinct real Cua domains, connections and native sessions. Each reads its own same-named source, creates/publishes output and downloads exact bytes; cross-user reads return 404. Revocation blocks new admission with 403 and no additional credential request. Both deliberately use the same vendor credential; distinct vendor identities are not certified. The private configuration is encrypted and no literal native key is found in the fixture files. [Cleanup audit](cleanup-audit.json) verifies all six owned container/network/volume resources absent. |
| OpenCode 1.19.5 / GLM Flash Free | [Quota failure delivery](opencode-limit.json), **11 assertions**. The selected public model currently rejects inference for exhausted Free quota. It reaches failed `PROVIDER_LIMIT` promptly, uses zero credential reads and retains Free billing; this is not successful inference or useful tool acceptance. |
| OpenMA Pi ACP 0.1.8 / Pi 1.5.2 | [Candidate attempt](pi-openma.json) fails the useful-tool gate: the native turn reports success but contains only a textual pseudo-tool invocation, with no actual ProductTools call. The common initial cohort therefore stops before reload/control/isolation gates for this candidate. It is not selected as the default. Upstream Pi remains the chosen implementation; further native context/skill checks stay open. |

## Corrections established by native failures

OpenCode's native `session.status` reported `free_tier_limit` with a retry approximately seven hours later, while its pinned ACP projection omitted that state. The [instrumented observation](opencode-events.json) explains the old apparent hang. One trusted public plugin hook now emits bounded readiness/quota records with a fresh private process prefix. The application validates the active session, revokes tools, terminates the owned process and lets the SDK drain written ACP frames. Ordinary stderr cannot settle a run, and transient retries remain harness-owned. The native result records the exact dispatch/settlement timestamps; it is not an overall app latency benchmark.

The [invalid-Pi attempt before the correction](pi-invalid-before.json) records a native credential failure incorrectly materialized as an empty success. The pinned upstream adapter discarded the authoritative assistant `message_end` stop reason and treated `agent_settled` as success. Its focused adaptation now tracks the last assistant outcome across retries, resets it per prompt and preserves failure/cancellation/output exhaustion. Raw provider error messages remain private. The accepted positive, negative and control probes follow this correction. [Source adoption and upgrade checks](../../../development/source-adoption.md#acp-migration--2026-11-16-in-progress) identify the exact upstream modules/revisions and maintained hooks.

## Consumer evidence

The [desktop](desktop.json) and [mobile](mobile.json) real-API browser journeys each pass **6 Bun assertions plus Playwright checks** against contract 2.4. They retain the shared onboarding/app model picker and five current harnesses, typed forms, attributed progress and frozen run selection. Generic Pi provider choices are discovered from two fictitious providers in a configuration file, with no registration; switching harness clears that configuration. OpenCode Free creation has no key input. These browser journeys use the SDK subprocess fixture and are separate from the native provider probes above. Their screenshots precede the later quota-guidance copy change; the final copy is typechecked and built, without a claim of a rendered native quota-error view. Actual Tauri picker/form evidence remains the retained cutover journey; this phase does not relabel it as native configuration-import acceptance.

The first browser attempt found an inaccessible exact provider label; the label was corrected and desktop/mobile were rerun separately. The original failed desktop and timed-out mobile [log](browser-initial.log) is retained. No failed attempt is counted as a pass.

## Source and reproduction

The [manifest](manifest.json), [compressed patch](source.patch.gz) and [archive receipt](source-archive.json) capture the affected current tree, pinned packages and source hashes. A private temporary Git index verifies patch application and every reconstructed source file hash. Earlier archives remain untouched. This is local implementation/verification, with no commit, push, deployment or fresh-device distribution claim.

```sh
bun scripts/verification/nma072/run-tests.ts tests/acp.test.ts tests/acp-adapter.test.ts tests/acp-api.test.ts tests/harness.test.ts
NGERTIIN_ACP_SELECTED_PROVIDERS=1 NGERTIIN_ACP_SELECTED_PROFILE=pi-upstream bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/selected-providers.test.ts
NGERTIIN_ACP_SELECTED_PROVIDERS=1 NGERTIIN_ACP_SELECTED_PROFILE=pi-upstream NGERTIIN_ACP_SELECTED_INVALID_CREDENTIAL=1 bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/selected-providers.test.ts
NGERTIIN_ACP_SELECTED_PROVIDERS=1 NGERTIIN_ACP_SELECTED_PROFILE=opencode NGERTIIN_ACP_EXPECT_PROVIDER_LIMIT=1 bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/selected-providers.test.ts
NGERTIIN_ACP_NATIVE_CONTROLS=1 NGERTIIN_ACP_NATIVE_CONTROL_PROFILE=pi bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/controls.test.ts
NGERTIIN_ACP_NATIVE_ACCOUNTS=1 NGERTIIN_ACP_NATIVE_ACCOUNT_PROFILE=pi bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/native-accounts.test.ts
bun scripts/verification/acp/capture-native-harnesses.ts
```

Remaining limits include successful inference/tools/reload for the selected OpenCode Free model, native Claude by explicit owner choice, further Pi instruction/skill/context parity, distinct vendor identities, actual credential renewal/expiry and complete native profile parity. The shared model picker is implemented and browser/native cutover evidence remains scoped; these results do not close the full migration.
