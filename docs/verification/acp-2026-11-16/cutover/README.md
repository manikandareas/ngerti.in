# ACP execution cutover and shared picker

Date: 2026-11-16. Status: **source cutover implemented; full native cohort remains In Progress**. This capture follows the immutable [foundation](../README.md) and [profile/API](../profiles/README.md) captures. Their descriptions apply to their own snapshots. The [current migration checklist](../../../architecture/acp-harnesses.md) owns completion.

## Result and source boundary

Codex execution now registers the common ACP adapter, alongside Claude, OpenCode and Pi. Muse retains SDK/MSP. The replaced native Codex execution client, RPC/parser/mapper and obsolete verification entrypoints are removed from the current tree. Only a narrow account authority remains; it rejects thread/turn/tool methods before transport. [Retirement provenance](../retired-source.json) preserves the exact Git recovery revision. There is no execution fallback.

The app and onboarding import the same model-picker component, current five-harness registry and observed-account catalog projection. Private model/account preference does not alter Team-agent harness ownership. Native reasoning default remains `null`; later model selection cannot mutate an admitted run. Native questions use the active run binding, and queued steering follows its frozen connection. Additive discovery no longer invalidates a just-admitted dispatch; capability/model/account/grant loss still fences it.

Advertised `compact` and `review` actions appear in DM progress details and prefill the composer. Sending them uses normal admission and the current authorized session. Group action shortcuts are omitted because an advertised command must remain attributed to the selected member. Other leading native commands and unadvertised context commands are rejected before dispatch; account/provider/tool changes remain app-owned. Fixture/browser proof covers this addition; the native Tauri capture predates these action buttons and does not certify them.

The [manifest](manifest.json), [source archive](source.patch.gz) and [archive receipt](source-archive.json) capture the working-tree source and exact executable/dependency hashes against Git `8e92fda1c581c8dc363de16a8d3b4870e09ad1f9`. The archive includes current runtime/API/consumer/tests and retired paths; unrelated persistence/owner work is excluded. Apply validation uses a temporary index without modifying the user's index. SDK **2.7.0**, ACP wire **1**, Bun **1.3.10**, Node **25.8.0**, macOS ARM64. No commit, push, deployment or distribution acceptance is implied.

## Executed checks

| Surface | Denominator and result | Evidence and limit |
| --- | --- | --- |
| Backend regression | 218/218 tests across 23 files, 2,133 assertions | [Backend log](backend.log); real disposable PostgreSQL plus official-SDK protocol fixtures, including retained Muse/product lifecycle coverage. Earlier 217/217 capture predates the command guard. |
| Static/build | Server/web typecheck, web production build and changed-source Biome checks | [Types](typecheck.log), [build](build.log), [source checks](changed-source-check.log). Whole-repo pre-existing marketplace provenance formatting is outside this change. |
| Desktop browser | One journey, 1440 × 1000 | [Result](browser-desktop.json), [log](browser-desktop.log), [picker](browser-desktop-picker.png). Real HTTP/auth/PostgreSQL, SDK subprocess fixture; no provider inference. |
| Mobile browser | One journey, 390 × 844 | [Result](browser-mobile.json), [log](browser-mobile.log), [picker](browser-mobile-picker.png). Same scope; screenshot inspected for five-harness layout and horizontal bounds. |
| Native Tauri | One real macOS client journey; six backend assertions | [Result](tauri.json), [log](tauri.log), [observation record](tauri-observations.json). Real PKCE/account HTTP/PostgreSQL and native WebView; ACP SDK fixture, no provider inference. |
| Native Codex subscription | Two completed turns, two useful `read_run_context` calls, explicit reload, two matching final receipts; 19 assertions | [Result](native-codex.json), [log](native-codex.log). Selected retained subscription only; disposable owner-mode data, not multi-account organization privacy. |
| Native Codex controls | One steering/cancel/self-stop journey; 17 assertions | [Result](native-controls.json), [log](native-controls.log). Deterministic HTTP barrier; nullable provider turn identity, accepted queued correction, intent versus confirmed cancel, self-stop receipt before interruption. |
| Managed installation | Four pinned adapters supported | [Installation](managed-install.json). App-owned prefixes; existing ambient OpenCode installation preserved. |
| Managed setup | Four profiles plus both Pi candidates: five initialize/catalog/new-session passes | [Setup](managed-profiles.json). Synthetic invalid keys, zero prompts/inference, no persisted key bytes and zero oversized files skipped. OpenMA uses the verification adapter prefix with the managed Pi dependency. |
| Documentation | Current docs/link/contract checks | [Docs check](docs-check.log). Historical evidence is retained with its original boundary. |

Each browser journey checks typed form bounds and native values, the shared five-harness picker, private model persistence with the original run selection retained, collapsed agent-attributed progress, safe context actions through ordinary admission, and explicit multi-provider key selection/clearing. Bun's six assertions are supplemented by Playwright assertions; inspect each log for the final denominator. The OpenCode connection save uses a synthetic invalid key and encrypted real API storage; it is not OpenCode inference.

