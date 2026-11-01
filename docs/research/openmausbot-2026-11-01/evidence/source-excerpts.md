# Retained OpenMausBot source excerpts

Repository: https://github.com/milind-soni/OpenMausBot

Commit: `7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`; package 0.1.137. Static source only; these excerpts do not prove runtime behavior. Line numbers refer to exact checkout files. Files were not executed. See [source findings](../source-findings.md) for broader file/line references and [literal skin tokens](source-design-tokens.json) for complete Daylight/Meadow and other skin property blocks. Each SHA-256 below describes the whole source file, not its excerpt.

## src/styles.css

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/styles.css#L142) · SHA-256: `ec4392fe0cc74b583f71e345e3f9c2b64ec8b28a367af32df3019e21ee9c9f55`

```text
  142:   /* Defaults = Midnight. Kept here so the app is never unstyled. */
  143:   --color-app: #121212;
  144:   --color-panel: #0e0e0e;
  145:   --color-raised: #202020;
  146:   --color-raised-hover: #2c2c2c;
  ...: omitted intervening source
  169:   --color-ink: #f5f5f5;
  170:   --color-ink-secondary: #f5f5f5a8;
  171:   /* quiet text: timestamps, hints, placeholders, calendar hours. It used to
  172:      be `text-ink-secondary/70`, which fades an ink already tuned close to
  173:      AA and landed at 2.2–4:1. Each skin sets this to the quietest ink that
  174:      still clears 4.5:1 on every text surface, raised-hover included; on the
  175:      light skins that leaves little room below the secondary ink, so there
  176:      size carries the hierarchy. Measured by pnpm check:contrast. */
  177:   --color-ink-tertiary: #f5f5f591;
  178:   --color-accent: #1084fe;
  179:   --color-accent-border: #459ffe;
  180:   /* the ring a keyboard user follows; sits on the accent so focus reads as
  181:      "the app is talking to you", not as a browser default */
  182:   --color-focus: #459ffe;
  183:   --color-accent-text: #7fc0ff;
  184:   --color-bubble-user: #5a5a5a;
  185:   --color-success: #38d591;
  186:   --color-danger: #ff5667;
  187:   --color-warning: #ff9800;
  188: 
  189:   --font-sans: "Geist Variable", -apple-system, BlinkMacSystemFont,
  190:     "Segoe UI", system-ui, sans-serif;
  191:   /* Some engines map `ui-monospace` to a proportional face, so concrete names come first. */
  192:   --font-mono: "Geist Mono Variable", "SF Mono", SFMono-Regular, ui-monospace, Menlo,
  193:     Consolas, "Liberation Mono", monospace;
  ...: omitted intervening source
  207: :root {
  208:   --chat-bubble-max: 35rem;
  209:   --chat-bubble-pct: 80%;
  210:   --chat-card-pct: 88%;
  211:   --chat-prose-max: 44rem;
  212:   /* .chat-column: fills a narrow pane, then stops at this width and centers, so wider windows only grow the gutters. */
  213:   --chat-column-max: 60rem;
  214:   /* Menus; a phone rounds them like its sheets. */
  215:   --radius-menu: 14px;
  216: }
  ...: omitted intervening source
 1494: @media (min-width: 768px) {
 1495:   .glass-popup-frame[data-settings-sheet][data-settings-look="simple"] {
 1496:     padding: 48px 16px;
 1497:   }
 1498:   .glass-popup-frame[data-settings-sheet][data-settings-look="simple"] > .glass-popup {
 1499:     width: min(900px, 100%);
 1500:     height: min(700px, 100%);
 1501:     border-radius: 12px;
 1502:   }
  ...: omitted intervening source
 1621: .chat-column {
 1622:   margin-inline: auto;
 1623:   max-width: var(--chat-column-max);
 1624: }
 1625: .chat-column-dock {
 1626:   margin-inline: auto;
 1627:   max-width: calc(var(--chat-column-max) + 2.5rem);
```

## src/lib/skins.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/lib/skins.ts#L38) · SHA-256: `f0c21b83c8e3a7c51a38dd915e0a9188c4e6f38774c15c8f1154005524214935`

