import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /Maximum update depth|Cannot update a component/.test(message.text())
    )
      errors.push(message.text());
  });
});
test.afterEach(({ page }) => {
  expect(pageErrors.get(page) ?? []).toEqual([]);
});

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    data,
    headers: { "Idempotency-Key": crypto.randomUUID() },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function setup(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const connection = await post(page, "/v1/connections", {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = await post(page, "/v1/agents", {
    name: `File tree ${crypto.randomUUID().slice(0, 8)}`,
    harness: "codex",
    connection_id: connection.id,
    model_id: "fixture",
    billing_source: "subscription",
  });
  const thread = await post(page, `/v1/agents/${agent.id}/dm`, {});
  const run = await post(page, "/v1/runs", {
    agent_id: agent.id,
    thread_id: thread.id,
    text: "fixture warmup",
  });
  await expect
    .poll(
      async () => {
        const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
        return snapshot.runs.find((item: { id: string }) => item.id === run.run.id)?.status;
      },
      { timeout: 20_000 },
    )
    .toBe("succeeded");
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), thread.id);
  await page.reload();
  const details = page.getByRole("button", { name: `Detail ${agent.name}`, exact: true });
  await expect(details).toBeVisible();
  return { agent, thread, details };
}
async function openLocal(
  page: Page,
  name: string,
  code: string,
  mimeType = "application/octet-stream",
) {
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles({ name, mimeType, buffer: Buffer.from(code) });
  await page.getByRole("button", { name: `Pratinjau ${name}`, exact: true }).click();
  const source = page.locator("[data-content-viewer] [data-source-code]");
  await expect(source).toBeVisible();
  return source;
}