Native Tauri used a private profile and separately identified, ad-hoc signed copy of the unchanged debug binary. Its SHA-256 is in the result. The client loads the current built web assets through its local gateway. A public fixture account signed in through real browser PKCE, a form rejected count `0` and accepted numeric `3`, the agent answered with the submitted values, and `model-a` persisted with reasoning `null` while the completed run retained `fixture-model`. Screenshots were observed in the CUA conversation only; no repository-native screenshot is claimed. The app was quit and its exact synthetic Keychain entry removed; unrelated credentials were untouched.

Native Codex discovery advertised commands and usage. The two-turn capture is not a multi-call latency benchmark. The control capture includes an expected revoked held-tool diagnostic after cancel; no new inference failure is implied. Live account-authority renewal, expiry/revocation and separate-account isolation remain open despite fixture coverage. Native skill metadata support was asserted, not a full native skill-use journey.

## Pi comparison and remaining native gates

| Observation | Upstream Pi ACP 0.0.34 | OpenMA Pi ACP 0.1.8 |
| --- | --- | --- |
| Resolved Pi dependency | Independent CLI 1.5.2 through RPC | In-process SDK 1.5.2 |
| Scoped MCP/instructions | Exact-hash private adaptation forwards HTTP MCP, constrains resources, applies selected instructions and propagates errors | Exact-hash private adaptation constrains resources/instructions with upstream direct MCP forwarding |
| Current setup | Initialize, selected-provider catalog and new session pass | Same setup passes |
| Inference/tool/reload/cancel parity | Unverified | Unverified |
| Selection | Provisional default, matching the ACP registry candidate | Retained comparison candidate |

Neither candidate wins the full comparison from setup alone. Native OpenAI API-key Codex/OpenCode attempts reached the provider and failed for exhausted quota; Pi inference was not attempted after that known failure. Their prior raw failures remain in the [profile capture](../profiles/README.md). No free provider, another account or subscription fallback is selected. Native Claude remains **unverified by explicit owner choice** because no selected Anthropic key exists; the synthetic Claude setup pass does not change that.

The full four-profile inference/useful-tool/reload/control/account-isolation cohort remains open. Remaining native checks include selected-account expiry/renewal/revocation, changed instructions and catalog confinement during inference, private memory/skills, useful file read/artifact publication and research flows, background-work settlement, and the same native cohort for both Pi candidates. Fixtures establish implementation behavior, not these provider/host claims. This report does not close the goal or relabel historical milestone acceptance.

## Retained attempts and reproduction

The first Tauri attempt used a random redirect that the real client correctly refused. It was stopped with zero assertions and `completed=false`; its misleading test-runner pass is excluded from acceptance. The fixture now requires explicit completion and uses the registered callback. The accepted run executed six state assertions; the later explicit-stop guard was added during that run and was not loaded by its already-running Bun module. [Attempt log](attempts/acp-native-ui-attempt-1.log).

An earlier broad backend attempt had one routing deadline failure while four package installations were running concurrently. It is retained as a failure, not accepted or erased; the later idle 217/217 run passed, followed by the current 218-test cohort after command changes. [Earlier failure](attempts/acp-final-backend-regression.log), [focused command regression](attempts/acp-command-regression.log). Browser setup/debug attempts are excluded; accepted desktop/mobile runs each have their own output directory and log.

The first 218-test attempt ran alongside both browser journeys and missed an old 500 ms fixture acceptance poll (`dispatching` rather than `running`); it is retained as [217 pass / one failure](attempts/acp-cutover-backend-loaded.log). That configuration-snapshot test now uses the same bounded ten-second state wait already used elsewhere in the file. It asserts native acceptance before editing and still asserts the immutable active snapshot, fresh subsequent binding and thread-only history. This is a fixture synchronization correction, not a production latency change. The accepted broad cohort runs without parallel browser/package work.

The initial command-button browser assertion incorrectly used input `value` on Lexical's contenteditable textbox. Both journeys already showed `/compact` in the draft; the assertion now checks its rendered text. [Desktop attempt](attempts/acp-command-browser-desktop-attempt.log), [mobile attempt](attempts/acp-command-browser-mobile-attempt.log). The final separate journeys pass and execute the resulting admitted run.

```sh
NGERTIIN_ACP_PROFILE_RUNTIME=managed bun scripts/verification/acp/profiles.ts
NGERTIIN_ACP_BROWSER_CAPTURE=cutover-desktop bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/browser.test.ts -t 'desktop:'
NGERTIIN_ACP_BROWSER_CAPTURE=cutover-mobile bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/browser.test.ts -t 'mobile:'
NGERTIIN_ACP_NATIVE_UI=1 bun scripts/verification/nma072/run-tests.ts ../../scripts/verification/acp/native-ui.test.ts
bun scripts/verification/acp/capture-cutover.ts
```

The native UI fixture waits for an actual CUA/operator journey before `/complete`; launching it alone cannot pass. Live inference probes require the explicit selected connection/key and separate opt-in variables documented in their source. Never send credentials in chat or treat a missing/failed credential as a pass.
