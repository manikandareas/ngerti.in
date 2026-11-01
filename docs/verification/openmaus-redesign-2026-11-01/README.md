# Web-client OpenMausBot redesign verification

Date: 2026-11-01. Scope: the existing `apps/web-client` UI, global theme/CSS, component specimens and documentation. The backend, lifecycle/admission contracts and `apps/web` were not changed. No ticket status, commit, push or deployment was performed.

## Authority and implementation

- User explicitly requested redesigning the current web-client, including global design-system/colors, following [the retained OpenMausBot study](../../research/openmausbot-2026-11-01/README.md).
- [NMA-060](https://app.notion.com/p/409abdd61873819b80c4dd2b3e593834) was fetched live as **Done**, with API 1.16.0 readiness closure. Older In Progress snapshots in the research/index are historical; this task did not close the gate.
- [Current frontend screen decisions](https://app.notion.com/p/40babdd6187381abba02d29c7363474d) and product scope were read. The change preserves the current feature boundary: group creation and File/Goals/Routine remain disabled; this is not NMA-062/063 completion.
- The knowledge-graph tools were not available in this session's tool inventory. Code discovery used bounded repository reads and `rg` as the documented fallback.
- Visual reference: OpenMausBot 0.1.137, source commit `7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`. This is an adaptation of proportions/tokens, not an upstream runtime/source port. See [DESIGN_SYSTEM.md](../../../apps/web-client/DESIGN_SYSTEM.md) for mapping and intentional accessibility adjustments.

Implemented: global Midnight/Daylight neutral surfaces, solid blue primary actions, Geist 5.3.0, semantic card radius, agent-specific colors, 280px roster, centered header capsule, neutral assistant replies, identity-tinted user bubbles, compact growing composer, 320px profile, and responsive sheets. Existing real API calls, durable operation keys, queues, edit/delete, stop/steer/reconcile and memory behavior are retained.

## Checks and denominators

| Check | Final result |
| --- | --- |
| `bun run build:web-client` | Pass; TypeScript + production Vite build |
| `bun run typecheck:web-client` | Pass |
| `bun run lint:web-client` | Pass; 116 files, no fixes/warnings |
| `git diff --check` | Pass |
| UI/theme/hover/gallery browser suite | **40/40 pass**, 0 failed/skipped/flaky |
| Real API conversation regression suite | **10/10 pass**, 0 failed/skipped/flaky |
| Primitive previews within the UI suite | 63 components × 2 themes × 2 viewport projects = **252 previews** |
| Theme contrast assertions | Seven semantic text/surface pairs × 2 themes × 2 viewport projects, all ≥4.5:1 |
| Manual tablet rendered bubble | White on current identity tint **6.973:1**; panel 320px, roster hidden, no horizontal overflow |

Results: [UI cases](ui-results.json), [conversation cases](conversation-results.json), [tablet computed metrics](tablet-metrics.json). Full Playwright JSON reports remain at the recorded `/tmp` paths with their SHA-256 identities. The retained summaries include every final case, project, duration and status without duplicating test environment data.

The first UI sweep was 36/40: four viewport/theme variants exposed a Card using generic `rounded-xl` (12px) instead of the intended 16px semantic card token. Card now uses `rounded-card`; the focused theme rerun passed 14/14, followed by the final 40/40 suite above. The final conversation 10/10 run followed the last production code/style changes.

Reproduction from `apps/web-client`, after building:

```sh
bunx playwright test --output=/tmp/ngertiin-redesign-final-ui --reporter=json
bunx playwright test --config playwright.conversation.config.ts --output=/tmp/ngertiin-redesign-final-conversation --reporter=json
```

Use distinct output directories for concurrent test runs. Conversation screenshots/report defaults now write to test output rather than overwriting the historical NMA-061 evidence.

## Manual visual review

CUA/Brave inspected the real UI against a separate actual API/SQLite instance with **no native executors**:

- UI: `http://127.0.0.1:3002/`; API loopback 8331; isolated state `/tmp/ngertiin-redesign-LMwdnr`.
- Started with `NGERTIIN_STATE_DIR` pointing to that temporary directory and `scripts/verification/nma061/api-server.ts`; Vite used the same state directory and `NGERTIIN_API_URL=http://127.0.0.1:8331`.
- Desktop 1670×877, phone 390×844, tablet 1024×768. Phone/tablet viewport override was reset. Final theme restored to System.
- Created one test agent through the real creation UI. Its durable opener remains **queued**, not a claimed inference result. Test account/model are not authenticated; the setup prompt and unknown states are visible honestly.
- Opened/closed the profile sheet, checked the tablet roster collapse, switched Daylight/System, and inspected settings. The review tab and isolated services remain available on 3002 for inspection; the pre-existing 3001 server was not stopped or reconfigured.

| View | Evidence |
| --- | --- |
| Desktop Midnight | [Screenshot](desktop-midnight.png) |
| Desktop Daylight | [Screenshot](desktop-daylight.png) |
| Phone conversation | [Screenshot](mobile-chat.png) |
| Phone detail sheet | [Screenshot](mobile-panel.png) |
| Tablet context | [Screenshot](tablet-panel.png) |
| Shared settings | [Screenshot](settings-daylight.png) |

One development-console React warning about rendering a script tag was observed and retained in [browser-console.json](browser-console.json). Production-preview tests reported no runtime errors. A CUA capture timed out once; a fresh tab on the same selected browser restored capture. Neither event is hidden as a passing provider/native test.

## Limits

This verifies the redesign and current API-consumer regressions. No new native Codex/Muse inference, external write, browser-VNC session, installer, deployment, full screen-reader audit or production reliability cohort was run. Those remain separate acceptance scopes. Original research/evidence hashes and unrelated work were preserved.
