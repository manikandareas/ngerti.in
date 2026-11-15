# Button gradients and account-action follow-up — 2026-11-15

Owner-requested changes: remove the URL beneath desktop browser sign-in; use a primary action for the current web page and a secondary action for the other page; reduce the action gap to 12px; apply reference-inspired vertical gradients and inset highlights through shared `buttonVariants` while keeping existing design-system colors and geometry.

Sign-in shows primary Sign in / secondary Create account. Signup shows primary Create account / secondary Sign in. Recovery/reset retain their existing actions. Default, secondary, outline and destructive buttons receive the shared surface treatment; ghost/link remain flat. Disabled surfaces remove the gradient and inset shadows. The destructive top highlight is reduced to 3% to preserve contrast. No authentication endpoint, native-session or artwork change is included in this follow-up.

## Captured verification

- Production build and TypeScript: pass. See [build log](web-build.log).
- Final browser run: **10 passed, 4 failed**. See [presentation log](presentation.log). All account-entry cases pass in Chromium/WebKit, including signup variants, measured 12px spacing, removed desktop URL, recovery, motion and poster fallback.
- Four shared-button cases remain failing: Chromium light/dark cannot locate the exact Loading accessible name; WebKit light/dark do not observe the expected focus-visible state. These failures are retained without a root-cause or completed acceptance claim. The earlier destructive-hover contrast failure was corrected before this captured run.
- The existing `hover.spec.ts` still assumes solid primary fills and requires an update for the newly authorized gradient behavior. That older cohort was not rerun.
- The owner instructed the agent to stop further work and commit the current scoped result. No further UI changes or browser runs were performed after that instruction.

Screenshots retain this follow-up separately from [the initial redesign](../sign-in-redesign-2026-11-15/README.md). Native playback/window behavior and updated Tauri staging were not reverified for this follow-up. Milestone statuses/dependencies and product/distribution gates remain unchanged. [Interface specification](../../product/interface.md#web-and-tauri-account-entry--2026-11-15) and [design system](../../../apps/web-client/DESIGN_SYSTEM.md) describe the requested behavior.
