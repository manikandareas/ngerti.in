# OpenMausBot primitive design-system verification

Date: 2026-11-01. Scope: `apps/web-client/src/styles/theme.css` and every primitive in `apps/web-client/src/components/ui`, plus the shared stylesheet, live foundations, design-system documentation and browser checks. This completes the primitive styling pass on top of the earlier conversation redesign. Existing backend work in the shared worktree is outside this change.

## Source and evidence

- Installed target: `/Applications/OpenMausBot.app`, version **0.1.137**. The retained [research](../../research/openmausbot-2026-11-01/README.md) pins upstream source commit `7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`.
- Current installed CSS and both Geist Latin font files match the retained bytes. All **35/35** retained manifest entries still match their hashes. [source-parity.json](source-parity.json) records paths and digests. This proves asset identity, not complete upstream-source/build equivalence.
- The retained REA UI record has parent Evidence ID `ev_baf48007a04d11e208f83aaf5ed542435a9f2fabb7afb706eb1a8fb30e9e155b`. Its static selection was five text files, four parsed JavaScript files and zero parse failures, with 147 relevant files unselected. The analysis and its unknowns were reused; no new native execution or inference was required for styling.
- The [immutable menu recipe excerpts](../../research/openmausbot-2026-11-01/evidence/source-excerpts.md) specify 14px menu surfaces, 6px padding, 4px row gaps, minimum 30px rows, 6px row corners, 14/18px item text and 40px touch rows. The [shipped tokens](../../research/openmausbot-2026-11-01/design-tokens.json) supply the two palettes, menu hover/active alphas, control and scrollbar colors, fonts and code color schemes.
- NMA-060 was fetched live as **Done**, including the 1.16.0 API readiness closure. Product/runtime contracts and ticket statuses were not changed. Knowledge-graph discovery tools were absent from this session; bounded file reads and `rg` were used as the documented fallback.

## Implementation and coverage

All **63/63** installed primitive files were inspected. **52** have direct style updates; **11** inherit the semantic theme or have no authored visual styles. Component exports, prop contracts, interaction ownership and dependencies are retained.

| Family | Files | Result |
| --- | --- | --- |
| Controls, 13 | button, button-group, checkbox, input, input-group, input-otp, native-select, radio-group, slider, switch, textarea, toggle, toggle-group | 13/20px desktop control labels, 16px mobile text entry, role-based radii, 28/32/36px controls, readable states, quiet form focus and border-only text focus; 36×20px default switch |
| Menus, 6 | combobox, command, context-menu, dropdown-menu, menubar, select | Source menu recipe, semantic hover/active colors, 200ms entrance, 1.5px icons; command palette capped at min(480px,70vh) with a 560px desktop width |
| Overlays, 7 | alert-dialog, dialog, drawer, hover-card, popover, sheet, tooltip | Shared neutral surfaces and role radii; dialog 240ms, sheet 260ms, exit 180ms; phone side sheets fill the viewport |
| Navigation, 4 | breadcrumb, navigation-menu, pagination, sidebar | 280px sidebar, 80px icon rail, full-width phone roster with close control, 10px navigation corners, quiet focus and motion |
| Content surfaces, 7 | attachment, bubble, card, chart, code-block, empty, item | Neutral user bubbles with 20px corners, 16px assistant/card surfaces, subtle card ring, semantic chart tooltip, 17px empty title; code blocks follow light/dark mode |
| Interaction/layout, 9 | accordion, calendar, carousel, field, progress, questionnaire, resizable, scroll-area, tabs | Consistent motion/focus, readable tabs and selected calendar states, semantic question surfaces, scrollbar token |
| Feedback/data, 6 | badge, message-scroller, sonner, spinner, table, trace | Semantic status colors, thin icons and shared transition durations/easing |
| Existing semantic styles, 8 | alert, avatar, kbd, label, marker, message, separator, skeleton | Reviewed and retained; inherit corrected colors, fonts, radius scale and reduced-motion rules |
| Behavior-only, 3 | aspect-ratio, collapsible, direction | Reviewed; no authored visual styles to replace |

The source has no one-to-one counterpart for every shadcn component. Those components use the observed surface/control/menu/type roles as local adaptations. Ngertiin identity, the existing primary-contrast adjustments and Hugeicons are retained. Palette fidelity does not imply pixel equality or upstream feature parity.

Automatic dropdown, context and menubar surfaces use a local 192px minimum and a viewport width cap. This keeps ordinary headings on one line without tying the menu width to a short trigger label. Caller classes can still select a different width.

`theme.css` now distinguishes neutral controls from menu hover/active surfaces and restores the small radius scale. Custom type utilities use an explicit length hint, `text-(length:--text-control-label)/5`, so Tailwind and `cn` preserve font size alongside text color. The foundations page shows the new roles, menu shapes and popup/sheet timings. Code blocks no longer introduce a nested `.dark` scope; Shiki already provides both color schemes. Functional OTP caret blinking and copy-confirmation timing remain independent of panel motion.

