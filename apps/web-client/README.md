# Web client

Shared React + TypeScript application built with Vite, used by the Tauri desktop host and the browser development preview. The active conversation workspace consumes the harness-first API 1.18.0. Its visual and interaction reference is OpenMausBot 0.1.137; the component catalog remains available.

The [existing-feature redesign evidence](../../docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/openmaus-fidelity-2026-11-01/README.md at 043f7c9") maps 19 surfaces to the pinned reference, with 122 passing unique browser cases and retained screenshots. Provider fixtures, real API persistence and managed-browser verification have separate evidence boundaries.

## Development

Use the repository's Bun 1.3.10 workspace and root lockfile:

```sh
bun install --frozen-lockfile
bun run dev:api
# In another terminal:
bun run dev:web-client
```

Vite injects the development installation bearer token on the server side from `.dev/harness-first/installation.json`; credentials are never bundled. Set `NGERTIIN_STATE_DIR` (repository-relative or absolute) and `NGERTIIN_API_URL` for another local development instance. Both dev and preview bridges bind to loopback and reject foreign origins. This is a development bridge, not the deferred production login/installer.

The browser development preview listens on `http://127.0.0.1:3001`. For the native application, use [Tauri setup and development](../../docs/architecture/tauri-development.md).

From the repository root:

```sh
bun run typecheck:web-client
bun run lint:web-client
bun run build:web-client
```

Browser checks own and stop a production-preview server on port 4301:

```sh
cd apps/web-client
bunx playwright install chromium
bun run test:e2e
```

## Design system page

Open `/design-system` for the dedicated documentation page. It includes live theme color values, typography, spacing, radius, elevation, sizing, focus, motion, and an interactive gallery of all 63 installed primitives.

The primitive gallery supports search, category filters, reset, and copyable imports. A component can be linked directly, for example `/design-system?component=button`; the URL and browser history retain the selected preview. The original theme specimen is now at `/theme-preview`. Both that specimen and the conversation workspace share the same theme provider and preference.

Examples are grouped and loaded on demand under `src/features/design-system/examples`. Add a new primitive to `src/lib/component-catalog.ts`, its category in `catalog.ts`, and its category's example set. Browser tests exercise every registered preview in light/dark on desktop/mobile.

Static production hosting must route application URLs such as `/design-system` to `index.html` (SPA fallback). Vite's local dev and production-preview servers already support this.

## Assistant studio

Open `http://127.0.0.1:3001/assistant-studio` after `bun run dev:web-client`. The studio works without a running backend and is also linked from Color Studio and Design System.

The catalog covers Computer activity, agent activity and recovery, group routing, application questions/options/review/approval, files, research sources, Goal/Routine milestones, and rich or streaming answers. Category, condition, and DM/group mode are URL-backed, for example `/assistant-studio?section=input&state=approval&mode=group`. Search, reset, and the existing theme switcher are available.

Previews import the conversation components and shared styles directly. Product replies share the pure `HumanReplyCard` presentation with the persisted conversation flow. Harness-specific question, approval and history demos are not separate Studio categories. Files open in the existing `FileViewer` using local sample data URLs.

All answers, approvals, recovery actions, and receipts in the studio are local examples. They do not dispatch application commands, run agents, or establish provider capabilities. Product questions and approvals use the application abstraction in both DM and group. Normal handoff bars stay hidden, matching the current timeline.

After a confirmed answer, the inline interaction keeps only its question. It has no options, action details, buttons, or saved-answer receipt. Pending HITL does not add a separate waiting bubble. Group assistant messages and cards share the same adjacent agent avatar; DM rows omit it. The Studio follows these presentation rules.

## Conversation verification

```sh
cd apps/web-client
bun run test:conversation
```

These desktop/mobile checks use the real API and isolated temporary SQLite state without native executors. Native browser verification and limitations are recorded in [NMA-061 evidence](../../docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-061/README.md at 043f7c9").

Creation defaults use the configured Tobi connection/model. Configure them in Settings; a missing account/model keeps the new agent and DM available for repair. Pending creation/message operations retain their exact idempotency key and body across reloads. Unknown native outcomes require reconciliation, not a new send.

Create group and contextual Agent/Anggota, File, Goals and Routine panels consume the real API. They include scoped memory/skills, workspace files and artifacts, browser/VNC and Composio access, responsibilities, group membership, native questions and stop/recovery controls. See [NMA-062 evidence](../../docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-062/README.md at 043f7c9"). Test harnesses and external-provider fixtures are distinguished from native acceptance in each evidence cohort.

Settings opens over the mounted conversation; closing it restores the draft and focus. Providers expand inline, while the selected account/provider remains URL-backed. The header and agent profile share one account/model/reasoning popup, with server-discovered choices and explicit billing.

## Components

`src/components/ui` contains all 63 installable UI components returned by **shadcn 4.23.0** `add --all`, using `radix-nova` and Hugeicons. Dependency hooks and syntax-highlighting utilities are installed alongside them. Composition guides such as Data Table, Date Picker, and Typography are documentation patterns rather than additional installable registry files.

```sh
cd apps/web-client
bunx shadcn@4.23.0 add <component>
```

`components.json` selects `hugeicons` for future primitive additions. Product compositions use the source-equivalent Lucide 0.539.0 icons. Existing generic primitives retain their public APIs and icon dependencies. The AI Elements Conversation component adds `use-stick-to-bottom`. Import icons individually so the production bundle includes only used icons.

Default agent avatars reuse the pinned OpenMaus vector renderer and exact installed chrome asset; group avatars stack their actual members. [Renderer provenance](src/components/openmaus-avatar/README.md) records the narrow source port and upgrade boundary.

UI components are owned source files. Do not pass `--overwrite` without reviewing the local Midnight/Daylight theme changes. The component inventory is in `src/lib/component-catalog.ts`; refresh it when adding or removing primitives.

## Themes

See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for source, token mapping, and component adjustments. Theme values live in `src/styles/theme.css`; Tailwind and base accessibility styles live in `src/index.css`.

Light, dark, and system modes use `next-themes` with the `ngertiin-web-client-theme` storage key. A stored choice persists across reloads and tabs; system mode follows live OS changes. When storage is blocked, theme changes still work for the current page. Fonts are bundled locally through Fontsource.

## Upstream references

- [Vite installation](https://vite.dev/guide/)
- [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite)
- [shadcn semantic theming](https://ui.shadcn.com/docs/theming)
- [shadcn CLI](https://ui.shadcn.com/docs/cli)
- [Hugeicons React](https://hugeicons.com/docs/integrations/react/quick-start)

The approved conversation redesign is applied to the existing composer, questions/approvals, supported recovery actions, file chips and research sources. Text-only requests use the main composer; successful replies do not add saved-answer receipts. [Verification, screenshots and the remaining feature gaps](../../docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/conversation-redesign-2026-11-05/README.md at 043f7c9") distinguish UI changes from new runtime work.

The 1.31.0 interaction update adds the Computer category with preparing/live/completed states. Preparing and completed activity use the same card shell without a historical image or viewer. Compact live previews hide upstream viewer controls and recover automatically without a manual reconnect action. The live preview requires the local backend and configured machine; the other local examples still work without them. See [the implementation evidence](../../docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/conversation-implementation-2026-11-06/README.md at 043f7c9") for product-owned DM/group questions, approval gates, failed-response retry, and live viewer proof boundaries.

Only active Computer cards offer Open Computer. Custom answers appear as selectable, editable options. Approval details use an always-visible bounded scroll area with overflow-aware edge shadows. These presenters are shared with conversations; [follow-up verification and screenshots](../../docs/development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/conversation-implementation-2026-11-06/interaction-ui-refinement/README.md at 043f7c9").
