# Midnight / Daylight design system

The active visual reference is [OpenMausBot 0.1.137 research](../../docs/research/openmausbot-2026-11-01/README.md), captured on 2026-11-01 from the installed app and upstream commit `7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`. This replaces the previous Page 1 / AccessGrid visual theme in `apps/web-client` at the user's request. The API 1.18 native interaction journal supports persistent source-style question and permission cards. The retained `apps/web` keeps its existing implementation.

Product compositions reconstruct the reference's messenger layout and interactions using Lucide, Geist and a narrowly reused original avatar renderer. Ngertiin entity identity, Radix/shadcn public APIs and the published harness-first contract remain authoritative. The current [fidelity ledger](../../docs/verification/openmaus-fidelity-2026-11-01/README.md) distinguishes implemented patterns from verified render/interaction coverage. Product scope remains Notion; the API gate and NMA-061/062 are Done, while NMA-063 remains a separate integrated acceptance ticket.

## Color roles

`src/styles/theme.css` owns global values and Tailwind mappings. `src/index.css` owns base rules and messenger composition; `src/features/settings/settings.css` owns the Settings overlay. Both the real workspace and `/design-system` consume the same tokens.

| Token | Role | Daylight | Midnight |
| --- | --- | --- | --- |
| `background` | Conversation canvas | `#fcfcfc` | `#121212` |
| `frame` | Surrounding shell / sidebar | `#ededed` | `#090909` |
| `panel` | Secondary panel surface | `#f5f5f5` | `#0e0e0e` |
| `card` | Replies and grouped content | `#f0f0f0` | `#1f1f1f` |
| `popover` | Menus and floating controls | `#ffffff` | `#1f1f1f` |
| `secondary` | Selected row / header capsule | `#e4e4e4` | `#202020` |
| `accent` | Hover / active surface | `#e4e4e4` | `#2c2c2c` |
| `control` | Neutral outlined action | `#e3e3e3` | `#282828` |
| `menu-hover` / `menu-active` | Ink over the menu surface | `#1c1c1c0f` / `#1c1c1c14` | `#f5f5f50f` / `#f5f5f514` |
| `composer` | Message input shell | `#ffffff` | `#1f1f1f` |
| `foreground` | Main text | `#1c1c1c` | `#f5f5f5` |
| `muted-foreground` | Secondary text | `#555555` | `#b1b1b1` |
| `text-tertiary` | Hints and metadata | `#5c5c5c` | `#a1a1a1` |
| `primary` | Global primary action | `#0b62c4` | `#0b62c4` |
| `primary-foreground` | Text on primary | `#ffffff` | `#ffffff` |
| `primary-hover` / `primary-pressed` | Solid action states | `#0957af` / `#084b98` | `#0957af` / `#084b98` |
| `link` | Readable action text | `#0b5cb8` | `#7fc0ff` |
| `ring` | Keyboard focus | `#0b62c4` | `#459ffe` |
| `border` | Hairline boundary | `#d0d0d0` | `#383838` |
| `input` | Quiet form boundary | `#e1e1e1` | `#2d2d2d` |
| `input-focus` | Quiet form focus | `#c9c9c9` | `#414141` |
| `success-foreground` | Success text | `#1f7a4d` | `#38d591` |
| `destructive` | Error text | `#c02b3a` | `#ff5667` |
| `warning-foreground` | Warning text | `#805200` | `#ffb547` |

Blue is the global primary; pink is one agent identity color. The client assigns a deterministic local color from agent ID, so renaming an agent or viewing it in a group does not change its visual identity. Tobi uses the original chrome image. No new persisted color field is introduced. Bubble/send fills are evaluated from upstream `userBubbleTone` at the pinned revision. Default vector avatars use the original three-stop material. User-provided avatar content is preserved.

Midnight below 768px follows the reference's phone palette: canvas `#141414`, panel `#1c1c1e`, card `#242426`, composer/menu/raised `#2c2c2e`, hairline `#3a3a3c`. Midnight menus use 12px corners on desktop and 22px on phone; Daylight uses 14px.

Accessibility adaptations are intentional: opaque secondary/quiet inks, quiet form/composer boundaries, darker light warning text, and white labels on deeper primary/destructive action fills. Form boundaries stay close to their surface; their focused border uses a quiet neutral gray. Body labels must meet 4.5:1. Semantic contrast pairs are checked from rendered browser values; the upstream palette alone is not treated as an accessibility result.

Primary buttons use a solid fill with explicit hover/pressed colors, no gradient or decorative shadow. The legacy `bg-primary-gradient` utility renders the same solid primary for the specimen's existing call sites. `primary-start` is a compatibility alias to primary, not a separate gradient stop.

## Typography and geometry

