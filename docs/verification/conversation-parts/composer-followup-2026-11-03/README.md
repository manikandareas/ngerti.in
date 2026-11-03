# Expanded composer follow-up — 3 November 2026

The user requested the expanded [Beautiful UI Prompt Bar](https://www.beautifului.dev/#prompt-bar) arrangement, focusing on attachment and send positions, and a smaller conversation end gap. The current reference was observed in Brave; the supplied image is the visual authority. This is a shared DM/group UI change. No backend, routing, billing, or native harness behavior changed.

## Result

- The compact composer retains its existing one-row arrangement.
- Expanded input spans the full width above a bottom toolbar. Attachment is at bottom-left; send/queue/stop/edit actions retain their existing behavior at bottom-right.
- Both toolbar controls share the same vertical center. Text and toolbar have an 8 px separation, and text/controls have matching 8 px side insets.
- On mobile the expanded background encloses the complete composer, including the attachment action. Compact mobile styling is preserved.
- Multiline detection considers the width needed beside the compact controls, including editor padding. Widening the expanded editor therefore does not repeatedly collapse/re-expand wrapped text or inline attachments. Explicit line breaks and the 144 px editor height cap remain supported.
- The final conversation end-gap token is 16 px, reduced from 64 px. Including the existing fade and composer insets, the measured final milestone-to-composer gap is 76 px on desktop and 56 px on mobile (previously 124 / 104 px). At 32 px above the bottom it remains 44 / 24 px. Composer expansion preserves that distance; reading older content retains its position.

## Verification

From `apps/web-client`:

```sh
bun run build
bun run lint
bunx playwright test --config playwright.work.config.ts tests/composer.spec.ts tests/group-responsibilities.spec.ts
bunx playwright test --config playwright.work.config.ts tests/composer.spec.ts --grep 'expanded composer'
```

- Build/typecheck and lint passed; the existing Vite large-chunk warning remains.
- All 20 desktop/mobile composer and group responsibility tests passed. Coverage includes toolbar geometry, explicit line breaks, natural-wrap stability, attachment alignment/preview/removal/undo/paste, retry-safe pending sends, chronological milestones, and dynamic composer bounds.
- Two focused screenshot capture reruns passed. `desktop-closeup.png` and `mobile-closeup.png` show the requested expanded state; the full viewport screenshots are retained separately.
- `desktop-composer.json` / `mobile-composer.json` record a 0 px control-center offset and matching 8 px insets. Timeline JSON records the reduced gaps and resize behavior.
- `git diff --check` passed. The earlier implementation and layout follow-up evidence manifests remain unchanged.
- Two isolated, read-only assessments were used per the Impeccable layout workflow: visual/structural assessment and mechanical scan. The final layout detector returned no findings. The mobile compact-width estimate deliberately retains a small amount of hysteresis near the wrapping threshold.

The first test pass exposed mobile attachment layout oscillation, which was corrected by accounting for editor padding in compact-width measurement. Old gap expectations were updated for the newly requested smaller space. A test's estimated font width failed to reach natural wrapping on desktop; it now types through the actual wrapping boundary. Initial and intermediate logs remain labeled; they are not passing acceptance evidence.

Reference inspection used Brave. Final reproducible UI acceptance and screenshots use the isolated production-build browser fixture, separate from native model execution. No new real user messages, native runs, or file-upload acceptance are claimed. The work remains uncommitted.
