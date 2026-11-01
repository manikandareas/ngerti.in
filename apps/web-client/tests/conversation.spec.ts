import { expect, type Page, test } from "@playwright/test";

async function sidebar(page: Page) {
  const button = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await button.isVisible()) await button.click();
}
async function createAgent(page: Page) {
  await sidebar(page);
  await page.getByRole("button", { name: "Buat baru" }).click();
  await expect(page.getByRole("button", { name: "Create group", exact: true })).toBeDisabled();
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/v1/creation/agents") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const created = await (await response).json();
  await expect(page.getByRole("button", { name: `Detail ${created.agent.name}` })).toBeVisible();
  await expect(
    page.getByText("Help me get started with what you can do.", { exact: false }),
  ).toBeVisible();
  return created;
}

test("real API: create, durable opener, queued edit/delete, memory, panel and reload", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi" })).toBeVisible();
  const created = await createAgent(page);
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Remember to keep answers concise.");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  const queued = page
    .locator('[data-slot="message"]')
    .filter({ hasText: "Remember to keep answers concise." });
  await expect(queued).toBeVisible();
  await queued.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Edit pesan" }).fill("Keep answers concise and useful.");
  await page.getByRole("button", { name: "Simpan pesan" }).click();
  await expect(page.getByRole("dialog", { name: "Edit pesan menunggu" })).toBeHidden();
  await expect(page.getByText("Keep answers concise and useful.", { exact: true })).toBeVisible();
  await page
    .locator('[data-slot="message"]')
    .filter({ hasText: "Keep answers concise and useful." })
    .getByRole("button", { name: "Hapus", exact: true })
    .click();
  await expect(page.getByText("Keep answers concise and useful.", { exact: true })).toHaveCount(0);
  const before = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  await page.reload();
  await expect(page.getByRole("button", { name: `Detail ${created.agent.name}` })).toBeVisible();
  const after = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  expect(after.messages.length).toBe(before.messages.length);
  expect(after.runs.length).toBe(before.runs.length);
  const memory = await page.request.post("/v1/learning/memories/write", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      context: { agent_id: created.agent.id, thread_id: created.thread.id },
      memory_id: crypto.randomUUID(),
      expected_revision: 0,
      visibility: "dm_private",
      text: "Prefers concise explanations.",
    },
  });
  expect(memory.ok()).toBeTruthy();
  await page.getByRole("button", { name: `Detail ${created.agent.name}` }).click();
  await expect(page.getByRole("tab", { name: "Agent", exact: true })).toBeVisible();
  await expect(page.getByText("Prefers concise explanations.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Koreksi", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Koreksi memory" })
    .fill("Prefers short Indonesian explanations.");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(
    page.getByText("Prefers short Indonesian explanations.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hapus memory" }).click();
  await expect(
    page.getByText("Prefers short Indonesian explanations.", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-panel.png`),
  });
  await page
    .getByRole("button", {
      name: testInfo.project.name === "mobile" ? "Close" : "Tutup detail",
      exact: true,
    })
    .click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`${testInfo.project.name}-chat.png`),
  });
  expect(errors).toEqual([]);
});

test("lost acknowledgement reuses exact creation operation across reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi" })).toBeVisible();
  let saved: { agent: { id: string; name: string }; thread: { id: string } } | undefined;
  let key: string | undefined;
  await page.route("**/v1/creation/agents", async (route) => {
    key = route.request().headers()["idempotency-key"];
    const response = await route.fetch();
    saved = await response.json();
    await route.abort("failed");
  });
  await sidebar(page);
  await page.getByRole("button", { name: "Buat baru" }).click();
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect.poll(() => key).toBeTruthy();
  await expect.poll(() => saved?.agent.id).toBeTruthy();
  await page.unroute("**/v1/creation/agents");
  await page.reload();
  await expect(page.getByRole("button", { name: "Detail Tobi" })).toBeVisible();
  const created = await createAgent(page);
  expect(created.agent.id).toBe(saved?.agent.id);
  const snapshot = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  expect(snapshot.messages).toHaveLength(1);
  expect(snapshot.runs).toHaveLength(1);
});

test("loopback bridge refuses cross-origin requests", async ({ request }) => {
  const response = await request.post("/v1/setup", {
    headers: { Origin: "https://example.com", "Idempotency-Key": crypto.randomUUID() },
    data: {},
  });
  expect(response.status()).toBe(403);
});

test("lost message acknowledgement remains recoverable after reload without duplicate admission", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi" })).toBeVisible();
  const created = await createAgent(page);
  let stored = false;
  await page.route("**/v1/runs", async (route) => {
    await route.fetch();
    stored = true;
    await route.abort("failed");
  });
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("A durable message.");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect.poll(() => stored).toBeTruthy();
  await page.unroute("**/v1/runs");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveValue(
    "A durable message.",
  );
  await page.getByRole("button", { name: "Periksa pengiriman", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveValue("");
  const state = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  expect(
    state.messages.filter((message: { text: string }) => message.text === "A durable message."),
  ).toHaveLength(1);
  expect(state.runs).toHaveLength(2);
});

test("cancelled opening can continue in the same chat without another opener", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi" })).toBeVisible();
  const created = await createAgent(page);
  const cancelled = await page.request.post(`/v1/runs/${created.run.id}/cancel`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {},
  });
  expect(cancelled.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Lanjutkan pembuka", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lanjutkan pembuka", exact: true })).toHaveCount(0);
  const state = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  expect(state.messages).toHaveLength(1);
  expect(state.runs).toHaveLength(2);
  await expect(page.getByText("Menunggu", { exact: true })).toBeVisible();
  await expect(page.getByText("Dihentikan", { exact: true })).toHaveCount(0);
});
