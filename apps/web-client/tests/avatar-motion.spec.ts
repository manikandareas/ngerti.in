import { expect, type Locator, type Page, test } from "@playwright/test";
import { withTimeline } from "./conversation-fixture.js";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

async function expectIdle(avatar: Locator) {
  await avatar.scrollIntoViewIfNeeded();
  const body = avatar.locator("[data-avatar-body]");
  await expect(body).toBeVisible();
  const pose = await body.getAttribute("transform");
  await expect.poll(() => body.getAttribute("transform")).not.toBe(pose);
}

async function gazeX(avatar: Locator) {
  return avatar.locator("[data-avatar-gaze]").evaluate((element) => {
    return (element as SVGGElement).transform.baseVal.consolidate()?.matrix.e ?? 0;
  });
}

async function expectGaze(page: Page, avatars: Locator) {
  const finePointer = await page.evaluate(
    () => matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  await page.mouse.move(1, 1);
  for (const avatar of await avatars.all()) {
    if (!finePointer) {
      await expect.poll(async () => Math.abs(await gazeX(avatar))).toBeLessThanOrEqual(4.5);
      continue;
    }
    await expect.poll(() => gazeX(avatar)).toBeLessThan(-5);
  }
  await page.mouse.move((page.viewportSize()?.width ?? 1440) - 1, 500);
  if (finePointer) {
    for (const avatar of await avatars.all()) {
      await expect.poll(() => gazeX(avatar)).toBeGreaterThan(5);
    }
  }
}

test("sidebar portraits idle independently and group conversation portraits share pointer tracking", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const add = document.addEventListener.bind(document);
    const remove = document.removeEventListener.bind(document);
    document.addEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === "pointermove") listeners.add(listener);
      add(type, listener, options);
    };
    document.removeEventListener = (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === "pointermove") listeners.delete(listener);
      remove(type, listener, options);
    };
    Object.defineProperty(window, "avatarPointerListeners", { get: () => listeners.size });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const initialPointerListeners = await page.evaluate(
    () => (window as unknown as { avatarPointerListeners: number }).avatarPointerListeners,
  );
  const agents = await page.request.get("/v1/entities/agent").then((response) => response.json());
  const tobi = agents.find((agent: { system_role: string }) => agent.system_role === "tobi");
  const peer = await post(page, "/v1/agents", {
    name: "Motion peer",
    harness: "codex",
    connection_id: null,
  });
  const group = await post(page, "/v1/threads", {
    type: "group",
    member_agent_ids: [tobi.id, peer.id],
  });
  await page.route(`**/v1/threads/${group.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    await route.fulfill({
      response,
      json: withTimeline({
        ...snapshot,
        messages: Array.from({ length: 40 }, (_, index) => ({
          id: `motion-answer-${index}`,
          revision: 1,
          created_at: new Date(1700000000000 + index).toISOString(),
          thread_id: group.id,
          author: "agent",
          author_agent_id: index % 2 ? peer.id : tobi.id,
          text: `Reply ${index}: this completed reply keeps its portrait interactive.`,
          state: "complete",
          run_id: null,
          artifact_ids: [],
          purpose: "conversation",
        })),
      }),
    });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
  await page.reload();
  await expect(page.locator(".header-identity .ngertiin-avatar")).toHaveCount(2);
  const sidebarToggle = page.getByRole("button", { name: "Percakapan", exact: true });
  if (await sidebarToggle.isVisible()) await sidebarToggle.click();
  const navigation = page.getByRole("navigation", { name: "Percakapan", exact: true });
  await expectIdle(navigation.locator(`[data-agent-id="${tobi.id}"] .ngertiin-avatar`).first());
  const groupPortraits = navigation.locator(`[data-thread-id="${group.id}"] .ngertiin-avatar`);
  await expect(groupPortraits).toHaveCount(2);
  await expectIdle(groupPortraits.first());
  await expectIdle(groupPortraits.last());
  expect(
    await groupPortraits.first().locator("[data-avatar-body]").getAttribute("transform"),
  ).not.toBe(await groupPortraits.last().locator("[data-avatar-body]").getAttribute("transform"));
  if (info.project.name === "mobile") {
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }

  const header = page.locator(".header-identity .ngertiin-avatar");
  await expect(header).toHaveCount(2);
  await expectGaze(page, header);
  const reply = page.locator("#message-motion-answer-39 .ngertiin-avatar");
  await expectIdle(reply);
  await expectGaze(page, reply);
  // Older, offscreen replies do not keep a mounted animation or a pointer subscriber.
  await expect(page.locator("#message-motion-answer-0 .ngertiin-avatar svg")).toHaveCount(0);
  const pointerWork = await page.evaluate(() => {
    let reads = 0;
    const original = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      if (this.classList.contains("ngertiin-avatar")) reads++;
      return original.call(this);
    };
    try {
      for (let index = 0; index < 200; index++) {
        document.dispatchEvent(
          new PointerEvent("pointermove", { pointerType: "mouse", clientX: index, clientY: 50 }),
        );
      }
      return {
        synchronousBoundsReads: reads,
        listeners: (window as unknown as { avatarPointerListeners: number }).avatarPointerListeners,
      };
    } finally {
      Element.prototype.getBoundingClientRect = original;
    }
  });
  expect(pointerWork).toEqual({ synchronousBoundsReads: 0, listeners: initialPointerListeners });
  await info.attach("avatar-pointer-work.json", {
    contentType: "application/json",
    body: JSON.stringify({ initialPointerListeners, ...pointerWork, replies: 40 }),
  });
  await page.locator(".header-identity").click();
  const panel = page.locator(".context-hero .ngertiin-avatar");
  await expect(panel).toHaveCount(2);
  await expectIdle(panel.first());
  await expectGaze(page, panel);
  await page.getByRole("button", { name: "Member profile Tobi", exact: true }).click();
  const profile = page
    .getByRole("button", { name: "Sapa Tobi", exact: true })
    .locator(".ngertiin-avatar");
  await expectIdle(profile);
  await expectGaze(page, profile);
  await page.screenshot({ path: info.outputPath("group-avatar-motion.png") });
});

test("DM gaze resets on exit and motion preferences stop and resume idle animation", async ({
  page,
}, info) => {
  await page.goto("/");
  const header = page.locator(".header-identity .ngertiin-avatar");
  await expectIdle(header);
  await expectGaze(page, header);
  await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerleave")));
  await expect.poll(async () => Math.abs(await gazeX(header))).toBeLessThanOrEqual(4.5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const body = header.locator("[data-avatar-body]");
  await expect(body).toHaveAttribute(
    "transform",
    "translate(0.00 0.00) translate(100 130) rotate(0.00) scale(1.000 1.000) translate(-100 -130)",
  );
  const pose = await body.getAttribute("transform");
  await page.mouse.move(50, 50);
  await page.waitForTimeout(200);
  expect(await body.getAttribute("transform")).toBe(pose);
  await expect(header.locator("[data-avatar-gaze]")).toHaveAttribute(
    "transform",
    "translate(0.00 0.00)",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expectIdle(header);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const hiddenPose = await body.getAttribute("transform");
  await page.waitForTimeout(200);
  expect(await body.getAttribute("transform")).toBe(hiddenPose);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expectIdle(header);
  await page.screenshot({ path: info.outputPath("dm-avatar-motion.png") });
});
