# Shared chat bubble width — 2026-11-12

Scope: web/Tauri user and assistant text bubbles share the existing 35rem token (560px at the default root size). Row-relative container units preserve the same cap with a group avatar. Action clearance and table minimum widths remain bounded by that cap.

Browser checks used the running Vite development app and agent-browser. Assistant Studio message rows were cloned locally into user, DM assistant and group assistant fixtures with identical long text and production wrapper structure. No message was submitted.

| Viewport | Row width | User | Assistant DM | Assistant group | Page overflow |
| --- | ---: | ---: | ---: | ---: | --- |
| 1440 × 1000 | 960px | 560px | 560px | 560px | None |
| 390 × 844 | 332px | 265.59px | 265.59px | 265.59px | None |

All six text measurements passed equal-width and maximum-width assertions. Desktop/mobile screenshots were inspected during the session. The unmodified group table preview also passed at 390 × 844: 265.59px bubble, 241.59px table, no page overflow. Biome passed for both changed CSS files; the Impeccable detector returned no findings.

The repository documentation check reports eight broken links in unchanged GPUI skill files. It reports no broken links in the updated interface page or this evidence page. `git diff --check` passed.

This is browser fixture and CSS evidence; native Tauri rendering and product-wide API acceptance were not rerun. Desktop-rs is outside this change.

## Conversation column follow-up

The owner subsequently selected a 60rem (960px) shared maximum for the conversation, header and composer. The comfortable preference uses 44rem (704px), and loading placeholders inherit the shared column. At 1440 × 1000, the live application served through the Tauri loopback gateway measured all three wrappers at 960px with the same 400px left edge and no page overflow. The rendered screenshot was inspected. Updated-file Biome and web-client typecheck passed. This is a browser view of the gateway; native-window rendering was not rerun.
