# OpenMausBot source UI/UX and design-system findings

Date: 2026-11-01. Authority: **source-observed** unless explicitly marked recommendation/inference. This report does not establish installed-app/runtime behavior. Selected exact snippets are retained in [evidence/source-excerpts.md](evidence/source-excerpts.md).

## Provenance and boundaries

- Repository: https://github.com/milind-soni/OpenMausBot
- Exact commit: `7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9` (2026-11-01T13:38:48+05:30; “Team bots: Bot access in Settings, and asking the owner to chat (#4062)”). Shallow checkout: `/tmp/ngertiin-openmaus-source-20261101`.
- `package.json`: version `0.1.137`, Node >=24, package manager pnpm 10.33.0. React/React DOM ^19.1.0, Tailwind ^4.1.11, Lucide ^0.539.0, Geist and Geist Mono ^5.3.0, Inter ^5.3.0, React Markdown ^10.1.0, TanStack React Virtual ^3.14.13, Electron ^43.5.0. These are declared ranges, not runtime-loaded versions.
- Static source review used normal repository reads as required by REA for complete source repositories. No target code executed; no dependencies installed. Knowledge-graph tools were unavailable in the tool inventory; `rg`/bounded source reads were the fallback.
- Focus: shell/navigation, chat/composer, settings/profiles, questions/approvals, theme foundations, responsiveness and onboarding. Secondary panels were inventoried where linked, not exhaustively exercised. Tests were read only incidentally; no test results are claimed.
- SHA-256 `src/styles.css`: `ec4392fe0cc74b583f71e345e3f9c2b64ec8b28a367af32df3019e21ee9c9f55`.
- Machine-readable literal skin tokens: [evidence/source-design-tokens.json](evidence/source-design-tokens.json) (11 skins; no cascade/computed-style resolution).
- Installed version/source revision equivalence: **unknown**, to be corroborated by parent investigation. Do not label source-only screens or interactions as live verified.

All file references below are relative to the pinned checkout. Permalink prefix: `https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/`.

## Main design observation

The source implements an agent-first messenger: a persistent agent/group list, a generous centered conversation, a compact avatar/name pill as the profile entry point, and contextual side panels. “Simple” and “Advanced” modes share entities but expose different amounts of control. New installations default to Simple; existing prior-run state may default to Advanced (`src/lib/interface-mode.ts:18–35`). This distinction matters more than copying every settings field.

## Information architecture and screen inventory

| Surface | Entry and contained behavior | Source evidence |
|---|---|---|
| App shell | Chat, groups, team map, files, web panels, Routine/automation list/calendar; plugins, inbox, notifications and profile/settings overlay the current view | `src/App.tsx:134–170,317–443` |
| Sidebar | Search and new-chat controls; bots/groups and thread/folder expansion; unread/working/waiting markers; icon-only density; resize; account/connect-apps footer | `src/components/Sidebar.tsx:170–220,720–909,1257–1345`; `SidebarSimpleTop.tsx:8–69`; `SidebarFooterNav.tsx:104–199` |
| New chat | “To” search, create bot, create group, ranked existing bots. Existing bot opens main chat or creates a task depending on showThreads preference | `SidebarNewChatPanel.tsx:85–122,126–211` |
| DM empty state | Centered 64px avatar, 17px semibold name, 14px purpose/description, 360px description cap | `ChatEmptyState.tsx:7–31` |
| Chat header | A centered whole-pill button with 24px avatar, 14px medium name, optional conversation breadcrumb/privacy glyph/other-activity dot; opens profile panel | `ChatHeadPill.tsx:30–80`; `ChatView.tsx:1010–1031` |
| Conversation | Error/notice banners, unread divider, empty state, tool activity, answers, rich cards; composer dock below | `ChatView.tsx:73–126,1145–1283` |
| Profile panel | Details, Library, Computer tabs; Simple pages for settings, apps, routines, memory, skills, folder, browser, work location | `bot-panel/page-registry.ts:4–62`; `bot-panel/side-panel.ts:5–10` |
| Group profile | Stacked member faces; group description; instructions; members; responder selection; working folder | `room-panel/RoomPanel.tsx:21–38,42–116` |
| Settings | Searchable settings; General/Appearance, AI, Computer, Billing, Updates; Simple disclosure for extra AI choices/API keys/other devices/billing limits | `SettingsModal.tsx:72–107`; `SettingsSimplePages.tsx:38–46,50–208` |
| Themes | System follows Daylight/Midnight; 11 named skins with live subtree skin contexts; interface font independent of skin | `lib/skins.ts:3–43,64–85,103–142`; `styles.css:74–93,1132–1153` |
| Question card | Single choice can answer in one tap; multiple questions use active question tabs; optional free text/multiselect; answered/expired/stopped compact state | `QuestionCard.tsx:43–51,86–156` |
| Tool detail | Human-readable action in Simple, technical name in Advanced; details disclosure with input/output and running/unverified/failed/completed state | `ToolActivity.tsx:13–47` |
| Approvals and receipts | Pending versus allowed/denied/expired/undone/applied receipts; domain-specific routine/profile/model/skill wording | `ApprovalCard.tsx:26–89,92–120` |
| Routine/automation | List and calendar; bot filter after threshold; new action; explanatory empty state; status, needs-you line and enable toggle | `TriggersPage.tsx:25–28,71–136` |
| Global search | Cmd/Ctrl+K; agents, rooms, message results; 150ms message search debounce; arrows/Enter/Escape | `CommandPalette.tsx:31–44,60–76,86–125,149–178` |
| Onboarding | Meet app/connect AI when needed → Chief of Staff introduction over shell → chat; browser-local draft resumes; Escape acts like Later; focus is trapped | `onboarding/WelcomeFlow.tsx:31–50,64–99,107–172` |
| Place unavailable | Plain reason with at most one fitting action; distinct opening/setup/offline/signin/plan/ended/checkout/payment/waking/moving states | `HomeScreen.tsx:24–40,71–116` |

## Reconstructable design tokens

The source defines semantic surface/text/action tokens, not one universal brand color. Do not confuse default `@theme` values with the selected runtime skin.

| Token role | Midnight | Daylight | Meadow |
|---|---|---|---|
| App | #121212 | #fcfcfc | #ffffff |
| Sidebar/panel | #0e0e0e | #f5f5f5 | #f6f8f6 |
| Raised | #202020 | #e4e4e4 | #e9eeea |
| Raised hover | #2c2c2c | #d8d8d8 | #d6efdf |
| Card | #1f1f1f | #f0f0f0 | #f1f5f2 |
| Composer | #1f1f1f | #ffffff | #ffffff |
| Menu | #1f1f1f | #ffffff | #ffffff |
| Primary ink | #f5f5f5 | #1c1c1c | #0f1a13 |
| Secondary ink | #f5f5f5a8 | #555555 | #3e4a42 |
| Tertiary ink | #f5f5f591 | #5c5c5c | #4f5c54 |
| Accent | #1084fe | #0b62c4 | #1a7a48 |
| Focus | #459ffe | #0b62c4 | #1a7a48 |
| User bubble | #5a5a5a | #070707 | #e1e9e3 |
| Hairline | #383838 | #d0d0d0 | #c9d3cc |
| Success | #38d591 | #1f7a4d | #1a7a48 |
| Danger | #ff5667 | #c02b3a | #c02b3a |
| Warning | #ff9800 | #8a5a00 | #8a5a00 |

Evidence: `styles.css:142–193,262–320,720–844`. Eleven skin IDs: Midnight, Atelier, Foundry, Lagoon, Graphite, Linen, Dusk, Daylight, Meadow, Pop, Halloween (`lib/skins.ts:3–35`). Meadow is explicitly described by source comments as the MausBot brand look; the default selection follows the system, not Meadow.

### Typography, sizes and layout

- Default UI font: Geist Variable → native system fallback; code: Geist Mono Variable → SF Mono/Menlo/Consolas. Inter is bundled; optional System/Inter/Poppins/Serif override. Poppins uses a local system font, not an imported bundled font (`styles.css:1–4,189–193,1132–1153`; `lib/fonts.ts:1–6`).
- Role scale in reviewed components: 11–12px metadata, 13px secondary/control, 14px primary row/header, 15px some list titles, 17px empty state, 18px workspace titles, 20px unavailable-place title. Avoid treating these as a formally enumerated typography token scale; they are component literals.
- Default chat column cap 60rem, prose 44rem, bubbles min(35rem,80%); card width 88%. Wide: column 80rem, prose/bubbles 64rem, 92% bubble/94% card. Full: column/prose/bubble cap 100%, 96% bubble/card. Composer dock cap adds 2.5rem to align 20px horizontal padding (`styles.css:207–230,1618–1627`).
- Sidebar default class widths 280px Simple / 320px Advanced; persisted widths are resizable, minimum 240, default clamp maximum 480 and viewport minus 320px; icon-only 80px or 92px when rail (`Sidebar.tsx:1257–1262`; `lib/sidebar-preferences.ts:171–183`). Actual runtime width requires measurement.
- Bot simple row: desktop height 54px, 10px radius, 14px medium name/20px line, 13px preview/18px line. Status marks attach to avatar instead of occupying an extra textual column (`Sidebar.tsx:720–839`).
- Simple profile panel 320px; advanced panel min(420px,42vw); on phone full-screen absolute sheet (`bot-panel/side-panel.ts:5–10`).
- Simple Settings desktop modal min(900px,100%) wide × min(700px,100%) high; 12px radius; viewport padding 48px 16px (`styles.css:1494–1502`).
- Global command palette max 560px width; max min(480px,70vh) height, positioned 14vh down (`CommandPalette.tsx:149–159`).
- Simple composer: 8px padding, 0.5px subtle ring, single-line radius 22px / multiline 18px, 28px round auxiliary controls, textarea max-height 9rem. Hover/focus adjusts shell ring rather than putting a rectangular focus outline inside the textarea (`composer-simple.ts:6–10`; `Composer.tsx:783–803,937`; `styles.css:1657–1666`).
- Chat header pill: 7.5px top/bottom/left padding, 13.5px right, 8px gap, 24px avatar; approximate total height 39px before computed metrics (`ChatHeadPill.tsx:59–62`).
- Generic buttons: default min-height 32px, font 13/20px weight 500, padding 4px 12px, semantic control background and hairline border; dense 28px and 24px variants; large 36px; pill radius full. Simple settings override buttons to 32px high, 14px regular, no border, black/white primary (`styles.css:1171–1237`; `SettingsPrimitives.tsx:7–12`).
- Menu: 14px root radius, 6px padding, 4px gap, hairline/50 border, shadow-lg; row min-height 30px and 14/18px; touch menu rows 40px (`styles.css:215`; `menu-recipe.ts:1–18`).
- Thin Lucide strokes: menu recipe 1.5; typical controls 1.5–1.75; icons generally 13–20px (`menu-recipe.ts:1,34`; `SidebarSimpleTop.tsx:38`; `Composer.tsx:973,991`).
- Spacing is mostly a 4px Tailwind base with 2px subdivisions plus explicit optical corrections (7.5px/13.5px pill padding). This is inferred from repeated classes, not an explicit authored spacing system.

### Elevation and motion

- Conversation cards are flat elevated fills with a 0.5px ink/10 ring. The reusable elevated control uses bg-composer and an inset ink/7 ring. Hover color mixes in 7% ink with 120ms color transition (`elevated.ts:1–9`).
- Generic shadows: lg `0 6px 16px -8px rgba(0,0,0,.18),0 1px 3px rgba(0,0,0,.06)`; xl and 2xl increase reach but stay soft. Floating shadow default is zero; Daylight supplies soft floating shadow (`styles.css:195–197,249,782`).
- Common easing cubic-bezier(.22,1,.36,1); panel 240ms, sheet 260ms, workspace/message 180ms, popup 200ms; color changes 120ms. Onboarding has separate 320ms rise and longer staged motion (`styles.css:114–140`).
- Glass bars can use 24px backdrop blur + 180% saturation, surface tint 55%, a fading edge; reduced-transparency and forced-colors replace the blur with opaque surfaces (`styles.css:1505–1542,1629–1642`). Some skins/settings explicitly remove glass. Use selected-screen evidence before copying blur.

## Key interaction contracts to carry into reconstruction

1. **Identity → conversation → profile.** Select a persistent agent; avatar/name pill reveals its profile in-place. Secondary tabs/details live beside the conversation. Preserve context when closing panel.
2. **Readable default, detail on demand.** Simple mode gives tools human action labels and collapsed detail; Advanced uses tool names/monospace. Technical request/response appears only after expanding the tool (`ToolActivity.tsx:13–47`).
3. **Keep composing while work continues.** The source supports queue/edit/cancel and capability-dependent steering. The input is not disabled during attachment upload to preserve focus; sending refuses while upload pending. Send button words explain queue or steer; a separate stop action appears while busy (`Composer.tsx:411–479,529–534,925–991`; `composer-simple.ts:74–85`). Native run completion/stop semantics still require runtime corroboration.
4. **A reply with choices is still conversation.** Single question choices can submit immediately; multi-question/multiselect gathers all answers before dispatch, returns focus to composer, and collapses settled cards (`QuestionCard.tsx:107–156`).
5. **Receipts stay readable.** Allowed/denied/expired/undone/applied states are represented separately, with domain wording rather than a forever-pending card (`ApprovalCard.tsx:74–89`). Copy rendering patterns only; approval policy is a Ngertiin product decision.
6. **Keyboard-first optional acceleration.** Cmd/Ctrl+K search; arrows and Enter choose; Escape dismisses. Enter sends by default except Japanese locale defaults to mod+Enter; user can choose Enter/Shift+Enter/mod+Enter; IME composition guards apply (`CommandPalette.tsx:31–44,111–125`; `lib/send-key.ts:8–35`).
7. **Concrete recovery action.** Offline/sign-in/payment etc. get one state-appropriate action with a reason rather than indefinite generic loading (`HomeScreen.tsx:24–40,71–116`).

## Responsive and accessibility contracts observed in source

- <=767.98px: phone full-screen bot list; >=768 sidebar inline; >=1280 sidebar+one side panel; >=1536 two side panels fit (`lib/use-media-query.ts:16–24`; shell collapse logic `App.tsx:92–94,150–151`).
- Touch-revealed actions pair hover with `touch:`; `@custom-variant touch` applies on hover:none or pointer:coarse (`styles.css:6–15`).
- Coarse-pointer mention textarea 16px to prevent Safari zoom; safe-area padding around root (`styles.css:63–67,1124–1129`).
- Focus-visible uses semantic focus token, 2px outline/offset; menu focus maps to hover fill; text input focus repaints border instead (`styles.css:1645–1670`).
- Settings switch uses role=switch and aria-checked; dialogs expose aria-modal; profile pill exposes aria-expanded/controls. Source observations do not constitute a full accessibility audit.
- Reduced motion rules exist, but this pass did not trace every custom Web Animations call or confirm complete preference coverage. Contrast comments and check script exist; they are **not** a passing result from this investigation.

## Adaptation recommendations for Ngertiin (analyst choices, not upstream facts)

- Reuse the shell proportions, centered column, pill header, contextual profile panel, semantic token names, low-noise typography and compact menus as a coherent visual baseline.
- Use Ngertiin brand/identity and Tobi; do not import MausBot mascot/logo or upstream Chief-of-Staff copy as Ngertiin identity.
- Keep automatic goals and Routine language required by Ngertiin. The upstream composer exposes a goal toggle in `ComposerPlusMenu.tsx:29–60`; this is an observed upstream control, **not** a suitable mandatory Ngertiin activation step.
- Bind busy/queue/stop/capabilities/receipts to authoritative Ngertiin API state. Do not infer supported native adapters from controls or import a parallel lifecycle engine.
- Limit provider/account UI to required Codex/ChatGPT and Muse Code paths. Source lists many other provider settings; source availability does not expand Ngertiin scope.
- Browser panel may be a useful side-panel reference, but upstream general computer/Android/phone/organization/cloud billing features remain outside current Ngertiin commitments unless explicitly approved.
- Prefer a small core design system (dark/light, semantic surfaces, controls, cards, menus, typography) first; 11 theme skins, font choices and advanced customizations are an upstream inventory, not an obligation to reproduce.

## Plain New bot versus reviewed templates

The sidebar New bot action dispatches `newBot` directly (`Sidebar.tsx:1189–1196`). `makeNewBot` creates from defaults immediately, selects a free suggested name, adds the bot and opens its chat (`lib/new-bot.ts:50–83`). This is a mutating action. It is different from `NewBotDialog`, whose source documents defaults editing or review of a ready-made template (`NewBotDialog.tsx:44–49`). The template/default dialog has Identity, Soul, Skills, Memory, Routines, Access, Model, Permissions, Voice/alerts sections (Model hidden in Simple), explicit Create, disabled invalid/saving state, and a local-auto consent warning when applicable (`NewBotDialog.tsx:36–41,69,112–134,152–210`). The plain New bot action is not safe to click merely to inspect a draft. No creation or inference was executed in this source review.

## Coverage result

Answered from source: core layout, hierarchy, design tokens, typography, dimensions, responsive rules, navigation entry points, major UI states and interaction code. Partially answered: rich asset/file/browser rendering, complete Routine/calendar details, all settings subpages and dynamic visibility. Unresolved here: installed package revision parity, computed rendering/measurements, visual screenshots, end-to-end behavior under live providers, all error states, animation feel, accessibility/contrast test outcomes. Parent should combine this report with shipped artifact and live UI evidence before describing the reconstruction reference as runtime-verified.
