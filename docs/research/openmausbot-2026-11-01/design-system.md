# Design system reference

Extracted from OpenMausBot 0.1.137 shipped CSS and source commit `7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`. This is a reconstruction specification. Runtime user preferences may override authored values. See [evidence and scope](README.md).

## Surfaces and color

Use semantic roles consistently. Separate app, panel, raised control, composer and menu even when two values happen to match. Full tokens are in [design-tokens.json](design-tokens.json); [design-tokens.css](design-tokens.css) is a standalone token reference, not an application import.

| Role | Midnight | Daylight |
| --- | --- | --- |
| App canvas | `#121212` | `#fcfcfc` |
| Panel | `#0e0e0e` | `#f5f5f5` |
| Raised / hover | `#202020` / `#2c2c2c` | `#e4e4e4` / `#d8d8d8` |
| Agent bubble/card | `#1f1f1f` | `#f0f0f0` |
| Composer / menu | `#1f1f1f` | `#ffffff` |
| Composer ring | `#2a2a2a` | `#ebebeb` |
| Hairline | `#383838` | `#d0d0d0` |
| Primary text | `#f5f5f5` | `#1c1c1c` |
| Secondary text | `#f5f5f5a8` | `#555555` |
| Quiet text | `#f5f5f591` | `#5c5c5c` |
| Accent / accent text | `#1084fe` / `#7fc0ff` | `#0b62c4` / `#0b5cb8` |
| User bubble default | `#5a5a5a` | `#070707` |
| Success / danger / warning | `#38d591` / `#ff5667` / `#ff9800` | `#1f7a4d` / `#c02b3a` / `#8a5a00` |

Agent identity colors are separate from app accent: green, blue, red, orange, purple, cyan, pink, yellow, teal, coral, silver, chrome. Runtime R1 uses a pink identity-tinted user bubble, so a neutral default bubble token alone will not reproduce that screenshot. The Ngertiin preview uses synthetic identities, not the upstream mascot/logo.

The frame is derived using `color-mix(in oklab, var(--color-app), black var(--frame-shade))`, not a universal hard-coded black. Source default frame shade is 30%; Daylight sets 6%. Other skins may inherit additional tokens; [all-skin source inventory](evidence/source-design-tokens.json) contains literal declarations, not resolved cascades.

## Typography and spacing

- UI: **Geist Variable**, then native system fallbacks. Code: **Geist Mono Variable**, then SF Mono/Menlo/Consolas. Local Latin WOFF2 files are retained for the reference; other language glyphs use fallback.
- Component-observed sizes: metadata 11–12px; secondary/control 13px; main row/header 14px; some list titles 15px; empty-state name 17px; workspace title 18px. These are component choices, not an upstream formal type-scale API.
- Weight: 400 body, 500 controls/names, 600 emphasis. Use secondary/quiet ink to express hierarchy before adding badges.
- Tailwind compiled base spacing is `.25rem` = 4px at a 16px root. Common steps 4/8/12/16/20/24/32px. Preserve optical exceptions rather than rounding every value to the grid.
- Lucide icons generally 13–20px with thin 1.5–1.75 strokes. The preview uses a small inline SVG subset for local study.

## Layout recipe

```text
optional place/window frame (28px source reference)
┌─ agent/group list ─┬──── active conversation ─────┬─ contextual detail ─┐
│ search / +        │ avatar+name pill · model    │ close · tab row     │
│ Tobi              │                            │ Agent / Anggota     │
│ agents/groups     │ centered message column    │ File                │
│                   │                            │ Goals               │
│ account/connect   │ pill composer              │ Routine             │
└───────────────────┴────────────────────────────┴─────────────────────┘
```

