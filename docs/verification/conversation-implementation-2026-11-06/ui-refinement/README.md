# Studio and Computer UI refinement

This follow-up applies the user's latest presentation decisions on 2026-11-06. It supersedes the original delivery's preparing/completed Computer bubbles and preview controls.

- Studio no longer contains separate native-question, native-approval or native-history categories. Its questions/options/approvals reuse `HumanReplyCard`, the actual product presenter used by conversations. Simulated interactions remain local and do not invoke a provider or application mutation.
- Connecting, active and completed Computer activity use one attributed card shell. Connecting/completed cards have no image or iframe. Their Studio previews use the same width as the active card.
- The `Live · View only` footer and manual Reconnect button were removed. Existing credential renewal and automatic reconnect remain active. Connection/error information from the actual viewer is preserved.
- Compact card and side-panel previews hide the upstream toolbar, chips, statistics and manual failure-reconnect control using a scoped same-origin stylesheet. Expanded Computer keeps its native controls. The preview flag changes presentation, never an input grant or lease.

## Verification

14 browser cases passed: 2 Studio cases, 8 product-interaction cases, and 4 real-machine cases across desktop/mobile. The machine cases confirm hidden preview controls, preserved expanded controls, decoded video, automatic recovery after a transport detach, stable renewal, takeover/handback, independent card/panel viewers and completed-card history without an iframe.

24 machine backend tests and 49 frontend unit tests passed. Server/web typecheck, server/web Biome, web build and whitespace checks passed. The web build retains its existing bundle-size advisory. Provider inference was not rerun for this presentation-only refinement; its earlier evidence remains separately scoped.

Representative captures were visually inspected. Targets were scrolled into view before the Studio captures. [Screenshot hashes](screenshots.json) and [result manifest](verification.json).

| State | Desktop | Mobile |
| --- | --- | --- |
| Connecting card | [View](screenshots/desktop-computer-connecting.png) | [View](screenshots/mobile-computer-connecting.png) |
| Completed card | [View](screenshots/desktop-computer-completed.png) | [View](screenshots/mobile-computer-completed.png) |
| Active card and panel without viewer toolbar/footer | [View](screenshots/desktop-computer-card-and-panel.png) | [View](screenshots/mobile-computer-card-and-panel.png) |
| Real completed activity | [View](screenshots/desktop-computer-history-card.png) | [View](screenshots/mobile-computer-history-card.png) |
| Automatic reconnect | [View](screenshots/desktop-computer-auto-reconnecting.png) | [View](screenshots/mobile-computer-auto-reconnecting.png) |
| Recovered stream | [View](screenshots/desktop-computer-recovered.png) | [View](screenshots/mobile-computer-recovered.png) |
| Product approval | [View](screenshots/desktop-product-approval.png) | [View](screenshots/mobile-product-approval.png) |

Reproduce using the normal build and the scoped suites:

```sh
bun run lint
bun run typecheck
bun run build:web-client
bun test apps/server/tests/machines
bun test apps/web-client/verification
```

From `apps/web-client`, run `playwright.conversation.config.ts` with grep `web studio uses`, `playwright.work.config.ts` with grep `unconfirmed option|product text questions|approval is inline|retry is available`, and `playwright.machine.config.ts`. The machine cohort requires the configured retained local machine. It uses real product-tool observation and Cua video, with a deterministic inference fixture.
