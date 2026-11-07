/** Explicit baseline refresh. Review its diff; never run it during ordinary startup. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { repository } from "./cargo";

const output = resolve(repository, "apps/desktop-rs/verification/reference-v1");
await mkdir(output, { recursive: true });
const revision = await new Response(
  Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: repository, stdout: "pipe" }).stdout,
).text();
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const roots = ["apps/web-client/src", "packages/avatar/src", "apps/desktop/src-tauri/src"];
const sources: Record<string, string> = {};
const controls = new Map<string, Set<string>>();
const fileList: string[] = [];
for (const root of roots)
  for await (const name of new Bun.Glob("**/*").scan({
    cwd: resolve(repository, root),
    onlyFiles: true,
  }))
    fileList.push(`${root}/${name}`);
fileList.push(
  "apps/web-client/package.json",
  "apps/web-client/build/file-icons.ts",
  "apps/desktop/src-tauri/Cargo.lock",
  "apps/desktop/src-tauri/tauri.conf.json",
  "bun.lock",
  "docs/contracts/1.31.0.json",
);
const reachable = new Set<string>();
async function visit(file: string) {
  if (reachable.has(file)) return;
  reachable.add(file);
  const source = await readFile(resolve(repository, file), "utf8");
  for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
    const specifier = match[1];
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) continue;
    const base = specifier.startsWith("@/")
      ? resolve(repository, "apps/web-client/src", specifier.slice(2))
      : resolve(repository, dirname(file), specifier);
    for (const suffix of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
      const candidate = base + suffix;
      if (await Bun.file(candidate).exists()) {
        await visit(candidate.slice(repository.length + 1));
        break;
      }
    }
  }
}
await visit("apps/web-client/src/app/workspace-layout.tsx");
await visit("apps/web-client/src/components/ui/sonner.tsx");
for (const file of fileList.sort()) {
  const bytes = await readFile(resolve(repository, file));
  sources[file] = hash(bytes);
  if (file.startsWith("apps/web-client/src/") && /\.[tj]sx?$/.test(file)) {
    for (const match of bytes
      .toString()
      .matchAll(/from\s+["'][^"']*components\/ui\/([^"']+)["']/g)) {
      const name = match[1];
      if (!/^[a-z][a-z-]*$/.test(name)) continue;
      const consumers = controls.get(name) ?? new Set<string>();
      consumers.add(file);
      controls.set(name, consumers);
    }
  }
}
const mapping: Record<string, string> = {
  button: "ui/controls::button + GPUI Base keyboard/focus",
  checkbox: "GPUI Checkbox",
  switch: "GPUI Switch",
  "radio-group": "GPUI RadioGroup",
  input: "GPUI Input/InputState",
  textarea: "GPUI Textarea/TextareaState",
  select: "GPUI Select/SelectState",
  combobox: "GPUI Select with search",
  dialog: "WindowExt native GPUI dialog",
  "alert-dialog": "WindowExt dialog with explicit callbacks",
  "dropdown-menu": "DropdownButton/PopupMenu",
  "context-menu": "ContextMenu",
  popover: "Popover",
  tooltip: "Button tooltip/native GPUI tooltip",
  tabs: "GPUI TabBar/Tab",
  slider: "GPUI Slider/SliderState",
  "scroll-area": "GPUI scroll handles/overflow",
  resizable: "GPUI resizable panel group",
  separator: "Native GPUI border/Div",
  skeleton: "Native placeholder + visibility-aware motion",
  badge: "Stateless native badge",
  label: "Native field label/accessible name",
  card: "ui/controls::card",
  progress: "Native bounded progress",
  spinner: "Native loading indicator",
  empty: "ui/controls::state",
  "native-select": "GPUI Select",
  sheet: "Native GPUI dialog/panel at compact width",
  sonner: "Native notification layer",
  table: "GPUI virtual list + typed table model",
  accordion: "Controlled native disclosure",
  collapsible: "Controlled native disclosure",
  command: "GPUI searchable list",
  avatar: "ngertiin-avatar + GPUI adapter",
  field: "Native field label/help/error composition",
};
const product = [...controls]
  .map(([name, consumers]) => {
    const owners = [...consumers].filter((f) => reachable.has(f) && !/components\/ui/.test(f));
    return {
      name,
      classification: owners.length ? "product-used" : "catalog-only-or-transitive",
      consumers: [...consumers].sort(),
      product_owners: owners.sort(),
      native_path: mapping[name] ?? "Native compound widget; inspect source owner before porting",
      verification: "Not yet fully verified; see NMA-066 report",
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));
const surface = (id: string, owner: string, states: string[], amendments: string[] = []) => ({
  id,
  source_owner: owner,
  states,
  amendments,
  capture_id: `reference-v1.${id}.{state}.{theme}.{width}x{height}@{scale}`,
  status: "capture matrix open",
});
const component = "apps/web-client/src/features/conversation/components/";
const shared = ["default", "long-text", "overflow", "keyboard-focus"];
const asyncStates = [...shared, "loading", "empty", "error", "retry"];
const surfaces = [
  surface("workspace", "apps/web-client/src/app/workspace-layout.tsx", [
    ...shared,
    "panel-closed",
    "panel-open",
    "compact-sheet",
    "resize",
  ]),
  surface(
    "sidebar",
    `${component}conversation-list.tsx`,
    [...asyncStates, "group", "unread", "portrait-pending", "portrait-failed"],
    ["sidebar-loading-2026-11-07"],
  ),
  surface("creation", `${component}navigation.tsx`, [
    "plus-menu",
    "create-agent",
    "create-group",
    "invalid-member",
    "opening-failed",
  ]),
  surface("messages", `${component}answer.tsx`, [
    ...asyncStates,
    "user",
    "assistant",
    "stream-follow",
    "stream-reading-history",
    "joined-bubbles",
  ]),
  surface(
    "chronology",
    `${component}conversation-date.tsx`,
    ["day-boundary", "local-clock", "history-overlap", "retained-request-clock"],
    ["conversation-chronology-2026-11-07"],
  ),
  surface("activity", `${component}agent-activity-bubble.tsx`, [
    "thinking",
    "working",
    "question",
    "failed",
    "reduced-motion",
  ]),
  surface("interactions", `${component}native-interactions.tsx`, [
    "question",
    "multiple-choice",
    "approval",
    "submitted",
    "expired",
    "resolved",
    "retry",
  ]),
  surface("queue", `${component}queued-messages.tsx`, [
    "waiting",
    "edit",
    "delete",
    "steer",
    "cancel-requested",
    "stopped",
    "unknown",
  ]),
  surface("composer", `${component}composer-input.tsx`, [
    ...shared,
    "multiline",
    "ime",
    "token",
    "selection",
    "clipboard",
    "attachment",
    "upload-failed",
    "submit-pending",
    "exact-retry",
  ]),
  surface("avatar", "apps/web-client/src/features/avatar/engine/render.ts", [
    "recipe-shapes",
    "colors",
    "faces",
    "gaze",
    "blink",
    "idle",
    "listening",
    "thinking",
    "working",
    "loading",
    "hidden",
    "reduced-motion",
  ]),
  surface("detail", `${component}context-panel.tsx`, [
    ...asyncStates,
    "agent",
    "group-members",
    "member-profile",
    "back",
  ]),
  surface("goals", `${component}responsibilities.tsx`, [
    ...asyncStates,
    "progress",
    "blocked",
    "completed",
    "pause",
    "stop",
    "group-owner",
  ]),
  surface("routine", `${component}responsibilities.tsx`, [
    ...asyncStates,
    "one-shot",
    "recurring",
    "time-zone",
    "next-run",
    "pause",
    "stop",
    "group-target",
  ]),
  surface("library", `${component}files-panel.tsx`, [
    ...asyncStates,
    "saved-result",
    "scope",
    "sharing",
    "download",
  ]),
  surface("memory", `${component}library-memory.tsx`, [
    ...asyncStates,
    "read",
    "edit",
    "delete",
    "conflict",
  ]),
  surface("skills", `${component}context-panel.tsx`, [
    ...asyncStates,
    "harness-owned",
    "app-owned",
    "repair",
  ]),
  surface("apps", `${component}app-connections.tsx`, [
    ...asyncStates,
    "authorize",
    "expired",
    "assignment",
  ]),
  surface("settings", "apps/web-client/src/features/settings/components/settings-dialog.tsx", [
    ...asyncStates,
    "appearance",
    "connections",
    "provider-detail",
    "selected-billing",
    "model",
    "reasoning",
    "unsupported",
    "back",
  ]),
  surface(
    "focus",
    `${component}conversation-content-viewer.tsx`,
    [
      ...asyncStates,
      "floating-header",
      "composer-context",
      "remove-context",
      "nested-back",
      "original-download",
    ],
    ["Focus-header-overlay"],
  ),
  surface("markdown", `${component}answer.tsx`, [
    "paragraph",
    "link",
    "code",
    "table",
    "image",
    "citation",
    "selection",
    "copy",
  ]),
  surface("table", `${component}table-viewport.tsx`, [
    ...shared,
    "sort",
    "filter",
    "wrap",
    "selection",
    "copy",
    "maximize",
    "virtualization",
  ]),
  surface(
    "source",
    `${component}source-code-viewer.tsx`,
    [...asyncStates, "syntax", "line-numbers", "find", "wrap", "selection", "copy", "bounded-read"],
    ["working-files-tree-2026-11-07"],
  ),
  surface(
    "pdf",
    `${component}pdf-content.tsx`,
    [
      ...asyncStates,
      "pages",
      "text-selection",
      "copy",
      "zoom",
      "fit-width",
      "position-preservation",
      "virtualization",
      "limit",
    ],
    ["Focus-PDF"],
  ),
  surface("html", `${component}conversation-content-viewer.tsx`, [
    "static-document",
    "script-blocked",
    "form-blocked",
    "resource-blocked",
    "navigation-blocked",
    "native-overlay",
    "focus-return",
  ]),
  surface(
    "working-files",
    `${component}working-files.tsx`,
    [
      ...asyncStates,
      "lazy-tree",
      "append-page",
      "folder-retry",
      "refresh",
      "keyboard",
      "selection",
      "expanded-scroll-restoration",
      "icons-light-dark",
      "focus-back",
    ],
    ["working-files-tree-2026-11-07", "dedicated-folder-navigation"],
  ),
  surface("computer", `${component}machine-viewer.tsx`, [
    ...asyncStates,
    "decoded-frame",
    "view-only",
    "takeover",
    "handback",
    "lease-expired",
    "paused",
    "reconnect",
    "compact",
    "expanded",
    "hidden",
    "scope-retirement",
  ]),
  surface("host", "apps/desktop/src-tauri/src/host.rs", [
    "launch",
    "attach",
    "own",
    "close-hide",
    "reopen",
    "quit",
    "menu",
    "tray",
    "download",
    "restart",
    "crash",
    "visibility-cleanup",
  ]),
];
// Surface owner mistakes fail a refresh rather than silently entering the baseline.
for (const s of surfaces)
  if (!(await Bun.file(resolve(repository, s.source_owner)).exists()))
    s.status = "source owner requires reconciliation";
const manifest = {
  version: 1,
  source_revision: revision.trim(),
  contract: "1.31.0",
  sources,
  product_module_paths: [...reachable].sort(),
  intended_capture_environment: {
    viewports: [
      [1280, 900],
      [1440, 1000],
      [720, 500],
    ],
    themes: ["light", "dark"],
    device_scales: [1, 2],
    zoom: 1,
    font: "Geist/Geist Mono 5.3.0",
    locale: "en-US",
    time_zone: "Asia/Makassar",
    fixture_clock: "2026-11-07T04:00:00Z",
    motion_timestamp_ms: 600,
    source_kind: "current Tauri/web-client",
    fixture: "Isolated real API; no executors/scheduler",
  },
  surfaces,
  controls: product,
  reference_assets: {
    font_source: "@fontsource-variable/geist and geist-mono 5.3.0",
    navigation_icons: "@hugeicons/core-free-icons 4.4.0",
    format_icons:
      "material-icon-theme 5.40.0; apps/web-client/build/file-icons.ts and resolver retained in sources",
    avatar:
      "packages/avatar and native/web source hashes; no exported portrait used as new renderer",
  },
};
await writeFile(resolve(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  JSON.stringify({
    source_revision: revision.trim(),
    sources: fileList.length,
    surfaces: surfaces.length,
    product_controls: product.filter((p) => p.classification === "product-used").length,
    unresolved_owners: surfaces
      .filter((s) => s.status.includes("reconciliation"))
      .map((s) => s.source_owner),
  }),
);
