# Web client

Shared React + TypeScript application built with Vite, used by the Tauri desktop host and the browser development preview. The active conversation workspace consumes the harness-first API 1.18.0. Its visual and interaction reference is OpenMausBot 0.1.137; the component catalog remains available.

The [existing-feature redesign evidence](../../docs/verification/openmaus-fidelity-2026-11-01/README.md) maps 19 surfaces to the pinned reference, with 122 passing unique browser cases and retained screenshots. Provider fixtures, real API persistence and managed-browser verification have separate evidence boundaries.

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

## Conversation verification

```sh
cd apps/web-client
bun run test:conversation
```

These desktop/mobile checks use the real API and isolated temporary SQLite state without native executors. Native browser verification and limitations are recorded in [NMA-061 evidence](../../docs/verification/nma-061/README.md).

Creation defaults use the configured Tobi connection/model. Configure them in Settings; a missing account/model keeps the new agent and DM available for repair. Pending creation/message operations retain their exact idempotency key and body across reloads. Unknown native outcomes require reconciliation, not a new send.

Create group and contextual Agent/Anggota, File, Goals and Routine panels consume the real API. They include scoped memory/skills, workspace files and artifacts, browser/VNC and Composio access, responsibilities, group membership, native questions and stop/recovery controls. See [NMA-062 evidence](../../docs/verification/nma-062/README.md). Test harnesses and external-provider fixtures are distinguished from native acceptance in each evidence cohort.

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
