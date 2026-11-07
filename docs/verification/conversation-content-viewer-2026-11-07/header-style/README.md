# Viewer header styling refinement

Date: 2026-11-07. The user requested conversation-header styling for the viewer: background surfaces, shadow and consistent action controls.

Back and actions use circular 39 px surfaces; the centered filename uses a noninteractive pill with matching height and typography. Spacing and the background/foreground color mix follow the existing conversation header. The surfaces reuse the theme's `--shadow-float` with a subtle edge, plus hover/open/pressed colors, a visible keyboard focus outline, coarse-pointer hit-area expansion and reduced-motion support. The full header remains borderless. Conversation header behavior and styling are unchanged.

Build, scoped Biome and `git diff --check` passed. Four existing browser cases passed without retries/skips: long-file contextual feedback and dark rich-table interactions, each on desktop/mobile. The long filename remains geometrically centered; Back focus, the same composer, file reference admission, table actions and downloads remain covered. No new test was added for this cosmetic change. The API/harness fixture boundary and native-installation limitations remain those of the [initial Focus report](../README.md).

Run the captured checks after building:

```sh
cd apps/web-client
bunx playwright test composer.spec.ts rich-answer.spec.ts --config=playwright.viewer.config.ts --grep='Focus feedback retains|rich reply.*dark'
```

Evidence: [build](build.log), [browser run](validation.log), [report](playwright-report.json), [source/build fingerprints](source-manifest.json). Captures were visually inspected: [light mobile](light-mobile.png), [light desktop](light-desktop.png), [dark desktop](dark-desktop.png), [dark mobile](dark-mobile.png). These are focused browser checks on the mixed local checkout, not a rerun of native/provider or product-wide acceptance.
