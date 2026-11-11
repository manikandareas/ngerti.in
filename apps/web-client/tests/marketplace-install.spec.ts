import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

// Real application HTTP, domain commands, SQLite and revision/grant checks.
// Only the external Composio host and OAuth destination are deterministic fixtures.
async function post(page: Page, path: string, data: unknown = {}) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function accounts(page: Page) {
  return (await (await page.request.get("/v1/apps/connections", { maxRetries: 1 })).json()) as {
    id: string;
    revision: number;
    toolkit: string;
    state: string;
    grants: { agent_id: string; thread_id: string; tools: string[] }[];
  }[];
}
test.beforeEach(async ({ page, context }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  for (const connection of await accounts(page))
    if (connection.state !== "revoked")
      await post(page, `/v1/apps/connections/${connection.id}/revoke`);
  await context.route("https://example.invalid/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<title>Fixture authorization</title>Authorization provider fixture",
    }),
  );
});

test("desktop authorization opens the provider through the native browser bridge", async ({
  page,
}) => {
  await page.addInitScript({
    content: await readFile(
      new URL("../../desktop/src-tauri/src/bridge.js", import.meta.url),
      "utf8",
    ),
  });
  // Tauri denies new webviews, including the blank popup reserved by a browser.
  await page.addInitScript(() => {
    window.open = () => null;
  });
  const opened: string[] = [];
  await page.route("**/_desktop/open-external", async (route) => {
    opened.push(route.request().postDataJSON().url);
    await route.fulfill({ status: 204 });
  });
  await page.goto("/?marketplace=plugins&item=calendar");
  await page.getByRole("button", { name: "Install plugin", exact: true }).click();
  await expect.poll(() => opened.length, { timeout: 3000 }).toBe(1);
  expect(opened).toEqual(["https://example.invalid/fixture-connect"]);
  await expect(page).toHaveURL(/marketplace=plugins.*item=calendar/);
});

