# NMA-062 — contextual collaboration and work UI

Implemented and locally verified against baseline `6ab5daba2fc0c200087a15e2718a5959c08c9d5d`, verified on 2026-11-01. NMA-060, NMA-061 and NMA-065 were fetched live as Done before implementation. Existing backend/key-storage changes were already present and are excluded from this change. The running development API publishes 1.17.0; this UI consumes existing gated conversation/resource/browser/app fields, without adding a response field or endpoint.

## Delivered

- Create group: name/owned-member dialog, durable operation/body, acknowledgement-loss recovery after reload, backend-selected opening speaker, routed conversation messages, retained input on membership rejection. Member profiles expose a group-safe summary; group instructions and membership are distinct from global profiles and DM resources.
- The existing contextual panel now supports Anggota, File, Goals and Routine. Lists/details stay in one panel; phone layouts use the existing sheet. Goals show responsibility, progress/blockers, source context and evidence. Routine shows schedule, timezone, next occurrence and previous outcomes. Conversational controls address the responsible member, and explain stopping a run versus pausing/stopping the responsibility.
- Files: managed or explicit host-folder binding, checked directory pagination, upload, safe raster/plain-text preview, download and explicit artifact-copy sharing. Origin, producing run and sharing provenance remain visible. Late file/history responses cannot populate another selected conversation.
- The noVNC viewer uses the backend's scoped RFB WebSocket ticket and the same managed profile/session/tab as browser tools. It is view-only. Reconnect/expiry obtains a fresh view ticket without replaying an action; site auth-required and unknown outcomes remain explicit. Group browser access follows the selected member's grant.
- Group input/review replies use the exact persisted human-request ID and revision. Native questions/choices and specific permission requests use the native request and requirement identity through the broker. Native acknowledgement is separate from action completion. No universal approval policy is added.
- Composio catalogue/connect/refresh, explicit per-context tool assignment and provider receipts/results are progressively disclosed. Unsupported/unknown visual inputs are rejected before upload; supported image inputs also require model modality support. Routed group messages have no attachment field in the gated contract, so group files are managed through File; the composer offers message attachments only in DMs. Video inference is unavailable in both active adapters and is not offered.
- Combined browser tests exposed dispatcher starvation: repeatedly failing preparation in early lanes exhausted all preparation slots each tick. `Background` now resumes its scan after the last attempted run, allowing ready lanes to proceed while keeping failed work queued. This internal scheduling repair changes no API field; consumer and backend checks are repeated after it.

## Verification ledger

The selected TDD seams were confirmed by the user: browser → real API for creation/privacy, contextual work/input, and browser/app/visual capability behavior. The initial group test failed on disabled creation, the contextual test on disabled tabs, and the browser/app tests on absent UI. Native input initially failed on the missing reply form; the persisted request was resumed after implementation, without replaying its tool calls.

Final results:

| Cohort | Evidence and boundary |
| --- | --- |
| Work UI | **22/22 pass**, desktop/mobile, real HTTP/domain/SQLite and managed Docker/RFB. Additional targeted app-receipt and group-opening-retry checks pass separately. App host/harness are controlled external fixtures; provider inference is separate. `browser.json`, `logs/work.log`. |
| Existing UI regressions | **10/10** conversation, **10/10** settings, **40/40** design-system/theme/hover, zero final fail/skip. `logs/conversation.log`, `logs/settings.log`, `logs/design-system.log`. |
| Backend/static | **253/253** backend tests; backend/web lint and typecheck, web build, verifier/browser-test typecheck pass. `logs/backend.log`, `verification.json`. |
| Group native | `native-codex.json`, `native-muse.json`: two-member group openers/router, scoped shared-instruction tool, exact human input/reply/continuation, reload without new admission. |
| Goal/Routine native | `responsibility-codex.json`, `responsibility-muse.json`: conversational capture, actual scoped file creation/publication and hash-verified bytes, scheduled responsibility and conversational pause cascading to Routine. |
| Browser/visual native | Codex drives the scoped browser to a synthetic page; VNC session/target matches real action receipts. Supported image upload/inference reads RAVEN 7146 and both shapes. Live Composio catalogue read succeeds; no real app account is connected or executed. `native-browser.json`, `native-image.json`, `live-composio-catalog.json`. |
| Restart/access | **14 native runs, all succeeded**, no failed/unknown. Restart preserves exact group/author/goal/Routine/artifact state and global profiles, hash-checked bytes and **zero new inference**; two mobile reloads pass. Changed grants disconnect the old VNC view; a fresh ticket shows the synthetic site auth-required signal with no new browser action. `restart.json`, `browser-access.json`. |
| Native permission | `native-permissions.json`: Muse requested `capture_goal`; the UI answered Allow once for that request. No native shell/write permission or persistent policy was approved. |
| Contract | `consumer.json`, `consumer-fixtures.json`: HTTP/SSE/pagination/replay/SQLite-restart, 6/6, no provider dispatch. |

The 14-run native denominator comprises eight group router/opening/input/continuation runs, four responsibility/initial-report/pause runs, one browser run and one image run. Native execution preceded the final UI review repairs; those repairs have real API/protocol-fixture browser regression and final-build restart/read proof.

Codex 0.166.0 uses `gpt-6.1-sol` with ChatGPT subscription. Muse 1.4.14-R7309.1 / SDK 1.4.14 uses `muse-spark-1.3` with an explicitly selected API key/developer credits. Muse subscription is not claimed. Routine dates are in 2035 and the proof responsibilities are paused; there is no recurring test work left active.