```text
   38: /** "system" follows the OS between the light and dark skins below; anything else pins one skin. */
   39: export type SkinChoice = SkinId | "system";
   40: export const THEME_SKINS = { light: "daylight", dark: "midnight" } as const satisfies Record<"light" | "dark", SkinId>;
   41: 
   42: export const DEFAULT_SKIN_CHOICE: SkinChoice = "system";
   43: export const PRIOR_INSTALL_SKIN: SkinId = "midnight";
  ...: omitted intervening source
   78: export function readSkinChoice(): SkinChoice {
   79:   try {
   80:     const store = getStore();
   81:     const stored = store?.getItem(KEY);
   82:     if (isSkinChoice(stored)) return stored;
   83:     return hasPriorRun(store) ? PRIOR_INSTALL_SKIN : DEFAULT_SKIN_CHOICE;
   84:   } catch {
   85:     return PRIOR_INSTALL_SKIN;
```

## src/lib/interface-mode.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/lib/interface-mode.ts#L18) · SHA-256: `1a176ea16ad79e1e409991ec09d104ea7785d37ad1c767b6dee5e12cb7d5917e`

```text
   18: export function readAdvancedMode(): boolean {
   19:   if (sessionChoice !== undefined) return sessionChoice;
   20:   try {
   21:     const store = storage();
   22:     const stored = store?.getItem(ADVANCED_MODE_KEY);
   23:     if (stored === "1") return true;
   24:     if (stored === "0") return false;
   25:     return hasPriorRun(store);
   26:   } catch {
   27:     return false;
   28:   }
```

## src/lib/use-media-query.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/lib/use-media-query.ts#L16) · SHA-256: `6973a65abed3700f7b111b93c50251f900e2d5b104fafa271813c3d42dca8b4b`

```text
   16: export const TWO_SIDE_PANELS_FIT = "(min-width: 1536px)";
   17: 
   18: export const SIDEBAR_AND_PANEL_FIT = "(min-width: 1280px)";
   19: 
   20: /** Tailwind's md breakpoint. */
   21: export const SIDEBAR_INLINE = "(min-width: 768px)";
   22: 
   23: /** Below Tailwind's md breakpoint: the phone layout, where the sidebar is a full-screen bot list. */
   24: export const PHONE_LAYOUT = "(max-width: 767.98px)";
```

## src/components/Sidebar.tsx

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/components/Sidebar.tsx#L1189) · SHA-256: `7a2ab1edb836f35830955d5321f852820c2b65f05f2ad1aafc90bb4668616b90`

```text
 1189:           <button
 1190:             onClick={() => { setPlusOpen(false); dispatch({ type: "newBot" }); }}
 1191:             role="menuitem"
 1192:             className={plusItem}
 1193:           >
 1194:             <BotIcon size={16} className="text-ink-secondary" />
 1195:             <span className="flex-1">{advanced ? t("sidebar.newBot") : t("sidebar.newBotSimple")}</span>
 1196:             {advanced && <ShortcutHint id="new-bot" />}
  ...: omitted intervening source
 1257:       style={{ "--sidebar-width": `${sizing.width}px` } as CSSProperties}
 1258:       className={cn(
 1259:         "relative flex h-full shrink-0 flex-col border-r border-ink/[0.04] bg-panel max-md:[--scroll-fade-surface:var(--color-app)]",
 1260:         sizing.resizing && !sizing.snapping ? "transition-none" : "transition-[width] duration-200 motion-reduce:transition-none",
 1261:         density === "icons" ? rail ? "w-[92px]" : "w-[80px]" : advanced ? "w-[320px] md:w-[var(--sidebar-width)]" : "w-[280px] md:w-[var(--sidebar-width)]",
 1262:         sidePanelOpen ? advanced ? "md:max-w-[320px]" : "md:max-w-[280px]" : "md:max-w-[calc(100vw-320px)]",
```

## src/lib/new-bot.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/lib/new-bot.ts#L50) · SHA-256: `c31397c8ebd9298171866b5e8eca8eeec09e47545ba0208318cd3ae6cec845a6`

