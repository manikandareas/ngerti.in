# Shared account-entry redesign — 2026-11-15

The owner's final direction retains the Midnight/Daylight design system, gives the left column more brand character, and uses a busy photographic retro office with multiple coworkers and visible cubicles from a high CCTV angle. The owner subsequently selected **Vignette Bloom** and explicitly chose to apply a similar style/motion to the CCTV photograph, rather than use the reference video's embedded image.

## Implementation

- [Shared account screen](../../../apps/web-client/src/features/account/account-screen.tsx): bounded two-column composition, exported brand avatars, existing blue Button/Input primitives, account forms and native browser waiting/cancel flow. Organization/invitation semantics and authentication APIs are unchanged.
- [AsciiArt component](../../../apps/web-client/src/components/ui/vignette-bloom.tsx) and [account placement](../../../apps/web-client/src/features/account/account-artwork.tsx): the owner-supplied video component is adapted with local media, a matching poster, reduced-motion stills and hidden/offscreen pause. Playback failure retains the poster and usable form.
- [Authoring script](../../../scripts/design/bake-account-artwork.mjs): independent 2D raster adaptation of the reference's rounded sampled pixels, soft bloom, vignette and gentle exposure wave. Produces a silent 60-frame/24fps, 768×1152 H.264 loop lasting 2.5 seconds. No original editor shader code was supplied/adopted. Sharp and ffmpeg are authoring tools; no new runtime dependency or per-frame application Canvas loop is required.
- [Local assets and exact image prompt](../../../apps/web-client/public/images/sign-in/provenance.json): generated fictional office photograph, source-recipe/media identity and hashes, local adaptations, exported avatar recipes and upgrade checks. The three 176px transparent WebP avatar exports avoid shipping large SVG fur paths. All runtime assets/fonts are local.
- [Product specification](../../product/interface.md#web-and-tauri-account-entry--2026-11-15) and [design-system amendment](../../../apps/web-client/DESIGN_SYSTEM.md#account-entry--2026-11-15) own the behavior and visual rules.

Desktop controls use the existing 36px large-control role; narrow layouts use 44px controls and 16px input text. Product headings retain the 30/36px desktop and 24/32px narrow roles. Below 900px the artwork is hidden; short desktop windows omit the decorative avatars. The avatars are branding, not provisioned agents or online indicators.

## Verification

Environment: macOS 26.3 (25D125), Bun 1.3.10, Node 25.8.0, React 19.3.1, Vite 8.3.5, Playwright 1.64.1 and sharp 0.35.5. Base revision `af57a7435601819c6ac94e0d993bb6cdf12fbfca` plus the scoped working-tree changes. The manifest records final source/asset hashes.

| Check | Result | Scope |
| --- | --- | --- |
| Production web build / TypeScript | Pass | Existing large-chunk warning retained |
| Chromium + WebKit presentation | 10/10 pass | Nine viewport/theme combinations per engine, 320–2560px; four axe scans per engine with no violations; bounds, control sizes, account actions, video playback/pause and fallback |
| Real account setup/recovery | 4/4 pass | Disposable PostgreSQL, real HTTP account/setup/recovery, desktop/mobile; captured before the final media-only replacement |
| Native debug build | Pass | Existing Tauri host compiles; final web assets staged separately |
| Asset authoring | Pass | H.264/yuv420p, 60 frames, 24fps, 2.5 seconds, no audio, matching WebP poster |
| Documentation / whitespace | Pass | Final checks retained in the logs |

Presentation fixtures intercept account APIs and simulate the desktop bridge and document visibility. They do not establish a real macOS native-session journey. Screenshots in this directory show the final production-build presentation with still artwork for reproducibility. [Presentation log](presentation.log), [real-account log](real-account.log), [web build log](web-build.log), [native build log](native-debug-build.log), [documentation log](docs-check.log), [mechanical detector](design-detector.json) and [manifest](manifest.json) retain detailed receipts.

An earlier development-server presentation run had loading timeouts. Final production-build presentation checks pass. The first broader account run passed 3/4, with the desktop composer still loading after organization creation; the same scoped cohort passed 4/4 on rerun. No production-code fix or root-cause claim is inferred from those reruns.

Reproduce:

```sh
bun scripts/design/bake-account-artwork.mjs
bun run build:web-client
cd apps/web-client
bunx playwright test --config playwright.account-entry.config.ts
```

## Boundaries

This is a scoped account-entry amendment to NMA-080/NMA-081. Statuses/dependencies and NMA-063/NMA-064 gates remain unchanged. Browser/WebKit render, native compilation, real account API journeys and actual Tauri window/session behavior remain separate evidence. The native window was not observed in this session because the computer-use browser host was unavailable. No deployment, release signing, installation, provider inference or billing acceptance is claimed.
