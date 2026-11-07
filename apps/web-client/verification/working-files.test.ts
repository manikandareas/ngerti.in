import { afterEach, expect, spyOn, test } from "bun:test";
import { fileLanguage, isTextFile } from "../src/features/conversation/lib/file-format";
import {
  type FileIconManifest,
  resolveFileIcon,
} from "../src/features/conversation/lib/file-icon-manifest";
import { searchSource } from "../src/features/conversation/lib/source-search";
import {
  FILE_TREE_ROOT,
  WorkingFilesBrowser,
} from "../src/features/conversation/lib/working-files-browser";

afterEach(() => {
  globalThis.fetch = originalFetch;
});
const originalFetch = globalThis.fetch;

test("file classification recognizes extensionless names and preserves the actual read path", () => {
  for (const [name, language] of Object.entries({
    Dockerfile: "dockerfile",
    "Dockerfile.dev": "dockerfile",
    containerfile: "dockerfile",
    Makefile: "makefile",
    "lib.d.ts": "typescript",
    "main.go": "go",
    "component.TSX": "tsx",
    "config.jsonc": "jsonc",
    "settings.toml": "toml",
    "query.sql": "sql",
    ".env.local": "bash",
  }))
    expect(fileLanguage(name)).toBe(language);
  expect(isTextFile("README")).toBe(true);
  expect(isTextFile("notes.unknown", "text/plain")).toBe(true);
  expect(isTextFile("data.zip", "application/zip")).toBe(false);
  for (const name of ["constructor", "__proto__", "toString"])
    expect(fileLanguage(name)).toBeUndefined();
});

test("file icons prefer exact names, parent names and compound extensions with theme overrides", () => {
  const manifest: FileIconManifest = {
    file: "file",
    folder: "folder",
    folderExpanded: "folder-open",
    fileNames: { "config.json": "config", "special/config.json": "special" },
    fileExtensions: { json: "json", "d.ts": "declaration", ts: "typescript" },
    light: { fileNames: { "config.json": "config-light" } },
    icons: Object.fromEntries(
      [
        "file",
        "folder",
        "folder-open",
        "config",
        "special",
        "json",
        "declaration",
        "typescript",
        "config-light",
      ].map((name) => [name, `${name}.svg`]),
    ),
  };
  expect(resolveFileIcon(manifest, "special/config.json", { light: true })).toEndWith(
    "/special.svg",
  );
  expect(resolveFileIcon(manifest, "config.json", { light: true })).toEndWith("/config-light.svg");
  expect(resolveFileIcon(manifest, "lib.d.ts")).toEndWith("/declaration.svg");
  expect(resolveFileIcon(manifest, "src", { folder: true, expanded: true })).toEndWith(
    "/folder-open.svg",
  );
  expect(resolveFileIcon(manifest, "file.unknown")).toEndWith("/file.svg");
  expect(resolveFileIcon(manifest, "constructor")).toEndWith("/file.svg");
});

test("source search finds literal case-insensitive matches independently of syntax tokens", () => {
  expect(searchSource(["const value = VALUE;", "other value"], "value")).toEqual([
    { line: 0, start: 6, end: 11, index: 0 },
    { line: 0, start: 14, end: 19, index: 1 },
    { line: 1, start: 6, end: 11, index: 2 },
  ]);
  expect(searchSource(["a[b]"], "[b]")).toHaveLength(1);
  expect(searchSource(["text"], "")).toEqual([]);
});

test("folder pages append, refresh rereads the loaded prefix and failed refresh retains entries", async () => {
  const urls: string[] = [];
  let fail = false;
  spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    urls.push(String(input));
    if (fail) return Response.json({ error: { code: "MACHINE_UNAVAILABLE" } }, { status: 503 });
    const after = new URL(String(input), "http://localhost").searchParams.get("after");
    return Response.json({
      entries: [{ name: after ? "b.ts" : "a.ts", path: after ? "b.ts" : "a.ts", type: "file" }],
      next_after: after ? null : "a.ts",
    });
  });
  const browser = new WorkingFilesBrowser();
  await Promise.all([browser.load(""), browser.load("")]);
  expect(urls).toHaveLength(1);
  await browser.load("", "more");
  expect(browser.getChildren(FILE_TREE_ROOT)).toEqual(["a.ts", "b.ts"]);
  await browser.refresh();
  expect(urls).toHaveLength(4);
  expect(browser.getChildren(FILE_TREE_ROOT)).toEqual(["a.ts", "b.ts"]);
  fail = true;
  await browser.refresh();
  expect(browser.getChildren(FILE_TREE_ROOT).slice(0, 2)).toEqual(["a.ts", "b.ts"]);
  expect(browser.getNode(browser.getChildren(FILE_TREE_ROOT).at(-1) ?? "").status).toBe("error");
  browser.dispose();
});

test("disposing the conversation aborts in-flight directory reads without publishing late data", async () => {
  let finish: ((value: Response) => void) | undefined;
  let signal: AbortSignal | null | undefined;
  spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    signal = init?.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const browser = new WorkingFilesBrowser();
  const reading = browser.load("");
  browser.dispose();
  finish?.(
    Response.json({
      entries: [{ name: "late.txt", path: "late.txt", type: "file" }],
      next_after: null,
    }),
  );
  await reading;
  expect(signal?.aborted).toBe(true);
  expect(browser.getChildren(FILE_TREE_ROOT)).not.toContain("late.txt");
});

test("refresh clears focus and selection for files removed from the machine", async () => {
  let exists = true;
  spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      entries: exists ? [{ name: "removed.ts", path: "removed.ts", type: "file" }] : [],
      next_after: null,
    }),
  );
  const browser = new WorkingFilesBrowser();
  await browser.load("");
  browser.setTree("selectedItems", ["removed.ts"]);
  browser.setTree("focusedItem", "removed.ts");
  exists = false;
  await browser.refresh();
  expect(browser.getSnapshot().tree.selectedItems).toEqual([]);
  expect(browser.getSnapshot().tree.focusedItem).toBeNull();
});

test("directory names that match JavaScript object properties remain normal file paths", async () => {
  spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").searchParams.get("path");
    return Response.json({
      entries: path
        ? [{ name: "constructor", path: "__proto__/constructor", type: "file" }]
        : [{ name: "__proto__", path: "__proto__", type: "directory" }],
      next_after: null,
    });
  });
  const browser = new WorkingFilesBrowser();
  await browser.load("");
  await browser.load("__proto__");
  expect(browser.getChildren(FILE_TREE_ROOT)).toEqual(["__proto__"]);
  expect(browser.getChildren("__proto__")).toEqual(["__proto__/constructor"]);
  expect(browser.getNode("__proto__/constructor").type).toBe("file");
});