```text
   50: async function createNewBot(section: string | undefined, bots: readonly Bot[], team: TeamPeople | null, request: typeof api) {
   51:   if (typeof window !== "undefined" && window.ogb?.remoteClient?.active) {
   52:     const { bot } = await request<{ bot: Bot }>("/api/bots", { method: "POST", body: JSON.stringify(section === undefined ? {} : { section }) });
   53:     return { bot, warnings: [] as string[], startsOnAsk: false };
   54:   }
   55:   const template = startingTemplate(await request<BotDefaultsAnswer>("/api/bot-defaults"), true);
   56:   template.profile.name = freeName(template.profile.name!, bots);
   57:   if (section !== undefined) template.profile.section = section;
   58:   const draft = new BotCreationDraft(template, () => {}, request);
   59:   const startsOnAsk = draft.bot.approvalMode === "auto" && draft.bot.computer === "local";
   60:   if (startsOnAsk) draft.patch({ approvalMode: "ask" });
   61:   const reportsTo = team ? reportsToFor(null, draft.bot.section, bots, team) ?? undefined : undefined;
   62:   try {
   63:     return { ...await createConfiguredBot(draft, request, undefined, undefined, undefined, reportsTo), startsOnAsk };
   64:   } finally {
  ...: omitted intervening source
   69: /** New bot: a bot made at once from the New bot defaults, with its chat open and ready for the first message. */
   70: export async function makeNewBot(action: Extract<Action, { type: "newBot" }>, bots: readonly Bot[], dispatch: (action: Action) => void,
   71:   showThreads: boolean, request: typeof api = api): Promise<void> {
   72:   let made: Awaited<ReturnType<typeof createNewBot>>;
   73:   try {
   74:     made = await createNewBot(action.section, bots, currentTeamPeople(), request);
   75:   } catch (cause) {
   76:     const message = t("newBot.failed", { error: cause instanceof Error ? cause.message : String(cause) });
   77:     if (action.onError) action.onError(message);
   78:     else dispatch({ type: "error", message });
   79:     return;
   80:   }
   81:   announceNewBot(dispatch, made.bot, made.warnings, { preserveSelection: action.preserveSelection, showThreads, source: "blank" });
   82:   if (made.startsOnAsk) dispatch({ type: "notice", notice: { kind: "note", botName: null, text: t("newBot.startsOnAsk", { name: made.bot.name }) } });
   83:   action.onCreated?.(made.bot);
```

## src/components/bot-panel/side-panel.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/components/bot-panel/side-panel.ts#L3) · SHA-256: `fcff6915b453794a9da803631a8f566d757fcdf66a197bf2903f569a6437ac93`

```text
    3: export const BOT_PANEL_ID = "bot-panel";
    4: 
    5: export const sidePanelCls = (overlay: boolean, simple = false) => cn(
    6:   "animate-sheet-in md:animate-panel-in absolute inset-0 z-40 flex h-full min-w-0 flex-col outline-none focus-visible:outline-none",
    7:   simple && !overlay ? "border-l-[0.5px] border-ink/[0.06] bg-app" : "border-l border-hairline/40 bg-panel",
    8:   overlay
    9:     ? cn("md:inset-auto md:right-0 md:top-0 md:bottom-0 md:shadow-2xl", simple ? "md:w-[320px]" : "md:w-[min(420px,42vw)]")
   10:     : cn("md:static md:z-auto md:shrink-0", simple ? "md:w-[320px]" : "md:w-[min(420px,42vw)]"),
   11: );
```

## src/components/bot-panel/page-registry.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/components/bot-panel/page-registry.ts#L4) · SHA-256: `e7fddd25fc08daf534c4caf59ad011c54ef3ca7bf026793848297aa949f80154`

```text
    4: export const PANEL_TABS = ["details", "library", "computer"] as const;
    5: export type PanelTab = (typeof PANEL_TABS)[number];
    6: 
    7: export const TAB_LABEL: Record<PanelTab, LocaleKey> = {
    8:   details: "botPanel.tab.details",
    9:   library: "botPanel.tab.library",
   10:   computer: "botPanel.tab.computer",
  ...: omitted intervening source
   21: /** The pages Simple mode draws; a link to any other page lands where its section does. */
   22: export const SIMPLE_PAGES = ["settings", "apps", "routines", "memory", "skills", "folder", "browser", "where"] as const satisfies readonly PageId[];
   23: export type SimplePageId = (typeof SIMPLE_PAGES)[number];
```

## src/components/ChatHeadPill.tsx

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/components/ChatHeadPill.tsx#L59) · SHA-256: `cfd2eefd028978948359e5c6c22fe1a5b764ede04aa07914d8f0eeb777dffe2f`

