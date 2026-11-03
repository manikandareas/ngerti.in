import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function settled(page: Page) {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

for (const mode of ["light", "dark"] as const) {
  test(`${mode}: unified sidebar shows latest messages and live activity in unopened DMs and groups`, async ({
    page,
  }, info) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("ngertiin-web-client-theme", theme),
      mode,
    );
    let activity: {
      agent_id: string;
      thread_id: string;
      run_id: string;
      status: string;
      activity: string;
      waiting_for_user: boolean;
    }[] = [];
    await page.route("**/v1/agents/activity", async (route) => {
      const response = await route.fetch();
      const value = await response.json();
      await route.fulfill({ response, json: { ...value, items: activity } });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
    const setup = await post(page, "/v1/setup", {});
    const agent = await post(page, "/v1/agents", {
      name: `Sidebar peer ${crypto.randomUUID()}`,
      harness: "codex",
      connection_id: null,
    });
    const dm = await post(page, `/v1/agents/${agent.id}/dm`, {});
    const group = await post(page, "/v1/threads", {
      type: "group",
      member_agent_ids: [setup.agent_id, agent.id],
    });
    await post(page, `/v1/groups/${group.id}/configuration`, {
      expected_revision: group.revision,
      changes: { name: "Marketing Tim" },
    });
    await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), setup.thread_id);
    await page.reload();
    const mobile = info.project.name === "mobile";
    if (mobile) await page.getByRole("button", { name: "Buka percakapan", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Percakapan", exact: true });
    const row = (id: string) => nav.locator(`[data-thread-id="${id}"]`);
    const preview = (id: string) => row(id).locator(".contact-description");
    await expect(row(setup.thread_id)).toContainText("Tobi");
    await expect(page.locator(".primary-contact")).toHaveCount(0);
    await expect(preview(dm.id)).toHaveText("Belum ada pesan");
    await expect(preview(group.id)).toHaveText("Belum ada pesan");
    await expect(row(dm.id).locator(":scope > .agent-avatar")).toHaveCSS("width", "44px");
    await expect(row(group.id).locator(".agent-avatar .agent-avatar").first()).toHaveCSS(
      "width",
      "32px",
    );
    const add = page.getByRole("button", { name: "Buat baru", exact: true });
    if (mobile) {
      const drawer = page.getByRole("dialog", { name: "Percakapan", exact: true });
      await expect(drawer).toHaveAttribute("data-slot", "drawer-content");
      await expect(drawer).toHaveAttribute("data-vaul-drawer-direction", "bottom");
      await settled(page);
      const bounds = await drawer.boundingBox();
      const addBounds = await add.boundingBox();
      expect(bounds && addBounds && addBounds.x - bounds.x < 24).toBeTruthy();
      expect(bounds && bounds.y > 0).toBeTruthy();
      await drawer.getByRole("button", { name: "Close", exact: true }).click();
      await expect(drawer).toBeHidden();
      await expect(
        page.getByRole("button", { name: "Buka percakapan", exact: true }),
      ).toBeFocused();
      await page.getByRole("button", { name: "Buka percakapan", exact: true }).click();
      await expect(drawer).toBeVisible();
    }
    expect(await add.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    await add.click();
    await expect(page.getByRole("button", { name: "Create agent", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    const first = await post(page, "/v1/runs", {
      thread_id: dm.id,
      agent_id: agent.id,
      text: "Latest DM message",
    });
    await expect(preview(dm.id)).toHaveText("Kamu: Latest DM message");
    await post(page, `/v1/groups/${group.id}/messages`, { text: "Latest group\nmessage" });
    await expect(preview(group.id)).toHaveText("Kamu: Latest group message");
    const second = await post(page, "/v1/runs", {
      thread_id: dm.id,
      agent_id: agent.id,
      text: "A newer message",
    });
    await expect(preview(dm.id)).toHaveText("Kamu: A newer message");
    const edited = await post(page, `/v1/messages/${second.message.id}/edit`, {
      expected_revision: second.message.revision,
      text: "Edited latest message",
    });
    await expect(preview(dm.id)).toHaveText("Kamu: Edited latest message");
    await post(page, `/v1/messages/${second.message.id}/delete`, {
      expected_revision: edited.revision,
    });
    await expect(preview(dm.id)).toHaveText(`Kamu: ${first.message.text}`);

    async function refreshActivity() {
      const current = await page.request
        .get(`/v1/entities/agent/${agent.id}`)
        .then((response) => response.json());
      await post(page, `/v1/agents/${agent.id}/configuration`, {
        expected_revision: current.revision,
        changes: { soul: current.soul },
      });
    }
    activity = [
      {
        agent_id: agent.id,
        thread_id: dm.id,
        run_id: first.run.id,
        status: "running",
        activity: "generating",
        waiting_for_user: false,
      },
    ];
    await refreshActivity();
    await expect(preview(dm.id)).toHaveText("Thinking it through…");
    await expect(preview(group.id)).toHaveText("Kamu: Latest group message");
    activity = [
      { ...activity[0], status: "queued" },
      {
        agent_id: setup.agent_id,
        thread_id: group.id,
        run_id: crypto.randomUUID(),
        status: "running",
        activity: "tool_running",
        waiting_for_user: false,
      },
      {
        agent_id: agent.id,
        thread_id: group.id,
        run_id: crypto.randomUUID(),
        status: "queued",
        activity: "idle",
        waiting_for_user: false,
      },
    ];
    await refreshActivity();
    await expect(preview(dm.id)).toHaveText("Waiting to start…");
    await expect(preview(group.id)).toHaveText("Tobi: Working on it…");
    activity[1] = { ...activity[1], waiting_for_user: true };
    await refreshActivity();
    await expect(preview(group.id)).toHaveText("Tobi: Waiting for your reply…");
    await settled(page);
    await page.screenshot({ path: info.outputPath(`sidebar-${mode}-working.png`) });
    activity = [];
    await refreshActivity();
    await expect(preview(dm.id)).toHaveText("Kamu: Latest DM message");
    await expect(preview(group.id)).toHaveText("Kamu: Latest group message");
    await page.reload();
    if (mobile) await page.getByRole("button", { name: "Buka percakapan", exact: true }).click();
    await expect(preview(dm.id)).toHaveText("Kamu: Latest DM message");
    await expect(preview(group.id)).toHaveText("Kamu: Latest group message");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await settled(page);
    await page.screenshot({ path: info.outputPath(`sidebar-${mode}-latest.png`) });
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.unrouteAll({ behavior: "wait" });
  });
}
