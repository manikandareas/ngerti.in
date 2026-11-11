import { expect, type Page, type TestInfo, test } from "@playwright/test";

async function capture(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath(name), animations: "disabled" });
}

// Bootstrap, conversation identity and draft use the real API. The external app
// and harness inventories are deterministic fixtures; no OAuth or inference runs.
test.beforeEach(async ({ page }) => {
  await page.route("https://assets.example.test/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="#7856ff"/></svg>',
    }),
  );
  await page.route("**/v1/apps/catalog*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            slug: "github",
            logo: "https://assets.example.test/github.svg",
            name: "GitHub",
            description: "Repository collaboration",
            connected: false,
            categories: [{ slug: "developer-tools", name: "Developer Tools" }],
            tools_count: 24,
            triggers_count: 3,
            no_auth: false,
          },
          {
            slug: "mail",
            name: "Mail",
            description: "Manage your inbox",
            connected: true,
            categories: [{ slug: "communication", name: "Communication" }],
          },
          {
            slug: "calendar",
            name: "Calendar",
            description: "Plan your schedule",
            connected: false,
            categories: [{ slug: "communication", name: "Communication" }],
          },
        ],
      },
    }),
  );
  await page.route("**/v1/apps/connections", (route) =>
    route.fulfill({
      json: [{ id: "github-fixture", toolkit: "github", state: "active", grants: [] }],
    }),
  );
  await page.route("**/v1/learning/skills?*", (route) =>
    route.fulfill({
      json: {
        application: [
          {
            id: "report-fixture",
            name: "weekly-report",
            assignment: { enabled: true, version: 1 },
          },
        ],
        harness: [
          {
            key: "harness-review",
            name: "code-review",
            description: "Review code and report actionable findings.",
          },
        ],
        native_catalog: [
          {
            key: "native-review",
            name: "code-review",
            description: "Same inherited package",
            enabled: true,
          },
          {
            key: "disabled-skill",
            name: "disabled-skill",
            description: "Disabled",
            enabled: false,
          },
        ],
        harness_state: "known",
        native_state: "known",
      },
    }),
  );
});

