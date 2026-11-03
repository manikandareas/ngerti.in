# Conversation/composer clearance repair

Verified directly in the existing Brave tab on 3 November 2026, at 1670 × 820.

The live page had no measured conversation inset variables. Content reserved only 64px while the compact dock occupied 72px and the expanded dock occupied 128px. At the actual scroll end, the last message was about 4px from the compact composer and overlapped the expanded composer by about 52px.

The measurement effect now follows the mounted surface DOM node. It initializes and reconnects through the actual element lifecycle. Scroll compensation uses the saved pre-resize scroll position so browser clamping during contraction is not applied a second time. The existing 16px end-gap token, transparent chrome, fade, message spacing and composer sizing remain in use.

| Browser check | Before | After |
| --- | ---: | ---: |
| Compact composer, latest message | 3.95px clearance | 75.95px |
| Expanded composer, latest message | 52.05px overlap | 75.95px |
| Collapse after expansion | Inconsistent | 75.95px |
| Reload and return to conversation | Insets missing | 75.95px |
| Reading older messages while composer expands | — | Scroll position delta 0px |

Measurements: [geometry.json](geometry.json). Checks and source hash: [checks.json](checks.json). Screenshots: [compact](desktop-fixed.jpg), [expanded](desktop-expanded.jpg).

The audit used two independent read-only assessments required by the layout skill: visual/layout review and mechanical pre-scan. Their shared conclusion was to restore dynamic clearance rather than enlarge global spacing. The layout detector returned no findings before or after the fix. Unrelated header/internal-bubble optical spacing is outside this repair.

Frontend typecheck, production build, scoped Biome and whitespace checks pass. The existing large-chunk warning remains. Browser validation covers desktop only; mobile CSS tokens were reviewed, but no mobile viewport override was applied. The original tab and empty draft were restored. No test message was sent and no native inference or backend/API change was needed.

Only the DOM-measurement and scroll-compensation lines in the already-dirty workspace layout were edited. Other concurrent changes remain untouched. No commit or push.
