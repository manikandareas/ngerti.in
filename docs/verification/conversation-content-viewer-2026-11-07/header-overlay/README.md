# Transparent floating viewer header

Date: 2026-11-07. The user identified that the styled header still occupied a separate layout row. The header now overlays the full content viewport, with a transparent background and pointer passthrough between the interactive pills. Only Back, filename and menu surfaces paint backgrounds/shadows.

Ordinary document clearance scrolls away with the content. HTML uses a full-height iframe behind the header; a preview-only root spacer preserves the first readable content and scrolls inside that iframe. Source body/root attributes and original download bytes remain preserved. PDF controls stick below the overlay, and reading position/page tracking use the measured toolbar offset. The standalone Studio preview retains zero header inset.

Build, eight-file Biome and `git diff --check` passed. Six existing browser journeys passed (three on each viewport), with assertions extended for the reported interaction: content/header viewport tops coincide, scrolled code occupies the area behind the header, and hit testing in a header gap reaches the document. HTML starts behind the header while its first heading retains clearance; the PDF toolbar stays below the header and zoom/navigation remain correct. Dark table interactions, file source downloads, Back focus and menu-only Escape remain covered. No paid provider or native-installation acceptance is claimed.

```sh
cd apps/web-client
bunx playwright test work.spec.ts pdf-viewer.spec.ts rich-answer.spec.ts --config=playwright.viewer.config.ts --grep='Focus viewer opens|Focus PDF renders|rich reply.*dark'
```

[Build](build.log), [browser results](validation.log), [report](playwright-report.json), [Biome](biome.log), [fingerprints](source-manifest.json). Visually inspected captures: [scrolled code on mobile](code-mobile.png), [scrolled code on desktop](code-desktop.png), [HTML behind the transparent header](html-desktop.png). The shared fixture/API and broader native/provider boundaries remain those of the [initial Focus report](../README.md).
