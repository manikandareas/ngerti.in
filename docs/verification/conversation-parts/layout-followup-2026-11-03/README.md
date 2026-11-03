# Conversation milestone layout follow-up — 3 November 2026

This follows the [conversation parts implementation](../README.md) and the user's report that the handoff row looked uneven and the final Goal row touched the composer. It changes shared DM/group presentation only. No backend, journal, routing, model, or data migration changes were made in this follow-up.

## Changes

- Keep the event icon and label together, vertically center the label and participant references, and center each wrapped row on narrow screens. Event participant names inherit the event font size and use 16 px avatars. Person references keep the agreed avatar + name appearance without a background or visible `@`.
- Add a 64 px end gap in addition to the measured composer height and existing edge fade. Apply the same bound to scroll padding.
- Preserve the distance from the bottom while the overlaid composer changes height if the reader was within the existing 70 px near-bottom range. The stick-to-bottom library observes content-box size, which excludes these padding changes. Readers farther up retain their reading position.
- Routine milestones remain direct rows, without a collapsible container.

## Measured results

| Check | Desktop fixture | Mobile fixture |
| --- | ---: | ---: |
| Icon/label center offset | 0 px | 0 px |
| Maximum wrapped-line horizontal center offset | 0.008 px | 0 px |
| Final milestone to composer at bottom | 124 px | 104 px |
| Gap when scrolled 64 px above bottom | 60 px | 40 px |
| Same gap after eight-line composer expansion | 60 px | 40 px |

Desktop uses a single handoff row; mobile wraps the label and participants onto two centered rows. Fixture geometry is tested with a 480 px viewport height to guarantee overflow. The normal project viewport is restored afterward. A further assertion checks that shrinking the composer while reading older content does not move that content.

Live Brave remained at its normal 1670 × 820 viewport. The group row's icon, label, and participant centers matched exactly. The final group milestone had a 123.93 px gap. DM had a 123.45 px gap; expanding the composer from 44 px to 160 px retained a 123.95 px gap after the resize correction. Test drafts were cleared and no new messages or native runs were submitted.

## Verification

From `apps/web-client`:

```sh
bun run build
bun run lint
bunx playwright test --config playwright.work.config.ts tests/group-responsibilities.spec.ts tests/work.spec.ts --grep 'group collaboration displays|contextual goals|unsafe Markdown'
bunx playwright test --config playwright.work.config.ts tests/group-responsibilities.spec.ts
```

- Build/typecheck and lint passed. The existing Vite large-chunk warning remains.
- Six focused desktop/mobile checks passed after the product changes (`layout-tests.log`).
- Both extended layout reruns passed after adding the older-reading-position assertion (`layout-history-tests.log`). Detailed geometry is in `desktop-layout.json` and `mobile-layout.json`.
- `git diff --check` passed.
- All 21 files in the existing parent evidence manifest retained their hashes. Earlier evidence was not rewritten.

## Evidence notes

- `group-before.json` records the initial 2.5 px vertical label offset. `group-after.json` / `group-after.png` show the corrected normal Brave group view. `group-final.png` is the final fresh-load group screenshot after all changes. `dm-after.*` shows the shared DM presentation.
- `dm-multiline-before.json` exposed a 7.45 px gap during composer expansion, leading to the resize correction. `dm-multiline-after.*` is the final successful fresh-load result.
- `dm-multiline-hmr-observation.*` is an intermediate development hot-reload observation with missing measured layout variables and an obscured milestone. It is retained as diagnostic evidence, not a passing result. A fresh load restored the variables; final live verification and production-build fixtures passed.
- `layout-initial-test.log` contains an initial mobile test-driver failure: directly setting a near-bottom scroll position was superseded by auto-scroll. The test now uses a mouse-wheel gesture to model user scrolling. `layout-before-resize-tests.log` predates the additional composer-resize correction.
- No new fresh-file upload, model inference, installer, deployment, or production acceptance is claimed. The earlier native/file evidence remains in the linked implementation report.

The work remains uncommitted.