| Element | Reconstruction value | Authority |
| --- | --- | --- |
| Simple sidebar | 280px; persisted resizing 240–480px with viewport clamp | Source + runtime AX width 280 |
| Advanced sidebar | 320px; icon density 80px or 92px with rail | Source only |
| Simple detail panel | 320px | Source; runtime visually corroborated |
| Advanced detail panel | `min(420px,42vw)` | Source only; optional upstream mode |
| Chat column | max 60rem / 960px at 16px root | CSS/source |
| Prose / bubble | 44rem prose; bubble capped at min(35rem,80%); cards 88% | CSS/source |
| Wide/full variants | 80rem column or full width; inventory only | CSS/source |
| Settings modal | max 900×700px, 12px corner | Source; runtime visually corroborated |
| Search palette | max 560px, max min(480px,70vh), top 14vh | Source only |
| Header pill | avatar24px; gap8px; padding7.5px top/bottom/left,13.5px right | Source |
| Simple sidebar row | 54px high, radius10px; name14/20px, preview13/18px | Source |
| Composer | padding8px; single radius22px, multiline18px; textarea max9rem | Source |
| Composer controls | round 28px; ring0.5px | Source |
| Menu | radius14px, padding6px, gap4px; row min30px, touch40px | Source |
| Button heights | 24/28 dense, 32 default, 36 large | Source |

The screenshot PNG is 2× the logical UI in this capture. Do not copy physical screenshot pixels as CSS dimensions. The user-resized window and selected chat-width preference can change apparent proportions.

## Component behavior

| Component | Default state and interaction | Required variants |
| --- | --- | --- |
| Agent/group row | Whole row selects chat; avatar, name, one-line preview; actions on demand | active, unread, working, waiting, long name, touch actions |
| Header identity | Whole capsule is profile button, `aria-expanded`/`aria-controls` | DM and group; stays reachable while reading |
| Assistant reply | Left aligned elevated bubble; rich blocks can expand beyond prose | streaming, completed, error, sources/table/file |
| User reply | Right aligned, identity tint optional | queued/editable, admitted, failed; edit is not undo |
| Composer | Maintains draft, grows with text, adds attachments locally | upload pending, queued, steer if supported, stop requested/confirmed |
| Tool activity | Human-readable short action; expandable input/output | running, unverified, failed, completed; authoritative receipts |
| Question card | Short choices with optional free text | unanswered, answered, stopped/expired; accessible keyboard choices |
| Detail list | Simple rows with right-side metadata and disclosure | empty/loading/error/detail/back; no new global navigation |
| Error banner | Reason near affected work; one relevant repair action | unsupported, unavailable, auth repair; preserve input/history |

Busy/queue/steer/stop/receipts here are source/UI contracts, not live-tested provider behavior. Ngertiin must derive each from its authoritative backend state and advertised capability. Do not copy upstream approval policy or introduce a universal approval layer.

## Motion, focus and responsive behavior

- Common easing: `cubic-bezier(.22,1,.36,1)`. Panel240ms, sheet260ms, workspace/message180ms, popup200ms, color120ms. Preserve reduced-motion preferences in any implementation.
- Prefer flat fills and subtle 0.5px rings. Menus have shadow-lg: `0 6px 16px -8px rgba(0,0,0,.18), 0 1px 3px rgba(0,0,0,.06)`.
- Focus uses a visible semantic focus color, 2px outline/offset. Input focus can repaint the border. Test contrast from computed rendering after adaptation; no passing accessibility audit is claimed here.
- Source thresholds: sidebar inline at768px; sidebar + one panel at1280px; two side panels at1536px. Phone panels become full-screen sheets. Upstream mobile behavior was read in source, not operated on a phone.
- Hover-only actions also have touch variants. Coarse-pointer textarea16px prevents Safari focus zoom. Preserve safe-area insets and an obvious close/back action.

## Ngertiin-specific adjustments

The right tabs are Agent/Anggota, File, Goals, Routine, following [current decision](https://app.notion.com/p/40babdd6187381abba02d29c7363474d). Opening member details must not expose DM-private memory/files/history. Goals are captured from meaningful conversation; Routine is created for explicit scheduling/checking needs. New agent uses defaults and one durable opening. No mandatory onboarding checklist, provider picker on every creation, goal activation toggle, or extra global Agents/Workspace page is implied by this reference.

The standalone [preview](reference.html) deliberately uses sample data and local state. Its content, synthetic avatar geometry, panel arrangement and mobile simplifications are adaptations. It demonstrates the visual grammar; it does not assert pixel identity, backend integration, API readiness or UI acceptance.
