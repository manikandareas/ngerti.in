# Browser acceptance harness

Imports the production AgentsPage/DirectMessagePage and forwards their real API calls to a disposable native Hermes gateway. Authentication is a fixed test-account dependency and routing is a small browser-location shim; this is not production Clerk/deployment acceptance. The controlled provider keeps UI states reproducible. Real provider behavior is tested separately.

From repository root, after installing web dependencies:

1. Link `apps/engine/tests/browser/node_modules` to `../../../web/node_modules` if absent.
2. Run `serve.py` with the same pinned runtime environment as engine pytest. It writes `.dev/nma-025-browser.json`. Do not run another gateway suite concurrently.
3. Run `bun apps/web/node_modules/vite/bin/vite.js --config apps/engine/tests/browser/vite.config.ts`.
4. Open `http://127.0.0.1:3025`. Create/edit agents, open DM, send/cancel, create groups, and capture desktop/mobile states. The seeded writer DM has a real immutable downloadable artifact.
5. Stop both processes. The server fixture shuts down the gateway on termination.

Offline Chromium schedule/event/peer tests are in `test_wakes_browser.py`; use `NMA_TEST_BROWSER=1` and `NMA_BROWSER_EVIDENCE` to select an evidence directory.
