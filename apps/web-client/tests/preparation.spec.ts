import { expect, type Page, test } from "@playwright/test";

async function workspace(
  page: Page,
  state: () => "ready" | "skipped" | "preparing" = () => "ready",
) {
  const calls: string[] = [];
  await page.route("**/v1/entities/agent", async (route) => {
    const response = await route.fetch();
    const agents = await response.json();
    await route.fulfill({
      json: agents.map((agent: object) => ({ ...agent, model_id: "test-model" })),
    });
  });
  await page.route("**/v1/threads/*/prepare", async (route) => {
    calls.push(new URL(route.request().url()).pathname.split("/")[3]);
    await route.fulfill({ json: { state: state() } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const threads: { id: string; name: string }[] = [];
  for (let i = 0; i < 2; i++) {
    const response = await page.request.post("/v1/agents", {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: { name: `Preparation ${crypto.randomUUID()}`, harness: "codex", connection_id: null },
    });
    expect(response.ok()).toBe(true);
    const agent = await response.json();
    const dm = await page.request.post(`/v1/agents/${agent.id}/dm`, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {},
    });
    expect(dm.ok()).toBe(true);
    threads.push({ id: (await dm.json()).id, name: agent.name });
  }
  // Keep this timing probe's roster bounded; prior tests retain their own DMs in SQLite.
  // Offscreen portrait loading belongs to the dedicated sidebar-loading cohort.
  await page.route("**/v1/entities/thread", async (route) => {
    const response = await route.fetch();
    const items = await response.json();
    await route.fulfill({
      response,
      json: items.filter((thread: { id: string }) => threads.some((item) => item.id === thread.id)),
    });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), threads[0].id);
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Detail ${threads[0].name}`, exact: true }),
  ).toBeVisible();
  await expect.poll(() => calls.filter((id) => id === threads[0].id).length).toBeGreaterThan(0);
  // Settle the real avatar/viewport work before these tests freeze browser time.
  await page
    .getByRole("navigation", { name: "Navigasi utama", exact: true })
    .getByRole("button", { name: "Percakapan", exact: true })
    .click();
  for (const thread of threads)
    await expect(page.locator(`[data-thread-id="${thread.id}"]`)).toBeVisible();
  if (await page.getByRole("main", { name: "Percakapan aktif", exact: true }).isHidden())
    await page.locator(`[data-thread-id="${threads[0].id}"]`).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
  return { calls, threads };
}

async function sidebar(page: Page) {
  const toggle = page.getByRole("button", { name: "Percakapan", exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await page.clock.runFor(50);
}

async function advanceAttempt(page: Page, milliseconds: number) {
  const response = page.waitForResponse((value) => value.url().endsWith("/prepare"));
  await page.clock.runFor(milliseconds);
  await (await response).finished();
  // Let fetch/JSON completion settle before advancing the cooldown clock again.
  await page.clock.runFor(50);
}

test("navigation and Settings do not warm the previous DM; composer activity renews the selected one", async ({
  page,
}) => {
  const { calls, threads } = await workspace(page);
  const countA = calls.filter((id) => id === threads[0].id).length;
  await page.clock.install();
  await page.clock.fastForward(200_000);
  await sidebar(page);
  await page.locator(`[data-thread-id="${threads[1].id}"]`).click();
  await expect(
    page.getByRole("button", { name: `Detail ${threads[1].name}`, exact: true }),
  ).toBeVisible();
  await page.clock.runFor(200);
  await expect.poll(() => calls.filter((id) => id === threads[1].id).length).toBe(1);
  expect(calls.filter((id) => id === threads[0].id)).toHaveLength(countA);
  await page.clock.fastForward(20_000);
  await sidebar(page);
  const beforeSettings = calls.length;
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeVisible();
  const settingsMenu = page.getByRole("combobox", { name: "Menu pengaturan", exact: true });
  if (await settingsMenu.isVisible()) await settingsMenu.selectOption("appearance");
  else await page.getByRole("link", { name: "Tampilan", exact: true }).click();
  await page.getByRole("radio", { name: "Gelap", exact: true }).click();
  await page.clock.fastForward(200_000);
  expect(calls).toHaveLength(beforeSettings);
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await page.clock.runFor(200);
  await expect.poll(() => calls.length).toBeGreaterThan(beforeSettings);
  const beforeInput = calls.length;
  await page.clock.fastForward(20_000);
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Prepare while composing.");
  await page.clock.runFor(200);
  await expect.poll(() => calls.length).toBeGreaterThan(beforeInput);
  expect(calls.at(-1)).toBe(threads[1].id);
});

test("skipped preparation retries to ready and stops instead of polling indefinitely", async ({
  page,
}) => {
  let response: "ready" | "skipped" | "preparing" = "ready";
  const { calls } = await workspace(page, () => response);
  await page.clock.install();
  await page.clock.fastForward(20_000);
  response = "skipped";
  const before = calls.length;
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Start preparation.");
  await advanceAttempt(page, 200);
  await expect.poll(() => calls.length).toBe(before + 1);
  response = "preparing";
  await advanceAttempt(page, 1100);
  await expect.poll(() => calls.length).toBe(before + 2);
  response = "ready";
  await advanceAttempt(page, 2100);
  await expect.poll(() => calls.length).toBe(before + 3);
  await page.clock.fastForward(200_000);
  expect(calls).toHaveLength(before + 3);
  response = "skipped";
  const second = calls.length;
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Retry boundedly.");
  await advanceAttempt(page, 200);
  await expect.poll(() => calls.length).toBe(second + 1);
  for (const delay of [1100, 2100, 4100, 8100]) {
    const count = calls.length;
    await advanceAttempt(page, delay);
    await expect.poll(() => calls.length).toBe(count + 1);
  }
  await page.clock.fastForward(200_000);
  expect(calls).toHaveLength(second + 5);
});

test("switching DM cancels scheduled retries from the previous selection", async ({ page }) => {
  let response: "ready" | "skipped" = "ready";
  const { calls, threads } = await workspace(page, () => response);
  await page.clock.install();
  await page.clock.fastForward(20_000);
  response = "skipped";
  const before = calls.filter((id) => id === threads[0].id).length;
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Prepare old DM.");
  await page.clock.runFor(200);
  await expect.poll(() => calls.filter((id) => id === threads[0].id).length).toBe(before + 1);
  response = "ready";
  await sidebar(page);
  await page.locator(`[data-thread-id="${threads[1].id}"]`).click();
  await expect(
    page.getByRole("button", { name: `Detail ${threads[1].name}`, exact: true }),
  ).toBeVisible();
  await page.clock.runFor(200);
  await expect.poll(() => calls.filter((id) => id === threads[1].id).length).toBe(1);
  // Cancellation starts when the selection actually changes.
  const previousCalls = calls.filter((id) => id === threads[0].id).length;
  await page.clock.fastForward(30_000);
  expect(calls.filter((id) => id === threads[0].id)).toHaveLength(previousCalls);
});