```text
   59:       className={cn("group flex min-w-0 max-w-full items-center gap-2 rounded-full py-[7.5px] pl-[7.5px] pr-[13.5px] text-ink", ELEVATED_FLOAT, ELEVATED_HOVER)}
   60:     >
   61:       <BotAvatar bot={bot} size={24} {...avatar} />
   62:       <span dir="auto" className="min-w-0 truncate text-[14px] font-medium leading-5">{bot.name}</span>
```

## src/components/composer-simple.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/components/composer-simple.ts#L6) · SHA-256: `8387f24a6871827ed632cdd3eb6f39688fd19c9a2c47d9a1a01ba36008b66394`

```text
    6: /** Simple mode's composer pill on a wider screen: the field, the mic and the round button in one shell. */
    7: export const SIMPLE_COMPOSER = "bg-composer p-2 ring-[0.5px] ring-ink/10 hover:ring-ink/[0.22] focus-within:ring-ink/[0.22] shadow-[0_2px_8px_-1px_rgb(0_0_0/0.05),0_1px_2px_rgb(0_0_0/0.03),0_0_0_1px_rgb(228_228_228/0.04)] [transition:border-radius_300ms,box-shadow_150ms]";
    8: 
    9: /** Simple mode's small round controls in the composer: the +, the mic and Stop beside the round button. */
   10: export const SIMPLE_CONTROL = "size-7 rounded-full bg-ink/[0.05] ring-[0.5px] ring-inset ring-ink/[0.07] text-ink-tertiary hover:bg-ink/[0.09] hover:text-ink";
```

## src/components/menu-recipe.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/components/menu-recipe.ts#L1) · SHA-256: `22d07e8609d4c09193db575b3a629bf3adac639ae31479d448d89837c5a998f1`

```text
    1: export const MENU_SHEET = "popover-surface flex flex-col gap-1 rounded-[var(--radius-menu)] border border-hairline/50 bg-menu p-1.5 shadow-lg [&_svg.lucide]:stroke-[1.5]";
    2: 
    3: export const MENU_ITEM = "flex min-h-[30px] w-full shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-left text-[14px] leading-[18px] focus-visible:bg-menu-hover";
    4: 
    5: export const MENU_ITEM_SEPARATOR = "mx-1.5 h-px shrink-0 bg-hairline/50";
    6: 
    7: export const MENU_HEADING = "px-2 pb-1 pt-2 text-[12px] font-medium leading-4 text-ink-secondary";
    8: 
    9: export const MENU_ROW =
   10:   "group flex h-[30px] w-full min-w-0 shrink-0 items-center gap-2 rounded-md px-2 text-left text-[13px] leading-[18px] text-ink hover:bg-ink/[0.06] focus:bg-ink/[0.06] active:bg-ink/[0.08] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent touch:h-10";
   11: 
   12: /** Simple mode's rows pair a model name with a second line, so they grow with it instead of clipping at 30px. */
   13: export const SIMPLE_MENU_ROW =
   14:   "group flex min-h-[30px] w-full min-w-0 shrink-0 items-center gap-2 rounded-md px-2 py-1 text-left text-[13px] leading-[18px] text-ink hover:bg-ink/[0.06] focus:bg-ink/[0.06] active:bg-ink/[0.08] disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent touch:min-h-10";
```

## src/lib/sidebar-preferences.ts

[Immutable source](https://github.com/milind-soni/OpenMausBot/blob/7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9/src/lib/sidebar-preferences.ts#L171) · SHA-256: `55790aeb8cd35f5818ff3e36ae532d82677ab6d38aa00c12e5925ff7980d272e`

```text
  171: export const SIDEBAR_MIN_WIDTH = 240;
  172: 
  173: export function clampSidebarWidth(width: number, viewportWidth: number, max = 480): number {
  174:   return Math.max(SIDEBAR_MIN_WIDTH, Math.min(max, viewportWidth - 320, Math.round(width)));
  175: }
  176: 
  177: export function loadSidebarWidth(storage?: Pick<Storage, "getItem"> | null, key = SIDEBAR_WIDTH_KEY): number | null {
  178:   try {
  179:     const target = storage === undefined ? (globalThis.localStorage ?? null) : storage;
  180:     const raw = target?.getItem(key);
  181:     if (raw === null || raw === undefined || !/^\d+$/.test(raw)) return null;
  182:     const width = Number(raw);
  183:     return width >= SIDEBAR_MIN_WIDTH && width <= 480 ? width : null;
```