for (const theme of ["light", "dark"]) {
  test(`Working files ${theme}: tree pagination, icons, synchronization and tabs preserve the originating panel`, async ({
    page,
  }, info) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("ngertiin-web-client-theme", theme),
      theme,
    );
    const requests: { path: string; after: string }[] = [];
    await page.route("**/v1/machine/files?**", async (route) => {
      const query = new URL(route.request().url()).searchParams;
      const path = query.get("path") ?? "";
      const after = query.get("after") ?? "";
      requests.push({ path, after });
      const entries =
        path === "docs"
          ? after
            ? [{ name: "z-last.ts", path: "docs/z-last.ts", type: "file" }]
            : Array.from({ length: 100 }, (_, index) => ({
                name: `note-${String(index).padStart(3, "0")}.txt`,
                path: `docs/note-${String(index).padStart(3, "0")}.txt`,
                type: "file",
              }))
          : path === "src"
            ? [{ name: "index.ts", path: "src/index.ts", type: "file" }]
            : [
                { name: "docs", path: "docs", type: "directory" },
                { name: "src", path: "src", type: "directory" },
                { name: "Dockerfile", path: "Dockerfile", type: "file" },
              ];
      await route.fulfill({
        json: { entries, next_after: path === "docs" && !after ? "note-099.txt" : null },
      });
    });
    await page.route("**/v1/machine/file?**", (route) =>
      route.fulfill({
        contentType: "application/octet-stream",
        body: "export const answer: number = 42;\n",
      }),
    );
    const { details } = await setup(page);
    await details.click();
    const toolbar = page.locator(".details-toolbar");
    const infoTab = toolbar.getByRole("tab", { name: "Agent info", exact: true });
    const filesTab = toolbar.getByRole("tab", { name: "Working files", exact: true });
    await expect(infoTab).toHaveAttribute("aria-selected", "true");
    await expect(toolbar.getByRole("tab")).toHaveCount(2);
    const headerBounds = await toolbar.boundingBox();
    await page.screenshot({ path: info.outputPath(`agent-info-${theme}.png`) });
    for (const tab of ["Details", "Computer", "Library"]) {
      await page.getByRole("tab", { name: tab, exact: true }).click();
      await expect(page.getByRole("tab", { name: "Working files", exact: true })).toBeVisible();
    }
    await expect.poll(() => requests.some((request) => request.path === "docs")).toBe(true);
    await infoTab.focus();
    await infoTab.press("ArrowRight");
    await expect(filesTab).toBeFocused();
    await expect(filesTab).toHaveAttribute("aria-selected", "true");
    const browser = page.getByRole("region", { name: "Working files browser", exact: true });
    const tree = page.getByRole("tree", { name: "Working files", exact: true });
    await expect(tree.getByRole("treeitem", { name: "docs", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Library", exact: true })).toBeHidden();
    await expect(browser).not.toContainText("Shared with all your agents");
    const filesHeaderBounds = await toolbar.boundingBox();
    for (const metric of ["width", "height", "y"] as const)
      expect(filesHeaderBounds?.[metric]).toBeCloseTo(headerBounds?.[metric] ?? 0, 2);
    await expect(toolbar.getByRole("button")).toHaveCount(1);
    await expect(toolbar.getByRole("heading")).toHaveCount(0);
    const infoBounds = await infoTab.boundingBox();
    const filesBounds = await filesTab.boundingBox();
    const closeBounds = await toolbar.locator("[data-panel-close]").boundingBox();
    expect((infoBounds?.x ?? 0) + (infoBounds?.width ?? 0)).toBeLessThanOrEqual(
      filesBounds?.x ?? 0,
    );
    expect((filesBounds?.x ?? 0) + (filesBounds?.width ?? 0)).toBeLessThan(closeBounds?.x ?? 0);
    expect((filesBounds?.y ?? 0) + (filesBounds?.height ?? 0) / 2).toBeCloseTo(
      (closeBounds?.y ?? 0) + (closeBounds?.height ?? 0) / 2,
      0,
    );
    const folder = tree.getByRole("treeitem", { name: "docs", exact: true });
    await folder.focus();
    await folder.press("ArrowRight");
    await expect(folder).toHaveAttribute("aria-expanded", "true");
    const first = tree.getByRole("treeitem", { name: "note-000.txt", exact: true });
    await expect(first).toBeVisible();
    await folder.press("ArrowDown");
    await expect(first).toBeFocused();
    expect(requests.some((request) => request.path === "src")).toBe(true);
    await tree.getByRole("treeitem", { name: "Load more files", exact: true }).click();
    const last = tree.getByRole("treeitem", { name: "z-last.ts", exact: true });
    await expect(last).toBeVisible();
    await expect(first).toHaveCount(1);
    const lastIcon = last.locator("img");
    await expect(lastIcon).toHaveAttribute(
      "src",
      /\/file-icons\/material-5\.40\.0\/typescript\.svg$/,
    );
    await expect
      .poll(() => lastIcon.evaluate((image) => (image as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await page.screenshot({ path: info.outputPath(`file-tree-${theme}.png`) });
    const scrollBefore = await page
      .locator(".working-files-scroll")
      .evaluate((element) => element.scrollTop);
    expect(scrollBefore).toBeGreaterThan(1000);
    await last.press("Enter");
    const viewer = page.locator("[data-content-viewer]");
    await expect(viewer.locator("[data-source-code]")).toHaveAttribute(
      "data-language",
      "typescript",
    );
    await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
    await expect(last).toBeFocused();
    expect(
      await page.locator(".working-files-scroll").evaluate((element) => element.scrollTop),
    ).toBeCloseTo(scrollBefore, -1);
    await expect(
      page.getByRole("button", { name: "Refresh working files", exact: true }),
    ).toHaveCount(0);
    const beforeSync = requests.length;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => requests.length).toBeGreaterThan(beforeSync);
    await expect(folder).toHaveAttribute("aria-expanded", "true");
    await expect(last).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Agent info", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Library", exact: true })).toHaveAttribute(
      "data-state",
      "active",
    );
    await expect(page.getByRole("tab", { name: "Agent info", exact: true })).toBeFocused();
    await expect(page.getByRole("tree", { name: "Working files", exact: true })).toHaveCount(0);
    await page.getByRole("tab", { name: "Computer", exact: true }).click();
    await page.getByRole("tab", { name: "Working files", exact: true }).click();
    await expect(last).toBeVisible();
    await page.getByRole("tab", { name: "Agent info", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Computer", exact: true })).toHaveAttribute(
      "data-state",
      "active",
    );
    await filesTab.click();
    await toolbar.locator("[data-panel-close]").click();
    await expect(infoTab).toBeHidden();
    await details.click();
    await expect(page.getByRole("tab", { name: "Agent info", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await info.attach("directory-requests.json", {
      body: JSON.stringify(requests, null, 2),
      contentType: "application/json",
    });
    await page.unrouteAll({ behavior: "wait" });
  });
}

test("Working files retries each folder, exposes empty states and restores nested panel navigation", async ({
  page,
}) => {
  let rootUnavailable = true;
  let failedReads = 0;
  await page.route("**/v1/machine/files?**", async (route) => {
    const path = new URL(route.request().url()).searchParams.get("path") ?? "";
    if ((!path && rootUnavailable) || (path === "unavailable" && ++failedReads === 1)) {
      await route.fulfill({ status: 503, json: { error: { code: "MACHINE_UNAVAILABLE" } } });
      return;
    }
    await route.fulfill({
      json: {
        entries: path
          ? []
          : [
              { name: "empty", path: "empty", type: "directory" },
              { name: "unavailable", path: "unavailable", type: "directory" },
            ],
        next_after: null,
      },
    });
  });
  const { details } = await setup(page);
  await details.click();
  await page.getByRole("tab", { name: "Working files", exact: true }).click();
  const retry = page.getByRole("treeitem", {
    name: "Couldn't load this folder. Try again",
    exact: true,
  });
  await expect(retry).toBeVisible();
  rootUnavailable = false;
  const empty = page.getByRole("treeitem", { name: "empty", exact: true });
  await expect(empty).toBeVisible({ timeout: 12000 });
  await empty.click();
  await expect(
    page.getByRole("treeitem", { name: "This folder is empty", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await expect.poll(() => failedReads).toBeGreaterThan(0);
  await page.getByRole("treeitem", { name: "unavailable", exact: true }).click();
  await expect(
    page.getByRole("treeitem", { name: "This folder is empty", exact: true }),
  ).toHaveCount(2);
  await page.locator(".details-toolbar [data-panel-close]").press("Escape");
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
});

test("Working files opens prepared folders immediately and synchronizes without a reload action", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  let version = 0;
  let fail = false;
  let ready = false;
  let reads = 0;
  let failures = 0;
  await page.route("**/v1/machine/files?**", async (route) => {
    reads++;
    const path = new URL(route.request().url()).searchParams.get("path") ?? "";
    await new Promise((resolve) => setTimeout(resolve, path ? 700 : 50));
    if (fail) {
      failures++;
      await route.fulfill({ status: 503, json: { error: { code: "MACHINE_UNAVAILABLE" } } });
      return;
    }
    const names =
      version === 0
        ? ["ready.txt"]
        : version === 1
          ? ["ready.txt", "added.txt"]
          : ["added.txt", "latest.txt"];
    await route.fulfill({
      json: {
        entries: path
          ? names.map((name) => ({ name, path: `docs/${name}`, type: "file" }))
          : [{ name: "docs", path: "docs", type: "directory" }],
        next_after: null,
      },
    });
    if (path === "docs") ready = true;
  });
  const { details } = await setup(page);
  await details.click();
  await expect(page.getByRole("tab", { name: "Agent info", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect.poll(() => ready).toBe(true);
  await page.getByRole("tab", { name: "Working files", exact: true }).click();
  const tree = page.getByRole("tree", { name: "Working files", exact: true });
  await expect(
    page.getByRole("button", { name: "Refresh working files", exact: true }),
  ).toHaveCount(0);
  const folder = tree.getByRole("treeitem", { name: "docs", exact: true });
  const expansion = await folder.evaluate(async (element) => {
    const started = performance.now();
    (element as HTMLElement).click();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
    const tree = element.closest('[role="tree"]');
    return {
      milliseconds: performance.now() - started,
      ready: !!tree?.querySelector('[data-file-path="docs/ready.txt"]'),
      loading: !!tree?.querySelector('[data-file-status="loading"]'),
    };
  });
  expect(expansion.ready).toBe(true);
  expect(expansion.loading).toBe(false);
  const first = tree.getByRole("treeitem", { name: "ready.txt", exact: true });
  await first.focus();
  await page.evaluate(() => {
    const probe = { loadingRows: 0 };
    Object.assign(window, { workingFilesProbe: probe });
    const tree = document.querySelector('[role="tree"][aria-label="Working files"]');
    if (tree)
      new MutationObserver(() => {
        if (tree.querySelector('[data-file-status="loading"]')) probe.loadingRows++;
      }).observe(tree, { subtree: true, childList: true });
  });
  version = 1;
  await expect(tree.getByRole("treeitem", { name: "added.txt", exact: true })).toBeVisible({
    timeout: 12000,
  });
  await expect(folder).toHaveAttribute("aria-expanded", "true");
  await expect(first).toBeFocused();
  fail = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => failures).toBeGreaterThan(0);
  await expect(first).toBeVisible();
  await expect(tree).toHaveAttribute("aria-busy", "false");
  await expect(tree.locator('[data-file-status="error"]')).toHaveCount(0);
  fail = false;
  version = 2;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(tree.getByRole("treeitem", { name: "latest.txt", exact: true })).toBeVisible({
    timeout: 12000,
  });
  await expect(first).toHaveCount(0);
  const loadingRows = await page.evaluate(
    () =>
      (window as unknown as { workingFilesProbe: { loadingRows: number } }).workingFilesProbe
        .loadingRows,
  );
  expect(loadingRows).toBe(0);
  await info.attach("working-files-smoothness.json", {
    contentType: "application/json",
    body: JSON.stringify(
      {
        cold_response_delay_ms: 700,
        prepared_expansion: expansion,
        background_loading_rows: loadingRows,
        reads,
        failures,
      },
      null,
      2,
    ),
  });
  await page.screenshot({ path: info.outputPath("working-files-automatic.png") });
  await page.unrouteAll({ behavior: "wait" });
});

test("Working files restores saved-file details with one contextual header", async ({ page }) => {
  await page.route("**/v1/machine/files?**", (route) =>
    route.fulfill({ json: { entries: [], next_after: null } }),
  );
  const { agent, thread, details } = await setup(page);
  const workspace = await post(page, "/v1/workspaces", {
    thread_id: thread.id,
    agent_id: agent.id,
  });
  const artifact = await post(page, `/v1/workspaces/${workspace.id}/uploads`, {
    name: "result.json",
    media_type: "application/json",
    content_base64: Buffer.from('{"result":42}').toString("base64"),
  });
  await page.route(`**/v1/threads/${thread.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const item = snapshot.artifacts.find((item: { id: string }) => item.id === artifact.id);
    if (item) item.origin = "native_output";
    await route.fulfill({ response, json: snapshot });
  });
  await page.reload();
  await details.click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "File result.json", exact: true }).click();
  await page
    .locator("[data-content-viewer]")
    .getByRole("button", { name: "Aksi file", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Info file", exact: true }).click();
  await expect(page.getByRole("heading", { name: "result.json", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Working files", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Working files", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByRole("heading", { name: "result.json", exact: true })).toHaveCount(0);
  await expect(page.locator(".details-toolbar [data-panel-back]")).toHaveCount(0);
  await expect(page.locator(".details-toolbar").getByRole("tab")).toHaveCount(2);
  await page.getByRole("tab", { name: "Agent info", exact: true }).click();
  await expect(page.getByRole("heading", { name: "result.json", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "About this file", exact: true })).toBeVisible();
  await page.unrouteAll({ behavior: "wait" });
});

test("Source viewer detects code languages, highlights syntax and downloads unchanged source", async ({
  page,
}, info) => {
  await setup(page);
  let uploads = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/message-uploads")) uploads++;
  });
  const cases = [
    {
      name: "app.js",
      language: "javascript",
      code: "export const value = 42;\nconsole.log(value);\n",
    },
    {
      name: "app.ts",
      language: "typescript",
      code: "const greeting: string = 'hello';\nexport { greeting };\n",
    },
    { name: "main.go", language: "go", code: 'package main\n\nfunc main() { println("hello") }\n' },
    {
      name: "Dockerfile",
      language: "dockerfile",
      code: 'FROM node:22-alpine\nWORKDIR /app\nCMD ["node", "index.js"]\n',
    },
    { name: "settings.json", language: "json", code: '{\n  "enabled": true,\n  "count": 3\n}\n' },
    { name: "settings.toml", language: "toml", code: "[server]\nport = 3000\n" },
    { name: "notes.unrecognized", language: "text", code: "Plain UTF-8 notes — tetap utuh.\n" },
  ];
  for (const file of cases) {
    const source = await openLocal(page, file.name, file.code);
    await expect(source).toHaveAttribute("data-language", file.language);
    if (file.language !== "text")
      await expect(source.locator('code span[style*="--shiki-light"]').first()).toBeVisible();
    await expect(source.locator(".source-line-number").first()).toHaveText("1");
    await expect(source).not.toContainText("Pratinjau belum tersedia");
    const viewer = page.locator("[data-content-viewer]");
    if (file.name === "Dockerfile") {
      await page.screenshot({ path: info.outputPath("dockerfile-source.png") });
      const firstToken = source.locator('code span[style*="--shiki-light"]').first();
      const lightColor = await firstToken.evaluate((element) => getComputedStyle(element).color);
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expect
        .poll(() => firstToken.evaluate((element) => getComputedStyle(element).color))
        .not.toBe(lightColor);
      await page.screenshot({ path: info.outputPath("dockerfile-source-dark.png") });
      await page.emulateMedia({ colorScheme: "light" });
      await viewer.getByRole("button", { name: "Aksi file", exact: true }).click();
      const downloading = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: "Unduh file", exact: true }).click();
      const download = await downloading;
      const path = await download.path();
      if (!path) throw new Error("The original download was not saved.");
      expect(await readFile(path, "utf8")).toBe(file.code);
    }
    await viewer.getByRole("button", { name: "Kembali", exact: true }).click();
    await page.getByRole("button", { name: `Hapus lampiran ${file.name}`, exact: true }).click();
  }
  expect(uploads).toBe(0);
});

test("Source viewer find, wrapping, original copy and large-file virtualization stay usable", async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  const code =
    "const importantValue = '" +
    "long content ".repeat(80) +
    "';\r\nconsole.log(importantValue);\r\n";
  const source = await openLocal(page, "search.ts", code);
  const region = source.getByRole("region", { name: "Source code search.ts", exact: true });
  expect(await region.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await source.getByRole("button", { name: "Find in file", exact: true }).click();
  const find = source.getByRole("textbox", { name: "Find in file", exact: true });
  await find.fill("importantValue");
  await expect(source.locator("output")).toHaveText("1/2");
  await source.getByRole("button", { name: "Next match", exact: true }).click();
  await expect(source.locator("output")).toHaveText("2/2");
  await find.fill("const importantValue");
  await expect(source.locator("output")).toHaveText("1/1");
  await expect(source.locator("mark[data-active=true]")).not.toHaveCount(0);
  await find.press("Escape");
  await expect(source).toBeVisible();
  await expect(find).toHaveCount(0);
  await source.getByRole("button", { name: "Wrap lines", exact: true }).click();
  await expect(source).toHaveAttribute("data-wrap", "true");
  expect(await region.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(
    true,
  );
  await source.getByRole("button", { name: "Copy code", exact: true }).click();
  await expect(source.getByRole("button", { name: "Code copied", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code);
  await region.focus();
  await region.press("ControlOrMeta+f");
  await expect(source.getByRole("textbox", { name: "Find in file", exact: true })).toBeFocused();
  await page.screenshot({ path: info.outputPath("source-find-wrap.png") });
  await source.getByRole("button", { name: "Close find", exact: true }).click();
  await page
    .locator("[data-content-viewer]")
    .getByRole("button", { name: "Kembali", exact: true })
    .click();
  await page.getByRole("button", { name: "Hapus lampiran search.ts", exact: true }).click();
  const longCode =
    Array.from({ length: 8000 }, (_, index) => `const n${index} = ${index};`).join("\n") +
    "\nconst finishMarker = true;";
  const started = Date.now();
  const large = await openLocal(page, "large.ts", longCode);
  await expect(large).toHaveAttribute("data-virtualized", "true");
  expect(await large.locator("[data-source-line]").count()).toBeLessThan(150);
  await expect(large.getByRole("status")).toContainText("128 KB preview");
  await large.getByRole("button", { name: "Find in file", exact: true }).click();
  await large.getByRole("textbox", { name: "Find in file", exact: true }).fill("n5999");
  await expect(large.locator('[data-source-line="6000"]')).toBeVisible();
  await info.attach("source-render.json", {
    body: JSON.stringify(
      {
        open_ms: Date.now() - started,
        rendered_lines: await large.locator("[data-source-line]").count(),
        original_lines: 8001,
        preview_limit_bytes: 128000,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
