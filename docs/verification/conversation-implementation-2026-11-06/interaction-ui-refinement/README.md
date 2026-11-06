# Computer actions, editable answers and approval details

This 2026-11-06 follow-up applies the next three presentation decisions. It supersedes the connecting/completed Open Computer actions and collapsed approval details in earlier captures.

- Connecting and completed Computer cards contain status only. Open Computer is available only on an active activity. Completed history still has no image or media viewer.
- The custom answer is an editable radio/checkbox option alongside predefined answers. Focusing or typing selects it. For a single choice, choosing a predefined answer clears the custom selection/text. An empty selected custom answer cannot be submitted. Submission uses the existing selected IDs and text fields.
- Approval details are always visible as labeled fields and nested data in the shared `ScrollArea`, with a 192 px height capped at 40% of the viewport. Edge shadows show remaining content above/below and disappear at the corresponding boundary. Keyboard scrolling works. Text-file arguments are decoded for reading; binary/oversized content gets a bounded preview description. Command IDs remain hidden. Product and native compatibility presenters share the components while retaining their existing decision/acknowledgement behavior.

## Verification

16/16 browser cases passed across desktop (1440 × 1000) and mobile (390 × 844): four Studio cases, eight interaction/recovery cases and four real-machine cases. Coverage includes custom selection and editing, empty-answer validation, switching to a predefined option, submission, visible approval details, keyboard scrolling and changing shadows, lost acknowledgement/reload, native free-text serialization, approval decisions, live preview/automatic recovery and completed Computer history without the open action.

49/49 frontend unit tests, server/web typecheck, server/web lint and the web production build passed. Lint retains 13 server warnings in existing test code; the build retains its bundle-size advisory. [Result manifest](verification.json), [raw logs](logs/) and [screenshot hashes](screenshots.json).

Studio examples are local simulations using the production presenters. Interaction tests use the real API/persistence with an inference fixture. Machine tests use the retained real Linux desktop and decoded Cua video with fixture inference. No provider inference was rerun for this UI-only change. Contract 1.31.0 and backend authorization are unchanged.

Representative screenshots were visually inspected. Targets are in the viewport; approval top/bottom captures are taken before and after keyboard scrolling.

| State | Desktop | Mobile |
| --- | --- | --- |
| Connecting, no open action | [View](screenshots/desktop-computer-connecting.png) | [View](screenshots/mobile-computer-connecting.png) |
| Completed, no open action | [View](screenshots/desktop-computer-completed.png) | [View](screenshots/mobile-computer-completed.png) |
| Selected editable option | [View](screenshots/desktop-editable-custom-option.png) | [View](screenshots/mobile-editable-custom-option.png) |
| Approval details at top | [View](screenshots/desktop-approval-details-top.png) | [View](screenshots/mobile-approval-details-top.png) |
| Approval details at bottom | [View](screenshots/desktop-approval-details-bottom.png) | [View](screenshots/mobile-approval-details-bottom.png) |
| Persisted approval pending | [View](screenshots/desktop-product-approval-pending.png) | [View](screenshots/mobile-product-approval-pending.png) |
| Persisted approval submitted | [View](screenshots/desktop-product-approval-submitted.png) | [View](screenshots/mobile-product-approval-submitted.png) |
| Real active Computer/card and panel | [View](screenshots/desktop-computer-active-card-panel.png) | [View](screenshots/mobile-computer-active-card-panel.png) |
| Real completed history, no open action | [View](screenshots/desktop-computer-history-card.png) | [View](screenshots/mobile-computer-history-card.png) |

Reproduce from the repository root:

```sh
bun run typecheck
bun run lint
bun run build:web-client
bun test apps/web-client/verification
```

After the build finishes, from `apps/web-client`:

```sh
bunx playwright test --config playwright.conversation.config.ts --grep 'web studio uses|editable alternatives'
bunx playwright test --config playwright.work.config.ts --grep 'native acknowledgements|group writers|unconfirmed option|approval is inline'
bunx playwright test --config playwright.machine.config.ts
```

The machine suite requires the configured retained local machine. Avoid rebuilding the bundle while browser suites are consuming it.
