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

test("visible child folders are prepared before expansion", async () => {
  const paths: string[] = [];
  spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").searchParams.get("path") ?? "";
    paths.push(path);
    return Response.json({
      entries: path
        ? [{ name: "ready.txt", path: "docs/ready.txt", type: "file" }]
        : [{ name: "docs", path: "docs", type: "directory" }],
      next_after: null,
    });
  });
  const browser = new WorkingFilesBrowser();
  try {
    await browser.load("");
    await Bun.sleep(0);
    expect(paths).toContain("docs");
    browser.setTree("expandedItems", ["docs"]);
    expect(browser.getChildren("docs")).toEqual(["docs/ready.txt"]);
  } finally {
    browser.dispose();
  }
});

test("background synchronization keeps cached children visible without a loading row", async () => {
  let finish: ((response: Response) => void) | undefined;
  let delayed = false;
  const listing = () =>
    Response.json({
      entries: [{ name: "ready.txt", path: "ready.txt", type: "file" }],
      next_after: null,
    });
  spyOn(globalThis, "fetch").mockImplementation(async () =>
    delayed
      ? new Promise<Response>((resolve) => {
          finish = resolve;
        })
      : listing(),
  );
  const browser = new WorkingFilesBrowser();
  await browser.load("");
  delayed = true;
  const refreshing = browser.refresh();
  try {
    expect(browser.getChildren(FILE_TREE_ROOT)).toEqual(["ready.txt"]);
    expect(browser.getSnapshot().folders[""].loading).toBe(false);
  } finally {
    finish?.(listing());
    await refreshing;
    browser.dispose();
  }
});

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
  expect(browser.getChildren(FILE_TREE_ROOT)).toEqual(["a.ts", "b.ts"]);
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

test("prefetch stays one visible level ahead and limits speculative reads", async () => {
  const paths: string[] = [];
  spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").searchParams.get("path") ?? "";
    paths.push(path);
    return Response.json({
      entries:
        path === ""
          ? [{ name: "docs", path: "docs", type: "directory" }]
          : path === "docs"
            ? [{ name: "nested", path: "docs/nested", type: "directory" }]
            : [],
      next_after: null,
    });
  });
  const browser = new WorkingFilesBrowser();
  await browser.load("");
  await Bun.sleep(0);
  expect(paths).toEqual(["", "docs"]);
  browser.setTree("expandedItems", ["docs"]);
  await Bun.sleep(0);
  expect(paths).toEqual(["", "docs", "docs/nested"]);
  browser.dispose();

  const queued: string[] = [];
  spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").searchParams.get("path") ?? "";
    if (path) {
      queued.push(path);
      return new Promise<Response>(() => {});
    }
    return Response.json({
      entries: Array.from({ length: 60 }, (_, index) => ({
        name: `dir${index}`,
        path: `dir${index}`,
        type: "directory",
      })),
      next_after: null,
    });
  });
  const bounded = new WorkingFilesBrowser();
  await bounded.load("");
  expect(queued).toHaveLength(2);
  bounded.dispose();
  await Bun.sleep(0);
  expect(queued).toHaveLength(2);
});

test("unchanged synchronization deduplicates requests and preserves the rendered snapshot", async () => {
  let reads = 0;
  spyOn(globalThis, "fetch").mockImplementation(async () => {
    reads++;
    return Response.json({
      entries: [{ name: "stable.txt", path: "stable.txt", type: "file", size_bytes: 10 }],
      next_after: null,
    });
  });
  const browser = new WorkingFilesBrowser();
  await browser.load("");
  const snapshot = browser.getSnapshot();
  await Promise.all([browser.refresh(), browser.refresh(), browser.refresh()]);
  expect(reads).toBe(2);
  expect(browser.getSnapshot()).toBe(snapshot);
  browser.dispose();
});

test("pausing cancels a warmup continuation and never restarts hidden speculative reads", async () => {
  let reads = 0;
  spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").searchParams.get("path") ?? "";
    if (path) {
      reads++;
      return new Promise<Response>(() => {});
    }
    return Response.json({
      entries: [{ name: "docs", path: "docs", type: "directory" }],
      next_after: null,
    });
  });
  const browser = new WorkingFilesBrowser();
  await browser.load("");
  browser.pause();
  const warm = browser.warm();
  browser.pause();
  await warm;
  await Bun.sleep(0);
  expect(reads).toBe(1);
  browser.dispose();
});

test("synchronization removes deleted directory caches and their selected descendants", async () => {
  let exists = true;
  spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = new URL(String(input), "http://localhost").searchParams.get("path") ?? "";
    return Response.json({
      entries: path
        ? [{ name: "note.txt", path: "docs/note.txt", type: "file" }]
        : exists
          ? [{ name: "docs", path: "docs", type: "directory" }]
          : [],
      next_after: null,
    });
  });
  const browser = new WorkingFilesBrowser();
  await browser.load("");
  await browser.load("docs");
  browser.setTree("expandedItems", ["docs"]);
  browser.setTree("selectedItems", ["docs/note.txt"]);
  exists = false;
  await browser.refresh();
  expect(browser.getSnapshot().folders.docs).toBeUndefined();
  expect(browser.getSnapshot().tree.expandedItems).toEqual([]);
  expect(browser.getSnapshot().tree.selectedItems).toEqual([]);
  browser.dispose();
});
