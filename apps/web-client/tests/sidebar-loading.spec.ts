import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function openNavigation(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  return page.getByRole("navigation", { name: "Percakapan", exact: true });
}

test("keeps the sidebar skeleton until data and visible DM/group avatars are ready together", async ({
  page,
}, info) => {
  const setup = await post(page, "/v1/setup", {});
  const peer = await post(page, "/v1/agents", {
    name: `Loading ${crypto.randomUUID()}`,
    harness: "codex",
    connection_id: null,
  });
  const dm = await post(page, `/v1/agents/${peer.id}/dm`, {});
  const group = await post(page, "/v1/threads", {
    type: "group",
    member_agent_ids: [setup.agent_id, peer.id],
  });
  await page.route("**/v1/entities/thread", async (route) => {
    const response = await route.fetch();
    const threads = await response.json();
    await route.fulfill({
      response,
      json: threads.filter((thread: { id: string }) =>
        [setup.thread_id, dm.id, group.id].includes(thread.id),
      ),
    });
  });
  let releaseData = () => {};
  const dataGate = new Promise<void>((resolve) => {
    releaseData = resolve;
  });
  await page.route(/\/v1\/(entities\/agent|conversations\/previews)$/, async (route) => {
    const response = await route.fetch();
    await dataGate;
    await route.fulfill({ response });
  });
  await page.addInitScript(() => {
    const audit = {
      pendingTextures: 0,
      released: false,
      release: () => {},
      violations: [] as { title: string | null; hosts: number; ready: number }[],
    };
    (window as unknown as { sidebarAudit: typeof audit }).sidebarAudit = audit;
    const waiting: (() => void)[] = [];
    audit.release = () => {
      audit.released = true;
      for (const resolve of waiting.splice(0)) resolve();
    };
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      if (this.src.startsWith("blob:") && !audit.released) {
        audit.pendingTextures++;
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      return decode.call(this);
    };
    const sample = () => {
      for (const row of document.querySelectorAll(
        'nav[aria-label="Percakapan"] [data-thread-id]',
      )) {
        if (getComputedStyle(row).visibility !== "visible") continue;
        const hosts = row.querySelectorAll(".ngertiin-avatar").length;
        const ready = row.querySelectorAll('.ngertiin-avatar[data-avatar-ready="true"]').length;
        if (hosts !== ready && audit.violations.length < 20)
          audit.violations.push({ title: row.textContent, hosts, ready });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.goto("/");
  const nav = await openNavigation(page, info.project.name === "mobile");
  const skeleton = nav.getByRole("status", { name: "Memuat percakapan", exact: true });
  await expect(skeleton).toBeVisible();
  releaseData();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { sidebarAudit: { pendingTextures: number } }).sidebarAudit
            .pendingTextures,
      ),
    )
    .toBeGreaterThan(0);
  await expect(skeleton).toBeVisible();
  await expect(nav.locator(`[data-thread-id="${dm.id}"]`)).toBeHidden();
  await page.screenshot({ path: info.outputPath("sidebar-skeleton.png") });
  await page.evaluate(() =>
    (window as unknown as { sidebarAudit: { release: () => void } }).sidebarAudit.release(),
  );
  await expect(skeleton).toHaveCount(0);
  await expect(nav.locator(`[data-thread-id="${dm.id}"]`)).toBeVisible();
  const groupRow = nav.locator(`[data-thread-id="${group.id}"]`);
  await expect(groupRow).toBeVisible();
  await expect(groupRow.locator("[data-avatar-surface] image")).toHaveCount(2);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { sidebarAudit: { violations: unknown[] } }).sidebarAudit.violations,
    ),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath("sidebar-ready.png") });
  // A live refresh keeps the already visible roster in place.
  const current = await page.request.get(`/v1/entities/agent/${peer.id}`).then((r) => r.json());
  const nextName = `Ready ${crypto.randomUUID().slice(0, 8)}`;
  await post(page, `/v1/agents/${peer.id}/configuration`, {
    expected_revision: current.revision,
    changes: { name: nextName },
  });
  await expect(nav.locator(`[data-thread-id="${dm.id}"]`)).toContainText(nextName);
  await expect(skeleton).toHaveCount(0);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { sidebarAudit: { violations: unknown[] } }).sidebarAudit.violations,
    ),
  ).toEqual([]);
});

test("failed avatar textures settle to the shaded fallback with reduced motion", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      return this.src.startsWith("blob:")
        ? Promise.reject(new Error("Texture unavailable"))
        : decode.call(this);
    };
  });
  await page.goto("/");
  const nav = await openNavigation(page, info.project.name === "mobile");
  const row = nav.locator("[data-thread-id]").first();
  await expect(row).toBeVisible();
  await expect(nav.getByRole("status", { name: "Memuat percakapan", exact: true })).toHaveCount(0);
  await expect(row.locator('.ngertiin-avatar[data-avatar-ready="true"]')).toHaveCount(1);
  await expect(row.locator(".ngertiin-avatar > svg")).toHaveCount(1);
  await expect(row.locator("[data-avatar-surface] image")).toHaveCount(0);
});

test("a long roster reveals its first viewport without waiting for offscreen avatars", async ({
  page,
}, info) => {
  let lastThread = "";
  for (let i = 0; i < 18; i++) {
    const agent = await post(page, "/v1/agents", {
      name: `Roster ${crypto.randomUUID()}`,
      harness: "codex",
      connection_id: null,
    });
    lastThread = (await post(page, `/v1/agents/${agent.id}/dm`, {})).id;
  }
  await page.goto("/");
  const nav = await openNavigation(page, info.project.name === "mobile");
  await expect(nav.locator("[data-thread-id]").first()).toBeVisible();
  await expect(nav.getByRole("status", { name: "Memuat percakapan", exact: true })).toHaveCount(0);
  const last = nav.locator(`[data-thread-id="${lastThread}"]`);
  await expect(last.locator(".ngertiin-avatar > svg")).toHaveCount(0);
  await nav.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(last).toBeVisible();
  await expect(last.locator('.ngertiin-avatar[data-avatar-ready="true"]')).toHaveCount(1);
  await nav.evaluate((element) => {
    element.scrollTop = 0;
  });
  const first = nav.locator("[data-thread-id]").first();
  await expect(first).toBeVisible();
  await expect(first.locator('.ngertiin-avatar[data-avatar-ready="true"]')).toHaveCount(1);
  await expect(first.locator(".ngertiin-avatar > svg")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