test("native browser failure can be retried without creating another connection", async ({
  page,
}) => {
  await page.addInitScript({
    content: await readFile(
      new URL("../../desktop/src-tauri/src/bridge.js", import.meta.url),
      "utf8",
    ),
  });
  await page.addInitScript(() => {
    window.open = () => null;
  });
  let opens = 0;
  let connects = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/v1/apps/connect")) connects++;
  });
  await page.route("**/_desktop/open-external", (route) =>
    route.fulfill({ status: ++opens === 1 ? 502 : 204 }),
  );
  await page.goto("/?marketplace=plugins&item=calendar");
  await page.getByRole("button", { name: "Install plugin", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]")).toContainText("Could not open the browser");
  await expect(page.getByRole("button", { name: "Installing…", exact: true })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.getByRole("button", { name: "Open browser", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  expect(opens).toBe(2);
  expect(connects).toBe(1);
  await expect(page.getByRole("button", { name: "Installed", exact: true })).toBeDisabled({
    timeout: 12000,
  });
});

test("Install, scoped access and Uninstall execute directly inside plugin detail", async ({
  page,
}, info) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") requests.push(new URL(request.url()).pathname);
  });
  await page.goto("/?marketplace=plugins&item=calendar");
  await expect(page.getByRole("heading", { name: "Calendar fixture", exact: true })).toBeVisible();
  const header = page.locator(".marketplace-detail-actions");
  await expect(header.getByRole("button")).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Install plugin", exact: true })).toBeEnabled();
  await expect(header.getByRole("button", { name: "Install plugin", exact: true })).toHaveCSS(
    "border-radius",
    "4px",
  );
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath("plugin-before-install.png"),
    animations: "disabled",
  });
  await expect(page.getByRole("button", { name: "Coba sekarang", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hubungkan", exact: true })).toHaveCount(0);
  const connected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/v1/apps/connect") && response.request().method() === "POST",
  );
  const opened = page.waitForEvent("popup");
  await header.getByRole("button", { name: "Install plugin", exact: true }).click();
  const popup = await opened;
  await expect(popup).toHaveURL("https://example.invalid/fixture-connect");
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await popup.close();
  const created = (await (await connected).json()).connection;
  await expect(page).toHaveURL(/marketplace=plugins.*item=calendar/);
  await expect(header.getByRole("button", { name: "Installed", exact: true })).toBeDisabled({
    timeout: 12000,
  });
  expect(requests.filter((path) => path === "/v1/apps/connect")).toHaveLength(1);
  expect((await accounts(page)).find((connection) => connection.id === created.id)?.grants).toEqual(
    [],
  );

  // Existing grants from another conversation must survive editing the current one.
  const other = await post(page, "/v1/creation/agents", {
    harness: "codex",
    connection_id: null,
    model_id: null,
    billing_source: "subscription",
  });
  const current = (await accounts(page)).find((connection) => connection.id === created.id);
  const foreignGrant = {
    agent_id: other.agent.id,
    thread_id: other.thread.id,
    tools: ["CALENDAR_LIST_EVENTS"],
  };
  await post(page, `/v1/apps/connections/${created.id}/assign`, {
    expected_revision: current?.revision,
    grants: [foreignGrant],
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Installed", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Manage access", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search app actions", exact: true })
    .fill("list calendar");
  await page.getByRole("button", { name: "Search actions", exact: true }).click();
  await page.getByRole("checkbox", { name: "Read upcoming calendar events", exact: true }).check();
  await page.getByRole("button", { name: "Save conversation access", exact: true }).click();
  await expect(page.getByText("Conversation access updated.", { exact: true })).toBeVisible();
  const installed = (await accounts(page)).find((connection) => connection.id === created.id);
  expect(installed?.grants).toContainEqual(foreignGrant);
  expect(installed?.grants).toHaveLength(2);
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath("plugin-installed-access.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Uninstall", exact: true }).click();
  await expect(page.getByRole("button", { name: "Install plugin", exact: true })).toBeEnabled();
  const removed = (await accounts(page)).find((connection) => connection.id === created.id);
  expect(removed?.state).toBe("revoked");
  expect(removed?.grants).toEqual(installed?.grants); // Revocation retains historical grant metadata.
  const denied = await page.request.post("/v1/apps/search", {
    data: { connection_id: created.id, query: "list calendar" },
  });
  expect(denied.ok()).toBe(false);
  await expect(page).not.toHaveURL(/settings=/);
  await page.reload();
  await expect(page.getByRole("button", { name: "Install plugin", exact: true })).toBeEnabled();
});

test("blocked OAuth and reload resume installation on the same account", async ({ page }, info) => {
  await page.addInitScript(() => {
    window.open = () => null;
  });
  await page.reload();
  await page.goto("/?marketplace=plugins&item=mail");
  const connected = page.waitForResponse(
    (response) =>
      response.url().endsWith("/v1/apps/connect") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Install plugin", exact: true }).click();
  const created = (await (await connected).json()).connection;
  await expect(page.locator("[data-sonner-toast]")).toContainText("Could not open the browser");
  await expect(page.getByRole("button", { name: "Open browser", exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({
    path: info.outputPath("plugin-install-blocked.png"),
    animations: "disabled",
  });
  await page.evaluate(() => {
    const now = Date.now;
    Date.now = () => now() + 11 * 60 * 1000;
  });
  await page.getByRole("button", { name: "Open browser", exact: true }).click();
  await expect(page.locator("[data-sonner-toast]")).toContainText(
    "The authorization link has expired",
  );
  await expect(page.getByRole("button", { name: "Install plugin", exact: true })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Install plugin", exact: true })).toBeEnabled();
  const reconnecting = page.waitForResponse((response) =>
    response.url().endsWith(`/v1/apps/connections/${created.id}/reconnect`),
  );
  await page.getByRole("button", { name: "Install plugin", exact: true }).click();
  expect((await (await reconnecting).json()).connection.id).toBe(created.id);
  await expect(page.getByRole("button", { name: "Installing…", exact: true })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.getByRole("button", { name: "Installed", exact: true })).toBeDisabled({
    timeout: 12000,
  });
  const active = (await accounts(page)).filter(
    (connection) => connection.toolkit === "mail" && connection.state !== "revoked",
  );
  expect(active).toHaveLength(1);
  expect(active[0].id).toBe(created.id);
  expect(active[0].grants).toEqual([]);
});

test("lost install acknowledgement reconciles pending state before retrying", async ({ page }) => {
  let connectCalls = 0;
  let accountId = "";
  await page.route("**/v1/apps/connect", async (route) => {
    connectCalls++;
    const response = await route.fetch();
    accountId = (await response.json()).connection.id;
    await route.abort("failed");
  });
  await page.goto("/?marketplace=plugins&item=calendar");
  await page.getByRole("button", { name: "Install plugin", exact: true }).click();
  await expect(page.getByRole("button", { name: "Install plugin", exact: true })).toBeEnabled();
  expect(connectCalls).toBe(1);
  expect(
    (await accounts(page)).filter(
      (connection) => connection.toolkit === "calendar" && connection.state !== "revoked",
    ),
  ).toHaveLength(1);
  const reconnected = page.waitForResponse((response) =>
    response.url().endsWith(`/v1/apps/connections/${accountId}/reconnect`),
  );
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Install plugin", exact: true }).click();
  await (await opened).close();
  expect((await (await reconnected).json()).connection.id).toBe(accountId);
  await expect(page.getByRole("button", { name: "Installing…", exact: true })).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(page.getByRole("button", { name: "Installed", exact: true })).toBeDisabled({
    timeout: 12000,
  });
  expect(connectCalls).toBe(1);
});

test("group access editing preserves the other member's grants", async ({ page }) => {
  const draft = {
    harness: "codex",
    connection_id: null,
    model_id: null,
    billing_source: "subscription",
  };
  const first = await post(page, "/v1/creation/agents", draft);
  const second = await post(page, "/v1/creation/agents", draft);
  const group = await post(page, "/v1/creation/groups", {
    name: "Plugin access group",
    member_agent_ids: [first.agent.id, second.agent.id],
  });
  const created = await post(page, "/v1/apps/connect", { toolkit: "calendar" });
  const active = await post(page, `/v1/apps/connections/${created.connection.id}/refresh`);
  const preserved = {
    agent_id: second.agent.id,
    thread_id: group.thread.id,
    tools: ["CALENDAR_LIST_EVENTS"],
  };
  await post(page, `/v1/apps/connections/${active.id}/assign`, {
    expected_revision: active.revision,
    grants: [preserved],
  });
  await page.reload();
  const rail = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
  await rail.getByRole("button", { name: "Percakapan", exact: true }).click();
  await page.locator(`[data-thread-id="${group.thread.id}"]`).click();
  await rail.getByRole("button", { name: "Marketplace", exact: true }).click();
  await page.locator(".marketplace-entry-open").filter({ hasText: "Calendar fixture" }).click();
  await page.getByRole("button", { name: "Manage access", exact: true }).click();
  await page.getByLabel("Agent with access", { exact: true }).selectOption(first.agent.id);
  await page
    .getByRole("textbox", { name: "Search app actions", exact: true })
    .fill("list calendar");
  await page.getByRole("button", { name: "Search actions", exact: true }).click();
  await page.getByRole("checkbox", { name: "Read upcoming calendar events", exact: true }).check();
  await page.getByRole("button", { name: "Save conversation access", exact: true }).click();
  await expect(page.getByText("Conversation access updated.", { exact: true })).toBeVisible();
  const saved = (await accounts(page)).find((connection) => connection.id === active.id);
  expect(saved?.grants).toEqual(
    expect.arrayContaining([
      preserved,
      { agent_id: first.agent.id, thread_id: group.thread.id, tools: ["CALENDAR_LIST_EVENTS"] },
    ]),
  );
  expect(saved?.grants).toHaveLength(2);
});

test("connection changes refresh installation status without following conversation changes", async ({
  page,
}) => {
  let reads = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/v1/apps/connections") reads++;
  });
  await page.goto("/?marketplace=plugins");
  const row = page.locator(".marketplace-entry").filter({ hasText: "Calendar fixture" });
  await expect(row).toContainText("Not installed");
  // Wait for the initial workspace projection so this checks event invalidation, not boot requests.
  await expect.poll(() => reads).toBeGreaterThan(0);
  const agents = await (await page.request.get("/v1/entities/agent")).json();
  const before = agents[0];
  const refreshed = page.waitForResponse((response) => response.url().endsWith("/snapshot"));
  await post(page, `/v1/agents/${before.id}/configuration`, {
    expected_revision: before.revision,
    changes: { name: before.name },
  });
  await refreshed;
  await page.waitForTimeout(100);
  const baseline = reads;
  const current = await (await page.request.get(`/v1/entities/agent`)).json();
  await post(page, `/v1/agents/${before.id}/configuration`, {
    expected_revision: current.find((agent: { id: string }) => agent.id === before.id).revision,
    changes: { name: before.name },
  });
  // The real agent event advances the conversation snapshot, but is unrelated to app connections.
  await page.waitForTimeout(700);
  expect(reads).toBe(baseline);
  const created = await post(page, "/v1/apps/connect", { toolkit: "calendar" });
  await post(page, `/v1/apps/connections/${created.connection.id}/refresh`);
  await expect(row).toContainText("Installed");
  await expect(
    page.getByRole("navigation", { name: "Installed plugins", exact: true, includeHidden: true }),
  ).toContainText("Calendar fixture");
  await post(page, `/v1/apps/connections/${created.connection.id}/revoke`);
  await expect(row).toContainText("Not installed");
  await expect(
    page.getByRole("navigation", { name: "Installed plugins", exact: true, includeHidden: true }),
  ).not.toContainText("Calendar fixture");
});