## Verification

| Check | Result |
| --- | --- |
| Production TypeScript/Vite build | Pass; no CSS optimizer warnings |
| Typecheck and Biome | Pass; 149 files checked by Biome |
| Scoped whitespace check | Pass |
| UI/theme/hover/gallery | **48/48 pass**, 0 failed/skipped/flaky |
| Primitive previews inside the UI suite | **252**: 63 × 2 themes × 2 viewport projects |
| Final popup refinement | **4/4 pass**; five popup families per case, both themes and viewports |
| Conversation API consumer regressions | **10/10 pass** |
| Settings API consumer regressions | **10/10 pass** |
| Contextual work/API/broker regressions | **22/22 pass** |

[results.json](results.json) retains every initial case/project/status and the full report/log identities. [implementation-inventory.json](implementation-inventory.json) records the 63 primitive hashes and shared stylesheet hashes before the final user refinements below. Browser suites use isolated application state and controlled fixture harnesses; they exercise the actual UI/API without claiming native provider acceptance. Original research and raw earlier verification artifacts are preserved unchanged.

In the initial cohort, the full 48-case UI sweep preceded the menu minimum-width refinement. That refinement was followed by a fresh production build and the 4-case popup sweep, covering all 20 theme/viewport/popup combinations. Other component styles were unchanged between those two initial runs. Input focus, invalid state, font size plus text color, switch travel, neutral bubbles, full-width dismissible mobile sidebar and reduced-motion dialog behavior are covered by the UI sweep. Seven semantic contrast pairs in both themes/viewports remain at least 4.5:1.

Earlier checks exposed and resolved a font-token collision (46/48 initial UI cases) and a test measurement taken during popup scale animation; the final popup check waits for the opening geometry to settle. An earlier work run was 21/22: the concurrent-lane question had not appeared and both requests remained queued. Its focused rerun passed 1/1 and the subsequent full run passed 22/22; no runtime behavior was changed to obtain that result. These earlier observations are not counted as passes in the final cohorts above.

Representative rendered screenshots, visually inspected:

- [Daylight buttons](screenshots/button-daylight-desktop.png) and [Midnight buttons](screenshots/button-midnight-desktop.png).
- [Daylight desktop menu](screenshots/menu-daylight-desktop.png) and [Midnight touch menu](screenshots/menu-midnight-mobile.png).
- [Daylight mobile select](screenshots/select-daylight-mobile.png), [Midnight questionnaire](screenshots/questionnaire-midnight-mobile.png), and [Daylight chart](screenshots/chart-daylight-desktop.png).

## Final user refinements

The user subsequently requested softer form boundaries, then still quieter borders, and light primary/destructive button labels. Final normal input boundaries are `#e1e1e1` / `#2d2d2d`; focused boundaries are neutral `#c9c9c9` / `#414141`. Form rings are 1px at 20% opacity without an offset. The composer shares the quiet boundary, and the workspace's general button outline excludes form roles. Primary/destructive labels are white in both themes; deeper action fills and hover/pressed colors preserve readable text.

- A fresh production build, typecheck and Biome pass. The latest complete UI/theme/hover/gallery run is **48/48 pass**, 0 failed/skipped/flaky, including all **252** primitive previews and seven semantic contrast pairs. [Final results](final-polish/results.json) retain every case and the full report digest.
- [Sixteen rendered focus samples](final-polish/focus-metrics.json) cover eight form families in both themes, including a workspace-shell wrapper. Focused borders resolve to the neutral tokens and ring offset is zero. [Final source identities](final-polish/implementation-inventory.json) cover all 63 primitives plus the three shared style/foundation files.
- Visually inspected final [Daylight input](final-polish/light-input-focused.png), [Midnight input](final-polish/dark-input-focused.png), [Daylight buttons](final-polish/light-buttons.png), and [Midnight buttons](final-polish/dark-buttons.png).
- The earlier conversation/settings/work cohorts above remain evidence of their recorded revision; they were not rerun after this visual-only refinement. No API/runtime contract changed in this work.

Reproduce from `apps/web-client`:

```sh
bun run build
bun run lint
bun run typecheck
bunx playwright test --output=/tmp/ngertiin-primitives-ui --reporter=json
bunx playwright test --config playwright.conversation.config.ts --output=/tmp/ngertiin-primitives-conversation
bunx playwright test --config playwright.settings.config.ts --output=/tmp/ngertiin-primitives-settings
bunx playwright test --config playwright.work.config.ts --output=/tmp/ngertiin-primitives-work
```

This verifies the requested visual system and bounded consumer regressions. It does not claim a new provider inference cohort, complete screen-reader audit, installer or deployment acceptance. No push or deployment was performed.
