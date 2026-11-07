# Ngertiin GPUI experiment

A separate, disposable Rust application testing whether the current web client's visual language and core interactions can be recreated with GPUI. It does not replace Tauri or own application state, models, scheduling, credentials or responsibilities.

## Open or run

The built macOS app is `dist/Ngertiin GPUI Experiment.app`. Double-click it in Finder. The bundle includes its fonts, images, web reference and loopback fixture server; Bun is not needed to run that built bundle.

From the repository root:

```sh
bun --cwd apps/gpui-experiment dev
```

To regenerate assets and build the local development bundle:

```sh
bun --cwd apps/gpui-experiment build
```

Source builds require the repository's existing Bun dependencies, Rust/Cargo, Xcode Command Line Tools on macOS, and `uv` for one-time conversion of the client's WOFF2 fonts to TTF. The development binary and Cargo cache live under `.dev/gpui-experiment-target`. This is an unsigned local development bundle, not a fresh-device installer.

## Try the scenes

- **Conversation:** familiar sidebar, agent header, message bubbles, composer and light/dark tokens.
- **Composer:** click Plus for a Tobi mention, sample file reference or skill token. Try undo/redo, Shift+Enter, Unicode paste, Save draft and Restore. Draft storage is deliberately in memory. Sending generates a deterministic fixture stream; Stop affects only that stream.
- **Experiments → Rich answer:** native selectable Markdown, table and syntax-highlighted code.
- **Experiments → workspace.rs:** native read-only code editor with syntax highlighting, selection and search.
- **Experiments → Avatar:** three cached client-derived portraits, four expression states and native motion with a pause control.
- **Experiments → report.html:** a real embedded WebView. Test overlay checks native GPUI composition above browser pixels.
- **Computer:** a separate browser surface. Without a configured viewer, it explicitly reports that no live desktop is connected.

Keyboard shortcuts: Cmd+1–6 select Conversation, Rich answer, Source, Avatar, HTML and Computer; Cmd+D toggles light/dark; Cmd+B toggles the contextual panel; Cmd+Q quits. Browser-focused shortcuts can be consumed by the embedded WebView; click the native composer to return keyboard focus.

The native app prints its ephemeral loopback reference URL on startup. That URL displays a fixed 1280×820 web fixture importing the **existing** client CSS, Lexical composer, Markdown renderer and avatar component. It is a representative comparison fixture, not the complete production client.

## Optional live Computer probe

```sh
bun apps/gpui-experiment/scripts/live-computer.ts
```

This attaches an observation-only viewer to the already configured retained Cua machine. It creates an isolated temporary SQLite state, registers zero executors, never starts the scheduler, and never provisions or starts the machine. Existing application data is not opened for writing. Machine configuration is read privately from `.dev/harness-first` or `NGERTIIN_GPUI_MACHINE_STATE`.

The probe writes a short-lived viewer URL to ignored `.dev/gpui-experiment-viewer.json`. Pass its `url` as `NGERTIIN_GPUI_COMPUTER_URL` when launching the native executable. Keep that file private and do not include it in evidence or commits. Stop the probe to close its viewers. Interactive takeover, input grants, renewal and reconnect acceptance are outside this experiment.

## Dependencies and provenance

- `gpui-kit` **0.9.0**, `gpui-webview` **0.9.0**, backend **GPUI Fast 0.1.13**, and `lb-wry` **0.53.3**; exact transitive versions and registry checksums are in `Cargo.lock`. The Fast backend is enabled for browser/native overlay composition. This does not test default upstream GPUI independently.
- Application startup and WebView integration follow the [official example](https://github.com/longbridge/gpui-kit/tree/46bf6d498fa101a3b11cc64e6d8c20d28d17b720/examples/webview). Native text, token inputs and source highlighting use the published 0.9.0 APIs.
- Colors, spacing, font sizes, 280px sidebar and bubble radii come from `apps/web-client/src/index.css` and `src/styles/theme.css`.
- Hugeicons **4.4.0** assets come from the installed `@hugeicons/core-free-icons` package. No replacement icon catalog is introduced.
- Geist and Geist Mono are the client's Fontsource **5.3.0** fonts, converted with fonttools **4.68.0** and Brotli **1.2.1**. Their OFL files are retained under `assets/fonts`.
- Avatar recipes and image geometry come from the existing `packages/avatar` configuration and web avatar renderer. Cached portraits are rasterized at build time. The nested eye-shadow filter is omitted because librsvg erases the eye interiors; native runtime motion uses GPUI. This is **not** a full Rust port of fur generation, gaze, blinking or export behavior.

On dependency upgrades, repeat native startup, text layout, token editing/undo/paste, theme switching, read-only source behavior, WebView resize/focus/overlay, and live read-only frame tests. Test Windows and Linux separately; the selected WebView integration requires X11/XWayland on Linux.

## Results and limits

See [the retained experiment evidence](../../docs/verification/gpui-experiment-2026-11-07/README.md). The experiment establishes working native components on the tested macOS machine, not complete 1:1 parity. Native tables/code actions, avatar animation, attachment uploads, full citation semantics, persistent drafts, PDF viewing, installation and other platforms remain separate work.