- UI: self-hosted Geist Variable 5.3.0. Code: Geist Mono Variable 5.3.0. Native/system fallbacks remain available. No runtime font CDN.
- Replies 15/22px; primary UI 14/20px; sidebar preview 13/18px; metadata 11–12px. Desktop composer text is 14/20px; phone text entry stays 16px to prevent focus zoom.
- Generic buttons and desktop inputs use 13/20px; menu items use 14/18px. Menu surfaces have 6px padding, 6px item corners, 4px between rows and a 50% hairline. Rows are at least 30px high, increasing to 40px for coarse pointers or devices without hover.
- Fixed product type scale: UI 14/20, caption 12/18, title 20/28, heading 30/36 (24/32 mobile). The larger display specimen remains a documentation-only role.
- Spacing uses the Tailwind 4px base and 2px subdivisions. Header capsule preserves the source optical 7.5px / 13.5px padding.
- Sidebar 280px; contextual panel 320px; centered column 60rem; ordinary bubbles cap at min(35rem,80%,column minus82px). Profile rows use the upstream 46px minimum and 11px vertical padding.
- Control radius 8px, navigation 10px, generic card 16px, modal 12px. Capsule headers and icon buttons are fully round. Chat bubbles use 18px corners and 7px/12px padding. The 44px composer uses 22px corners, changing to18px when multiline; phone + sits outside the pill.
- Button heights 28/32/36px; touch layouts retain readable input text and accessible names.
- The generic radius scale is 2/4/6/8/12/16px; role-specific control/card/dialog/menu/navigation tokens define component shapes. Components should use the role rather than flattening every radius to 8px.
- The optional native window/place frame is not copied as fake macOS chrome. The web shell uses a narrow neutral frame around a rounded conversation surface.

## Responsive behavior and motion

Below 768px the roster and profile use Radix sheets with modal focus handling and explicit close controls. Between 768px and 1279px, opening the detail panel hides the inline roster; the menu button opens it as a sheet. At 1280px and above, the 280px roster and 320px profile can remain alongside the chat. The conversation remains the return point.

Color transitions 120ms, popup entrance 200ms, panel entrance 240ms, sheet entrance 260ms and exit 180ms; easing `cubic-bezier(.22,1,.36,1)`. Reduced-motion rules remove panel movement and suppress decorative animation. General actions use a 2px semantic focus ring with a 2px offset. Form controls use the quieter `input-focus` border and, where needed, a 1px ring at 20% opacity without an offset. Text entry repaints its border instead of adding an outer halo; grouped inputs focus their containing border. Invalid forms retain the error border with a thin 20% error ring. Theme choice continues to use `next-themes` and the existing persistent storage key.

## Components and existing behavior

- Navigation: source-sized Tobi tile, agent/group rows, Settings owner control and app-connections pill at the bottom. Theme controls live in General Settings.
- Header: centered avatar/name capsule toggles the contextual panel. A shared searchable account/model/reasoning popup uses source suggestion limits, expansion, keyboard/typeahead navigation and source menu geometry.
- Messages: identity-tinted user bubbles, neutral assistant replies, compact truthful queue/error/tool state. Edit/delete/steer/stop/reconcile operations retain existing server-side behavior.
- Composer: one compact growing input, keyboard/IME guard, accessible send/queue/reconcile labels, retained draft and durable operation identity. No unimplemented attachment action is introduced.
- Profile: centered80px identity and17px name, Agent/Anggota/File/Goals/Routine tabs, compact grouped navigation rows, nested memory/skills/configuration/apps/browser/detail pages and Back/Escape/focus return. Group creation and all four contextual tabs consume the active API.
- Shared primitives: all 63 files were reviewed; 52 have direct style updates and 11 already inherit the semantic theme or contain no authored visual styles. Menus, forms, overlays, navigation, data displays and conversation primitives share the same roles. The [primitive verification ledger](../../docs/verification/openmaus-primitives-2026-11-01/README.md) records coverage and rendered checks.
- Code blocks and syntax highlighting follow Daylight/Midnight instead of forcing a nested dark theme. Copy feedback and the functional OTP caret blink retain their own timing.
- Settings: desktop900×700 overlay with198px rail, source header/section rows, phone bottom sheet, segmented theme controls and inline provider expansion. Deep links, draft preservation, focus containment and explicit billing remain functional.

## Provenance and upgrades

Keep original research snapshots and hashes unchanged. The avatar renderer is a narrow upstream UI source port; no upstream runtime/store/lifecycle is imported. Other product compositions follow the pinned component recipes while consuming Ngertiin APIs. On an upgrade, diff exact source modules/tokens, compare render and interaction evidence, and rerun build/typecheck/lint plus theme/gallery, conversation/picker, settings and contextual-work cohorts. Provider-native and installer acceptance remain separate.
