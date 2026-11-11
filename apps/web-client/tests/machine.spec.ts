import { expect, test } from "@playwright/test";

test("shared desktop supports native viewing, takeover, handback and working files", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const sockets: WebSocket[] = [];
    Object.assign(window, { __testComputerSockets: sockets });
    window.WebSocket = new Proxy(window.WebSocket, {
      construct(target, args) {
        const socket = Reflect.construct(target, args) as WebSocket;
        sockets.push(socket);
        return socket;
      },
    });
  });
  const errors: string[] = [];
  let renewals = 0;
  page.on("response", (response) => {
    if (response.url().includes("/renew") && response.ok()) renewals++;
  });
  await page.route("**/v1/machine/view", async (route) => {
    const response = await route.fetch();
    const view = await response.json();
    await route.fulfill({
      response,
      json: { ...view, expires_at: new Date(Date.now() + 65_000).toISOString() },
    });
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Detail Tobi", exact: true }).click();
  await page.getByRole("tab", { name: "Computer", exact: true }).click();
  await expect(page.getByRole("button", { name: "View desktop", exact: true })).toBeEnabled();
  await expect(page.locator('[data-computer-live="true"]')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("computer-panel-live.png") });
  const panelFrame = page.locator('iframe[title="Agent desktop"]').first();
  await expect(panelFrame.contentFrame().locator(".cua-toolbar")).toHaveCSS("display", "none");
  await expect(page.getByText("Live · View only", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reconnect view", exact: true })).toHaveCount(0);
  const originalSource = await panelFrame.getAttribute("src");
  await expect.poll(() => renewals, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(await panelFrame.getAttribute("src")).toBe(originalSource);
  await panelFrame
    .contentFrame()
    .locator("body")
    .evaluate(() => {
      const sockets = (window as unknown as { __testComputerSockets: WebSocket[] })
        .__testComputerSockets;
      for (const socket of sockets)
        if (socket.readyState === WebSocket.OPEN)
          socket.close(4001, "Verification transport detach");
    });
  await expect(page.locator('[data-computer-live="false"]')).toBeVisible({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath("computer-reconnecting.png") });

  await expect(page.locator('[data-computer-live="true"]')).toBeVisible({ timeout: 30_000 });
  expect(await panelFrame.getAttribute("src")).toBe(originalSource);
  await page.screenshot({ path: testInfo.outputPath("computer-recovered.png") });
  await page.getByRole("button", { name: "View desktop", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Shared desktop", exact: true });
  const screen = dialog.frameLocator('iframe[title="Agent desktop"]');
  await expect(screen.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(page.getByRole("button", { name: "Return control", exact: true })).toBeVisible();
  await expect(screen.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await screen
    .locator("canvas")
    .first()
    .click({ position: { x: 110, y: 100 } });
  await page.screenshot({
    path: testInfo.outputPath("computer-interactive.png"),
  });
  await page.getByRole("button", { name: "Return control", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take control", exact: true })).toBeVisible();
  expect((await (await page.request.get("/v1/machine")).json()).lease.holder).toBe("none");
  await expect(screen.locator(".cua-toolbar")).not.toHaveCSS("display", "none");
  await expect(screen.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(page.getByRole("button", { name: "Return control", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get("/v1/machine")).json()).lease.holder)
    .toBe("none");
  await page.getByRole("button", { name: "Working files", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Working files", exact: true })).toBeVisible();
  await page.getByRole("treeitem", { name: "projects", exact: true }).click();
  await page.getByRole("treeitem", { name: "desktop-check.txt", exact: true }).click();
  const fileViewer = page.locator("[data-content-viewer]");
  await expect(fileViewer).toContainText("Shared desktop working file.");
  await fileViewer.getByRole("button", { name: "Kembali", exact: true }).click();
  await page.getByRole("treeitem", { name: "projects", exact: true }).click();
  await expect(page.getByRole("treeitem", { name: "projects", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("button", { name: "Back to Computer", exact: true }).click();
  const status = await (await page.request.get("/v1/machine")).json();
  expect(status.state).toBe("ready");
  expect(errors).toEqual([]);
});

test("active computer activity and side panel use independent live previews; finished history remains a card", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  async function post(path: string, data: unknown) {
    const response = await page.request.post(path, {
      data,
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  await page.goto("/");
  const connection = await post("/v1/connections", {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = await post("/v1/agents", {
    name: `Computer proof ${testInfo.project.name}`,
    harness: "codex",
    connection_id: connection.id,
    model_id: "fixture",
    billing_source: "subscription",
  });
  const thread = await post(`/v1/agents/${agent.id}/dm`, {});
  const admitted = await post("/v1/runs", {
    agent_id: agent.id,
    thread_id: thread.id,
    text: "fixture computer live",
  });
  const open = page.getByRole("button", { name: "Percakapan", exact: true });
  if (await open.isVisible()) await open.click();
  await page
    .getByRole("navigation", { name: "Percakapan", exact: true })
    .getByRole("button")
    .filter({ has: page.getByText(agent.name, { exact: true }) })
    .click();
  const card = page.locator(`[data-computer-activity="${admitted.run.id}"]`);
  await expect(card.locator('[data-computer-live="true"]')).toBeVisible({ timeout: 30_000 });
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("computer-conversation-live.png") });
  await expect(card.locator("iframe").contentFrame().locator(".cua-toolbar")).toHaveCSS(
    "display",
    "none",
  );
  await expect(card.getByRole("button", { name: "Reconnect view", exact: true })).toHaveCount(0);
  const cardSource = await card.locator("iframe").getAttribute("src");
  await card.getByRole("button", { name: "Open Computer", exact: true }).click();
  const panel = page.locator("#conversation-details");
  await expect(panel.locator('[data-computer-live="true"]')).toBeVisible({ timeout: 15_000 });
  expect(await panel.locator("iframe").getAttribute("src")).not.toBe(cardSource);
  await page.screenshot({ path: testInfo.outputPath("computer-card-and-panel.png") });
  await panel.locator("[data-panel-close]").click();
  await expect(card.locator('[data-computer-live="true"]')).toBeVisible();
  expect(await card.locator("iframe").getAttribute("src")).toBe(cardSource);
  await expect
    .poll(
      async () =>
        (await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json()).runs.find(
          (run: { id: string }) => run.id === admitted.run.id,
        ).status,
      { timeout: 30_000 },
    )
    .toBe("succeeded");
  await expect(card).toHaveAttribute("data-computer-state", "completed");
  await expect(card.getByText("Activity finished", { exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Open Computer", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("main", { name: "Percakapan aktif", exact: true }).locator("iframe"),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("computer-conversation-finished.png") });
});
