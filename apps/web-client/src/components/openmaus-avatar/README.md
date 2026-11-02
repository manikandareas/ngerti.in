# OpenMausBot avatar renderer

These five source modules are reused from OpenMausBot **0.1.137**, revision
`7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`. Original paths:

- `src/components/CursorAvatar.tsx`
- `src/components/cursor-face-data.ts`
- `src/components/mascot-motion.ts`
- `src/components/mascot-clock.ts`
- `shared/mascot-bodies.ts`

Local changes: the renderer's body import points to this folder. The body
catalog omits the unused Zod schema and persisted-value parser; Ngertiin uses
the default cursor silhouette. No runtime, storage or application lifecycle
logic is imported. The renderer retains the upstream shared animation clock,
offscreen suspension and reduced-motion behavior. Formatting/lint discovery
excludes this preserved upstream code; TypeScript still checks it.

`src/assets/openmaus/cursor-chrome.webp` is the exact installed
`Resources/ui/assets/cursor-256-Mw4jC-Z3.webp`. It is the default assistant's
chrome finish. Other default avatars use the original vector renderer and
palette. User-provided avatar values remain user content.

License and attribution: see the retained
[license](../../../../../docs/research/openmausbot-2026-11-01/evidence/OpenMausBot-LICENSE.txt)
and [notice](../../../../../docs/research/openmausbot-2026-11-01/evidence/OpenMausBot-NOTICE.txt).
To update, pin a new revision, diff these exact modules and rerun avatar,
conversation and reduced-motion browser checks.