test("rail, discovery, detail and prompt preserve the conversation and draft", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?context=retained");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const rail = page.getByRole("navigation", { name: "Navigasi utama" });
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await composer.fill("Draft yang sedang dikerjakan.");
  const marketplace = rail.getByRole("button", { name: "Marketplace", exact: true });
  await marketplace.click();
  await expect(marketplace).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button")).toHaveCount(3);
  expect(await rail.getByRole("button").allTextContents()).toHaveLength(3);
  const storeBounds = await marketplace.boundingBox();
  const settingsBounds = await rail
    .getByRole("button", { name: "Pengaturan", exact: true })
    .boundingBox();
  if (!storeBounds || !settingsBounds) throw new Error("Rail buttons must have visible bounds.");
  expect(storeBounds.y + storeBounds.height).toBeLessThan(settingsBounds.y);
  await expect(page.getByRole("main", { name: "Percakapan aktif" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();
  await expect(page.locator(".marketplace-entry").filter({ hasText: "Mail" })).toContainText(
    "Not installed",
  );
  await expect(page.locator(".marketplace-toolbar > button")).toHaveCount(0);
  await capture(page, info, "plugins-light.png");
  await page.getByRole("searchbox", { name: "Search plugins", exact: true }).fill("github");
  await expect(page.locator(".marketplace-entry")).toHaveCount(1);
  await page.locator(".marketplace-entry-open").click();
  await expect(page.getByRole("heading", { name: "GitHub", exact: true, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/marketplace=plugins.*item=github/);
  await expect(page.locator(".marketplace-breadcrumb")).toContainText("GitHub");
  const icon = page.locator(".marketplace-detail-header .marketplace-entry-icon");
  await expect(icon).toHaveCSS("display", "flex");
  const alignment = await icon.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const mark = element.querySelector("img");
    if (!mark) throw new Error("Plugin logo must be present");
    const logo = mark.getBoundingClientRect();
    return {
      x: Math.abs(box.x + box.width / 2 - logo.x - logo.width / 2),
      y: Math.abs(box.y + box.height / 2 - logo.y - logo.height / 2),
    };
  });
  expect(alignment.x).toBeLessThan(1);
  expect(alignment.y).toBeLessThan(1);
  await expect(page.getByText("24 tools · 3 triggers", { exact: true })).toBeVisible();
  await expect(page.getByText("Account connection required", { exact: true })).toBeVisible();
  await capture(page, info, "detail-light.png");
  await page.reload();
  await expect(page.getByRole("heading", { name: "GitHub", exact: true, level: 1 })).toBeVisible();
  await expect(page.locator(".marketplace-detail-actions").getByRole("button")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Installed", exact: true })).toBeDisabled();
  await page
    .getByRole("region", { name: "Example requests", exact: true })
    .getByRole("button")
    .first()
    .click();
  await expect(composer).toContainText("Draft yang sedang dikerjakan.");
  await expect(composer).toContainText("Jelaskan alur autentikasi repository ini");
  await expect(composer).toBeFocused();
  // Reopening Marketplace does not remount the conversation input.
  const retainedComposer = await composer.elementHandle();
  await marketplace.click();
  await expect(page.locator(".marketplace-toolbar > button")).toHaveCount(0);
  await expect(page.getByRole("main", { name: "Marketplace", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/marketplace=plugins/);
  await expect(page).not.toHaveURL(/settings=/);
  await rail.getByRole("button", { name: "Percakapan", exact: true }).click();
  expect(await retainedComposer?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(composer).toContainText("Draft yang sedang dikerjakan.");
  expect(errors).toEqual([]);
});

test("skills distinguish recommendations from scoped installed packages", async ({
  page,
}, info) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(new URL(request.url()).pathname);
  });
  await page.goto("/?marketplace=skills");
  await expect(page.getByRole("heading", { name: "Skills", exact: true })).toBeVisible();
  await expect(
    page.getByText("Skill ideas to create with your agent.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".marketplace-entry")).toHaveCount(6);
  const installed = page.getByRole("navigation", {
    name: "Installed plugins",
    includeHidden: true,
  });
  await expect(installed.getByRole("button", { includeHidden: true })).toHaveCount(1);
  await expect(installed).toContainText("GitHub");
  await expect(installed).not.toContainText("weekly-report");
  await capture(page, info, "skills-light.png");
  await page.getByRole("tab", { name: /^Available/ }).click();
  await expect(page.locator(".marketplace-entry")).toHaveCount(2);
  await expect(page.locator(".marketplace-entry").filter({ hasText: "code-review" })).toHaveCount(
    1,
  );
  await expect(page.getByText("disabled-skill", { exact: true })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search skills", exact: true }).fill("weekly");
  await expect(page.locator(".marketplace-entry")).toHaveCount(1);
  await page.locator(".marketplace-entry-open").click();
  await expect(page.getByRole("heading", { name: "weekly-report", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create with agent", exact: true })).toHaveCount(0);
  expect(
    writes.filter((path) => /\/learning\/skills\/|\/apps\/connect|\/runs$/.test(path)),
  ).toEqual([]);
});

test("empty states, dark theme and responsive catalog remain usable", async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem("ngertiin-web-client-theme", "dark"));
  await page.goto("/?marketplace=plugins");
  await expect(page.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await capture(page, info, "plugins-dark.png");
  await page
    .getByRole("searchbox", { name: "Search plugins", exact: true })
    .fill("nothing-matches-this");
  await expect(page.getByRole("heading", { name: "No results", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).last().click();
  await expect(page.locator(".marketplace-entry")).toHaveCount(3);
  await page.locator(".marketplace-entry-open").filter({ hasText: "GitHub" }).click();
  await expect(page.getByRole("heading", { name: "GitHub", exact: true, level: 1 })).toBeVisible();
  await capture(page, info, "detail-dark.png");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Marketplace navigation" })
    .getByRole("button", { name: "Skills", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Skills", exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Marketplace navigation" })
      .getByRole("button", { name: "Skills", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await capture(page, info, "skills-dark.png");
  for (const width of [320, 390, 768, 1024, 1440, 2048]) {
    await page.setViewportSize({ width, height: width === 2048 ? 1174 : 1000 });
    await expect(page.getByRole("button", { name: "Marketplace", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page
        .locator(".marketplace-pane")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    if (width === 2048) await capture(page, info, "skills-dark-wide.png");
  }
  await page.setViewportSize(
    info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
  );
  await page.route("**/v1/apps/connections", (route) =>
    route.fulfill({
      status: 503,
      json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
    }),
  );
  await page
    .getByRole("navigation", { name: "Marketplace navigation" })
    .getByRole("button", { name: "Plugins", exact: true })
    .click();
  await page.reload();
  await expect(page.locator("[data-sonner-toast]")).toContainText(
    "Installation status unavailable",
  );
  await expect(page.locator(".marketplace-entry")).toHaveCount(3);
  await expect(page.locator(".marketplace-entry-state").first()).toHaveText("Status unavailable");
  await capture(page, info, "connections-error.png");
  await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: [] }));
  await page.reload();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(page.locator(".marketplace-sidebar-hint")).toHaveText("No plugins installed.");
});

test("provider pages load automatically, retain partial results and search every category", async ({
  page,
}, info) => {
  const requests: string[] = [];
  let failed = false;
  const make = (index: number) => ({
    slug: `app_${index}`,
    name: `App ${index}`,
    description: `Provider description ${index}`,
    logo: "https://assets.example.test/logo.svg",
    connected: true,
    categories: [
      { slug: "productivity", name: "Productivity" },
      ...(index === 214 ? [{ slug: "team-work", name: "Team collaboration" }] : []),
    ],
  });
  await page.route("https://assets.example.test/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="#7856ff"/></svg>',
    }),
  );
  await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/apps/catalog*", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    requests.push(cursor ?? "first");
    if (cursor === "second" && !failed) {
      failed = true;
      await route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
      return;
    }
    await route.fulfill({
      json:
        cursor === "second"
          ? {
              items: [make(0), ...Array.from({ length: 100 }, (_, i) => make(i + 100))],
              cursor: "last",
            }
          : cursor === "last"
            ? { items: Array.from({ length: 15 }, (_, i) => make(i + 200)) }
            : { items: Array.from({ length: 100 }, (_, i) => make(i)), cursor: "second" },
    });
  });
  await page.goto("/?marketplace=plugins");
  await expect(page.locator("[data-sonner-toast]")).toContainText("Could not load all plugins");
  await expect(page.locator(".marketplace-entry")).toHaveCount(6);
  await capture(page, info, "catalog-partial.png");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator(".marketplace-entry")).toHaveCount(6);
  await expect.poll(() => requests).toEqual(["first", "second", "second", "last"]);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page
    .getByRole("heading", { name: "Productivity", exact: true })
    .getByRole("button")
    .click();
  await expect(page).toHaveURL(/category=productivity/);
  await expect(page.locator(".marketplace-category-list")).toHaveAttribute(
    "data-total-count",
    "215",
  );
  const lastInBatch = page.locator(".marketplace-entry-open").filter({ hasText: /^App 23/ });
  await lastInBatch.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.locator(".marketplace-entry-open").filter({ hasText: /^App 24/ }),
  ).toBeFocused();
  await page
    .locator(".marketplace-pane")
    .evaluate((pane) => pane.scrollTo({ top: pane.scrollHeight }));
  await expect(page.locator(".marketplace-entry").filter({ hasText: "App 214" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Productivity", level: 1, exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search plugins" }).fill("team-work");
  await expect(page.locator(".marketplace-entry")).toHaveCount(1);
  await expect(page.locator(".marketplace-entry")).toContainText("Not installed");
  await expect(page.locator(".marketplace-entry img")).toHaveAttribute(
    "src",
    "https://assets.example.test/logo.svg",
  );
  expect(requests).toHaveLength(4);
  await capture(page, info, "catalog-category.png");
});

test("loading uses row skeletons and unavailable logos never fall back to local images", async ({
  page,
}, info) => {
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const localImages: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/marketplace/"))
      localImages.push(request.url());
  });
  await page.route("**/v1/apps/catalog*", async (route) => {
    await pending;
    await route.fulfill({
      json: {
        items: [
          {
            slug: "github",
            name: "GitHub",
            connected: false,
            logo: "https://assets.example.test/broken.svg",
            categories: [{ slug: "developer-tools", name: "Developer Tools" }],
          },
        ],
      },
    });
  });
  await page.route("https://assets.example.test/broken.svg", (route) => route.abort("failed"));
  await page.goto("/?marketplace=plugins");
  await expect(page.getByRole("status", { name: "Loading catalog", exact: true })).toBeVisible();
  await expect(page.locator(".marketplace-row-skeleton")).toHaveCount(6);
  await expect(page.locator("[data-slot=alert]")).toHaveCount(0);
  await capture(page, info, "plugins-loading-skeleton.png");
  release();
  await expect(page.locator(".marketplace-row-skeleton")).toHaveCount(0);
  await expect(page.locator(".marketplace-entry img")).toHaveCount(0);
  await expect(
    page.locator(".marketplace-entry .marketplace-entry-icon svg").first(),
  ).toBeVisible();
  expect(localImages).toEqual([]);
});

test("category headings open complete lists and preserve category navigation", async ({
  page,
}, info) => {
  let catalogReads = 0;
  const items = Array.from({ length: 17 }, (_, index) => ({
    slug: `tool_${index}`,
    name: `Tool ${index}`,
    description: `Useful action ${index}`,
    connected: false,
    logo: `https://assets.example.test/tool-${index}.svg`,
    categories:
      index < 8
        ? [{ slug: "developer-tools", name: "developer tools" }]
        : index < 16
          ? [{ slug: "ai-agents", name: "ai agents" }]
          : [
              { slug: "crm-sales", name: "crm & sales" },
              { slug: "developer-tools", name: "developer tools" },
            ],
  }));
  await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/apps/catalog*", (route) => {
    catalogReads++;
    return route.fulfill({ json: { items } });
  });
  await page.goto("/?marketplace=plugins");
  for (const [name, count] of [
    ["Developer Tools", 6],
    ["AI Agents", 6],
    ["CRM & Sales", 1],
  ] as const) {
    const section = page.getByRole("region", { name, exact: true });
    await section.getByRole("heading", { name, exact: true }).scrollIntoViewIfNeeded();
    await expect(section.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect(section.locator(".marketplace-entry")).toHaveCount(count);
    await expect(section.getByRole("button", { name, exact: true })).toBeEnabled();
  }
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.locator(".marketplace-pane").evaluate((pane) => pane.scrollTo({ top: 0 }));
  await expect(page.locator(".marketplace-entry img").first()).toHaveAttribute("loading", "eager");
  await expect(page.locator(".marketplace-entry").first()).toHaveCSS(
    "content-visibility",
    "visible",
  );
  await capture(page, info, "category-previews.png");
  await page.getByRole("button", { name: "Developer Tools", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/category=developer-tools/);
  await expect(
    page.getByRole("heading", { name: "Developer Tools", level: 1, exact: true }),
  ).toBeFocused();
  await expect(page.locator(".marketplace-entry")).toHaveCount(9);
  await expect(page.locator(".marketplace-category")).toHaveCount(0);
  await expect(page.locator(".marketplace-toolbar > button")).toHaveCount(0);
  await capture(page, info, "category-complete.png");
  await page.getByRole("searchbox", { name: "Search plugins" }).fill("Tool 7");
  await expect(page.locator(".marketplace-entry")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await page.locator(".marketplace-entry-open").filter({ hasText: "Tool 7" }).click();
  await expect(page).toHaveURL(/item=tool_7/);
  await expect(page).toHaveURL(/category=developer-tools/);
  await page
    .locator(".marketplace-breadcrumb")
    .getByRole("button", { name: "Developer Tools", exact: true })
    .click();
  await expect(page.locator(".marketplace-entry")).toHaveCount(9);
  await page
    .locator(".marketplace-breadcrumb")
    .getByRole("button", { name: "Plugins", exact: true })
    .click();
  await expect(page).not.toHaveURL(/category=/);
  await expect(
    page
      .getByRole("region", { name: "Developer Tools", exact: true })
      .locator(".marketplace-entry"),
  ).toHaveCount(6);
  const rail = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
  await rail.getByRole("button", { name: "Percakapan", exact: true }).click();
  await rail.getByRole("button", { name: "Marketplace", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Developer Tools", exact: true })
      .locator(".marketplace-entry"),
  ).toHaveCount(6);
  expect(catalogReads).toBe(1);
  await page.getByRole("button", { name: "AI Agents", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "AI Agents", level: 1, exact: true }),
  ).toBeVisible();
  await expect(page.locator(".marketplace-entry")).toHaveCount(8);
  expect(catalogReads).toBe(1);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Plugins", level: 1, exact: true })).toBeVisible();
  await page.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 8 * 24 * 60 * 60 * 1000;
  });
  await rail.getByRole("button", { name: "Percakapan", exact: true }).click();
  await rail.getByRole("button", { name: "Marketplace", exact: true }).click();
  await expect.poll(() => catalogReads).toBe(2);
  await expect(
    page
      .getByRole("region", { name: "Developer Tools", exact: true })
      .locator(".marketplace-entry"),
  ).toHaveCount(6);
});

test("catalog pages reveal together without waiting for slow logos and survive closing the screen", async ({
  page,
}, info) => {
  let releasePage = () => {};
  let releaseImage = () => {};
  let pageRequested = () => {};
  let imageRequested = () => {};
  const pendingPage = new Promise<void>((resolve) => {
    releasePage = resolve;
  });
  const pendingImage = new Promise<void>((resolve) => {
    releaseImage = resolve;
  });
  const secondRequested = new Promise<void>((resolve) => {
    pageRequested = resolve;
  });
  const logoRequested = new Promise<void>((resolve) => {
    imageRequested = resolve;
  });
  let reads = 0;
  const make = (index: number) => ({
    slug: `stable_${index}`,
    name: `Stable tool ${index}`,
    connected: false,
    logo: `https://assets.example.test/stable-${index}.svg`,
    categories: [{ slug: "developer-tools", name: "developer tools" }],
  });
  await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/apps/catalog*", async (route) => {
    reads++;
    if (new URL(route.request().url()).searchParams.has("cursor")) {
      pageRequested();
      await pendingPage;
      await route.fulfill({ json: { items: Array.from({ length: 6 }, (_, i) => make(i + 6)) } });
    } else
      await route.fulfill({
        json: { items: Array.from({ length: 6 }, (_, i) => make(i)), cursor: "remaining" },
      });
  });
  await page.route("https://assets.example.test/stable-0.svg", async (route) => {
    imageRequested();
    await pendingImage;
    await route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12" fill="#7856ff"/></svg>',
    });
  });
  await page.goto("/?marketplace=plugins");
  await secondRequested;
  await expect(page.locator(".marketplace-entry")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Loading catalog", exact: true })).toBeVisible();
  const rail = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
  await rail.getByRole("button", { name: "Percakapan", exact: true }).click();
  releasePage();
  await rail.getByRole("button", { name: "Marketplace", exact: true }).click();
  await logoRequested;
  await expect(page.locator(".marketplace-entry")).toHaveCount(6);
  await expect(page.locator(".marketplace-logo-skeleton").first()).toBeVisible();
  await capture(page, info, "batch-loading.png");
  releaseImage();
  await expect(page.locator(".marketplace-entry")).toHaveCount(6);
  await expect(page.locator(".marketplace-row-skeleton")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator(".marketplace-entry img")
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBe(true);
  expect(reads).toBe(2);
  await page.getByRole("button", { name: "Developer Tools", exact: true }).click();
  await expect(page.locator(".marketplace-entry")).toHaveCount(12);
  expect(reads).toBe(2);
  await capture(page, info, "batch-ready.png");
});

test("catalog survives reload for days while connection status stays live", async ({ page }) => {
  let catalogReads = 0;
  let blockCatalog = false;
  let installed = false;
  const items = Array.from({ length: 12 }, (_, index) => ({
    slug: `cached_${index}`,
    name: `Cached tool ${index}`,
    connected: true,
    logo: `https://assets.example.test/cached-${index}.svg`,
    categories: [{ slug: "developer-tools", name: "developer tools" }],
  }));
  await page.route("**/v1/apps/connections", (route) =>
    route.fulfill({
      json: installed
        ? [{ id: "cached-connection", toolkit: "cached_0", state: "active", grants: [] }]
        : [],
    }),
  );
  await page.route("**/v1/apps/catalog*", (route) => {
    catalogReads++;
    return blockCatalog ? route.abort("failed") : route.fulfill({ json: { items } });
  });
  await page.goto("/?marketplace=plugins");
  await expect(page.locator(".marketplace-entry")).toHaveCount(6);
  await expect(page.locator(".marketplace-entry-state").first()).toHaveText("Not installed");
  blockCatalog = true;
  installed = true;
  await page.addInitScript(() => {
    const now = Date.now;
    Date.now = () => now() + 6 * 60 * 60 * 1000;
  });
  await page.reload();
  await expect(page.locator(".marketplace-entry")).toHaveCount(6, { timeout: 1500 });
  await expect(page.locator(".marketplace-entry-state").first()).toHaveText("Installed");
  expect(catalogReads).toBe(1);
  installed = false;
  await page.reload();
  await expect(page.locator(".marketplace-entry-state").first()).toHaveText("Not installed");
  expect(catalogReads).toBe(1);
});

test("large catalogs keep initial rendering and logo requests near the viewport", async ({
  page,
}, info) => {
  const items = Array.from({ length: 600 }, (_, index) => ({
    slug: `large_${index}`,
    name: `Large app ${index}`,
    connected: false,
    logo: `https://assets.example.test/large-${index}.svg`,
    categories: [
      { slug: `category-${Math.floor(index / 6)}`, name: `category ${Math.floor(index / 6)}` },
    ],
  }));
  let logos = 0;
  page.on("request", (request) => {
    if (request.url().includes("assets.example.test/large-")) logos++;
  });
  await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/apps/catalog*", (route) => route.fulfill({ json: { items } }));
  const started = Date.now();
  await page.goto("/?marketplace=plugins");
  await expect(page.locator(".marketplace-entry").first()).toBeVisible();
  const metrics = {
    first_rows_ms: Date.now() - started,
    rendered_rows: await page.locator(".marketplace-entry").count(),
    requested_logos: logos,
  };
  console.log("Catalog render metrics", JSON.stringify(metrics));
  await capture(page, info, "large-catalog-initial.png");
  await info.attach("catalog-render-metrics", {
    body: JSON.stringify(metrics),
    contentType: "application/json",
  });
  expect(metrics.rendered_rows).toBeLessThanOrEqual(60);
  expect(metrics.requested_logos).toBeLessThanOrEqual(60);
  await page.getByRole("heading", { name: "Category 99", exact: true }).scrollIntoViewIfNeeded();
  await expect(
    page.locator(".marketplace-entry").filter({ hasText: "Large app 599" }),
  ).toBeVisible();
  await capture(page, info, "large-catalog-end.png");
  await page.getByRole("searchbox", { name: "Search plugins" }).fill("Large app 599");
  await expect(page.locator(".marketplace-entry")).toHaveCount(1);
  await expect(page.locator(".marketplace-entry")).toContainText("Large app 599");
});

async function seedCatalog(page: Page, value: unknown) {
  await page.evaluate(async (cached) => {
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("ngertiin-marketplace", 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore("catalog");
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction("catalog", "readwrite");
        tx.objectStore("catalog").put(cached, "metadata-v1");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  }, value);
}

test("stale cached metadata remains readable when background refresh fails", async ({
  page,
}, info) => {
  await page.goto("/");
  await seedCatalog(page, {
    version: 1,
    savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    metadataComplete: true,
    items: [
      {
        slug: "retained-app",
        name: "Retained app",
        categories: [{ slug: "productivity", name: "productivity" }],
      },
    ],
  });
  let release = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let reads = 0;
  await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: [] }));
  await page.route("**/v1/apps/catalog*", async (route) => {
    reads++;
    if (new URL(route.request().url()).searchParams.has("cursor")) {
      await pending;
      await route.fulfill({
        status: 503,
        json: { error: { code: "UNAVAILABLE", message: "Unavailable" } },
      });
    } else
      await route.fulfill({
        json: { items: [{ slug: "incomplete", name: "Partial replacement" }], cursor: "remaining" },
      });
  });
  await page.goto("/?marketplace=plugins");
  await expect(page.locator(".marketplace-entry")).toContainText("Retained app");
  await expect(page.getByRole("status", { name: "Loading catalog", exact: true })).toHaveCount(0);
  release();
  await expect(page.locator("[data-sonner-toast]")).toContainText("Could not load all plugins");
  await expect(page.locator(".marketplace-entry")).toHaveCount(1);
  await expect(page.locator(".marketplace-entry")).toContainText("Retained app");
  expect(reads).toBe(2);
  await capture(page, info, "stale-cache-offline.png");
});

test("expired and incompatible caches fall back to discovery", async ({ page }) => {
  await page.goto("/");
  let reads = 0;
  await page.route("**/v1/apps/catalog*", (route) => {
    reads++;
    return route.fulfill({
      json: { items: [{ slug: "fresh", name: "Fresh app", connected: true }] },
    });
  });
  await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: [] }));
  for (const [version, age] of [
    [2, 0],
    [1, 31 * 24 * 60 * 60 * 1000],
  ]) {
    await seedCatalog(page, {
      version,
      savedAt: Date.now() - age,
      metadataComplete: true,
      items: [{ slug: "stale", name: "Expired app" }],
    });
    await page.goto("/?marketplace=plugins");
    await expect(page.locator(".marketplace-entry")).toHaveCount(1);
    await expect(page.locator(".marketplace-entry")).toContainText("Fresh app");
    await expect(page.locator(".marketplace-entry")).toContainText("Not installed");
  }
  expect(reads).toBe(2);
});

test("storage restrictions do not prevent catalog discovery", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException("Storage disabled", "SecurityError");
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?marketplace=plugins");
  await expect(page.locator(".marketplace-entry")).toHaveCount(3);
  expect(errors).toEqual([]);
});
