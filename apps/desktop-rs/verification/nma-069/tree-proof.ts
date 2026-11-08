/** Scripted machine file responses for native tree UI verification only. */
const folders: Record<string, string[]> = {
  "": [
    ".ngertiin/",
    "assets/",
    "docs/",
    "empty-folder/",
    "projects/",
    "src/",
    "unavailable-folder/",
    ".env.example",
    "Cargo.toml",
    "README.md",
    "a-long-filename-that-must-truncate-without-moving-the-file-icon.ts",
  ],
  ".ngertiin": ["verification.md"],
  assets: ["fonts/", "icons/", "logo.svg"],
  "assets/fonts": ["Geist.ttf"],
  "assets/icons": ["folder.svg", "typescript.svg"],
  docs: ["architecture/", "README.md"],
  "docs/architecture": ["overview.md"],
  "empty-folder": [],
  projects: Array.from({ length: 600 }, (_, i) => `project-${String(i + 1).padStart(3, "0")}.md`),
  src: ["api/", "components/", "main.rs", "theme.rs"],
  "src/api": ["client.rs", "types.rs"],
  "src/components": [
    "Avatar.tsx",
    "Button.tsx",
    "Composer.tsx",
    "Dialog.tsx",
    "FileTree.tsx",
    "Input.tsx",
    "Library.tsx",
    "Panel.tsx",
    "Settings.tsx",
    "Table.tsx",
    "Tabs.tsx",
    "Viewer.tsx",
  ],
  "unavailable-folder": ["recovered.md"],
};
let failed = false;
export async function treeProofResponse(request: Request): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (request.method !== "GET") return;
  const path = url.searchParams.get("path") ?? "";
  if (url.pathname === "/v1/machine/files") {
    await Bun.sleep(200);
    if (path === "unavailable-folder" && !failed) {
      failed = true;
      return Response.json(
        { error: { code: "UNAVAILABLE", message: "The scripted folder read failed." } },
        { status: 503 },
      );
    }
    const names = [...(folders[path] ?? [])].sort();
    const after = url.searchParams.get("after") ?? "";
    const limit = path === "src/components" ? 6 : Number(url.searchParams.get("limit") ?? 200);
    const entries = names
      .filter((name) => name.replace(/\/$/, "") > after)
      .slice(0, limit)
      .map((item) => {
        const name = item.replace(/\/$/, "");
        return {
          name,
          path: path ? `${path}/${name}` : name,
          type: item.endsWith("/") ? "directory" : "file",
          size_bytes: 42,
        };
      });
    return Response.json({
      entries,
      next_after:
        names.filter((name) => name.replace(/\/$/, "") > after).length > limit
          ? (entries.at(-1)?.name ?? null)
          : null,
    });
  }
  if (url.pathname === "/v1/machine/file") {
    return new Response(`# ${path}\n\nScripted file-tree preview. No model execution.\n`, {
      headers: { "Content-Type": "application/octet-stream" },
    });
  }
}