Verifier iterations are kept distinct from product failures: an initial fetch helper incorrectly called the boolean `Response.ok`; one verifier imported a package from the wrong workspace; the first continuation check observed answered state before the durable continuation admission; the Muse responsibility verifier initially timed out while a specific native permission was pending. Existing operations were inspected/resumed, never blindly resubmitted. The combined suite also found the real scheduling starvation described above and a test that selected an earlier Calendar account before the new connection refresh arrived; account selection now uses the returned connection identity.

Final verification also records an initial isolated cancellation-fixture failure under combined test load: its tool receipt succeeded but native confirmation was rejected. The focused protocol recheck passed 2/2 and the subsequent full backend cohort passed 253/253; no adapter behavior was changed. Earlier conversation/design-system tests still expected disabled group creation or a sidebar catalogue link absent from baseline `6ab5daba`; their expectations now match the approved navigation. A first parallel browser run collided in Playwright's shared artifact directory; work tests now use a dedicated ignored output directory, and the final design cohort passes 40/40. Initial receipt-fixture execution omitted the host's required final-authorization callback; that fixture was corrected, and the actual backend receipt/UI round trip passes 2/2. Browser MCP state used its URL title fallback while the VNC screenshot showed the synthetic page; verification binds the exact URL/session/target and retains that limitation.

[Two-axis review](review.md): 2 Standards and 5 Spec findings repaired; both reviewers confirmed zero remaining substantive findings. No scope expansion was identified. `verification.json` records aggregate denominators, `provenance.json` records pins/hashes, and `SHA256SUMS` protects the evidence bytes. Early JSON reports retain diagnostics/denominators; temporary Playwright trace attachment paths are not distributed artifacts.

Cleanup revoked all four proof-installation connections, removed the two copied credential files, closed the proof browser and removed ten proof-owned containers. Original credentials, unrelated containers and retained SQLite/evidence remain intact; verifier services were stopped. The credential-value scan covers the current evidence and authored responsibility paths without retaining secret values. See `cleanup.json` and `credential-scan.json`.

## Sources and dependencies

- UI/UX: `docs/research/openmausbot-2026-11-01/README.md`, design-system/tokens, pinned source excerpts and runtime screenshots. OpenMausBot 0.1.137 / source `7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`. Reused interaction patterns: short creation dialog, contact-style identities, one contextual right panel, simple resource rows and progressive disclosure. Existing Ngertiin theme/primitives are retained. No additional reverse engineering was needed beyond this recorded evidence.
- Application/runtime reference: Openbot `01e4b18e238e5de72a3570162c9f4275bb585786`, exact `docs/architecture/channels-and-messaging.md`, `docs/architecture/browser.md`, and the existing pinned agents reference. Separate execution contexts, command receipts, contextual authorship and capability-gated browser surfaces informed reuse. Upstream broadcast/multi-human/cloud/desktop policies are not adopted. Source observation does not establish Ngertiin execution.
- noVNC `@novnc/novnc` 1.7.0, `@types/novnc__novnc` 1.6.0. The official [RFB API](https://novnc.com/noVNC/docs/API.html) was checked; ESM client is loaded only when the viewer opens. `types/novnc.d.ts` maps the 1.7 package-root export to the 1.6 declaration path. No backend VNC transport is copied or replaced.
- Existing stack: Bun 1.3.10, TypeScript 7.0.2, Vite 8.3.5, React 19.3.1, Playwright 1.64.1, Composio backend SDK 0.27.0, browser-use 0.13.14, managed image `ngertiin-browser:nma058` (`sha256:b5f100e0ba7c544e640fba94b6685d56ecf08e7359b62f39ec3b13f63d1ae368`). Exact frontend resolution is in `bun.lock`.

Upgrade by comparing the pinned UI pattern/source and official noVNC API, retaining application lifecycle/resource authority, then repeating affected desktop/mobile, ticket-expiry, grant-revocation, and native cohorts. Do not overwrite historical evidence or adopt unrelated upstream optional/deferred features.

## Reproduce

```sh
bun run --filter @ngertiin/web-client test:work
bun run --filter @ngertiin/web-client test:conversation
bun run --filter @ngertiin/web-client test:e2e
apps/web-client/node_modules/.bin/tsc --project scripts/verification/nma062/tsconfig.json
```

The work browser suite requires Docker and the existing tested `ngertiin-browser:nma058` image. It uses fresh temporary installation state on ports 8321/4321. Protocol/app fixtures run real domain/backend services and no external inference or app write. The separate native verifier uses `.dev/nma062-native`, ports 8322/4322, existing Codex proof credentials and explicit `MUSE_API_KEY`; never overwrite an earlier cohort. Start the normal API with the pinned Muse executable on PATH, run `provision.ts` once, then `native.ts`, `responsibilities-native.ts` and its request-specific `approve-native.ts` helper, `browser-native.ts`, `restart.ts before/after`, `browser-access.ts`, and `cleanup.ts`. The synthetic browser site uses port 8323. Work browser artifacts live under ignored `.dev/nma062-playwright`. Credentials stay in isolated backend state, never evidence or browser bundles.

This ticket does not claim NMA-063 whole-product acceptance, signed-out OAuth, external app messaging/writes, installer, deployment, production readiness, or general desktop control.
