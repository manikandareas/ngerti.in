import { expect, type Page, type TestInfo, test } from "@playwright/test";

async function verifyTimelineLayout(page: Page, info: TestInfo) {
  const originalViewport = page.viewportSize();
  if (!originalViewport) throw new Error("The layout check needs a fixed test viewport.");
  await page.setViewportSize({ width: originalViewport.width, height: 480 });
  const handoff = page.locator('[data-conversation-event="handoff"]').last();
  const alignment = await handoff.evaluate((event) => {
    const row = event.querySelector("[data-conversation-event-row]") as HTMLElement;
    const icon = event.querySelector("[data-conversation-event-icon]") as HTMLElement;
    const label = event.querySelector("[data-conversation-event-label]") as HTMLElement;
    const name = event.querySelector("[data-conversation-event-name]") as HTMLElement;
    const centerY = (node: Element) => {
      const rect = node.getBoundingClientRect();
      return rect.y + rect.height / 2;
    };
    const lines: { y: number; left: number; right: number }[] = [];
    for (const node of row.children) {
      const rect = node.getBoundingClientRect();
      const y = centerY(node);
      const line = lines.find((item) => Math.abs(item.y - y) < 1);
      if (line) {
        line.left = Math.min(line.left, rect.left);
        line.right = Math.max(line.right, rect.right);
      } else lines.push({ y, left: rect.left, right: rect.right });
    }
    const rowRect = row.getBoundingClientRect();
    return {
      iconLabelOffset: Math.abs(centerY(icon) - centerY(label)),
      labelNameOffset: Math.abs(centerY(label) - centerY(name)),
      lineCenterOffsets: lines.map((line) =>
        Math.abs((line.left + line.right) / 2 - (rowRect.x + rowRect.width / 2)),
      ),
      lineCount: lines.length,
    };
  });
  expect(alignment.iconLabelOffset).toBeLessThan(1);
  if (alignment.lineCount === 1) expect(alignment.labelNameOffset).toBeLessThan(1);
  for (const offset of alignment.lineCenterOffsets) expect(offset).toBeLessThan(1);

  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  const minimumGap = info.project.name === "mobile" ? 24 : 32;
  const readGap = () =>
    page.evaluate(() => {
      const last = [...document.querySelectorAll("[data-timeline-part]")].at(-1);
      const form = document.querySelector(".conversation-composer");
      if (!last || !form) throw new Error("The timeline or composer is missing.");
      return form.getBoundingClientRect().top - last.getBoundingClientRect().bottom;
    });
  const measurements = [];
  for (const multiline of [false, true]) {
    if (multiline)
      await composer.fill(
        Array.from({ length: 8 }, (_, index) => `Draft line ${index + 1}`).join("\n"),
      );
    await expect
      .poll(() =>
        page.locator(".composer-dock").evaluate((el) => el.getBoundingClientRect().height),
      )
      .toBeGreaterThan(multiline ? 100 : 0);
    if (multiline) {
      await expect.poll(readGap).toBeGreaterThanOrEqual(minimumGap);
      measurements.push({ phase: "composer-resize", multiline, gap: await readGap() });
    }
    for (const remaining of [0, 32]) {
      const scroll = page.locator(".conversation-scroll");
      const distanceFromBottom = () =>
        scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
      if (remaining === 0) {
        await scroll.evaluate((element) => {
          element.scrollTop = element.scrollHeight;
        });
        await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
      } else {
        await scroll.hover();
        await page.mouse.wheel(0, -remaining);
        await expect.poll(distanceFromBottom).toBeGreaterThanOrEqual(remaining - 1);
        await expect.poll(distanceFromBottom).toBeLessThanOrEqual(remaining + 1);
      }
      await expect.poll(readGap).toBeGreaterThanOrEqual(minimumGap);
      measurements.push({ phase: "scroll", multiline, remaining, gap: await readGap() });
    }
  }
  const scroll = page.locator(".conversation-scroll");
  await scroll.hover();
  await page.mouse.wheel(0, -160);
  await expect
    .poll(() => scroll.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop))
    .toBeGreaterThan(180);
  const lastPartTop = () =>
    page
      .locator("[data-timeline-part]")
      .last()
      .evaluate((el) => el.getBoundingClientRect().top);
  const readingPosition = await lastPartTop();
  await composer.fill("");
  await expect
    .poll(() => page.locator(".composer-dock").evaluate((el) => el.getBoundingClientRect().height))
    .toBeLessThan(100);
  await expect.poll(async () => Math.abs((await lastPartTop()) - readingPosition)).toBeLessThan(1);
  await page.setViewportSize(originalViewport);
  await info.attach("timeline-layout.json", {
    body: JSON.stringify({ alignment, measurements }, null, 2),
    contentType: "application/json",
  });
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test("group collaboration displays friendly activity and shared goal evidence without technical bubbles", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const members = [];
  for (const name of ["Campaign writer", "Campaign reviewer"]) {
    const connection = await post(page, "/v1/connections", {
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    });
    members.push(
      await post(page, "/v1/agents", {
        name: `${name} ${crypto.randomUUID().slice(0, 5)}`,
        harness: "codex",
        connection_id: connection.id,
        model_id: "fixture",
      }),
    );
  }
  const group = await post(page, "/v1/threads", {
    type: "group",
    member_agent_ids: members.map((a) => a.id),
  });
  const groupName = `Campaign team ${crypto.randomUUID().slice(0, 5)}`;
  await post(page, `/v1/groups/${group.id}/configuration`, {
    expected_revision: group.revision,
    changes: { name: groupName },
  });
  const snapshot = async () => (await page.request.get(`/v1/threads/${group.id}/snapshot`)).json();
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeEditable();
  await post(page, `/v1/groups/${group.id}/messages`, {
    agent_id: members[0].id,
    text: "fixture shared responsibility",
  });
  await expect
    .poll(async () => (await snapshot()).goals[0]?.state, { timeout: 30_000 })
    .toBe("completed");
  await expect(page.getByText("The campaign summary is ready.", { exact: true })).toBeVisible();
  await expect(page.getByText("The reviewed example is ready.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Goal selesai: Shared campaign report", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-collaboration-activity]")).toHaveCount(1);
  await expect(page.locator("[data-collaboration-activity]")).toContainText(
    "Prepare the reviewed example",
  );
  await expect(page.locator("body")).not.toContainText("INTERNAL_HANDOFF_CANARY_8472");
  await expect(page.locator("body")).not.toContainText("INTERNAL_FINALIZATION_CANARY_8472");
  await expect(page.locator('[data-inline-reference="agent"] .agent-avatar').first()).toBeVisible();
  await expect(page.locator('[data-inline-reference="user"]')).toHaveText("Kamu");
  const ordered = await page
    .locator("[data-timeline-part]")
    .evaluateAll((nodes) => nodes.map((node) => Number(node.getAttribute("data-part-sequence"))));
  expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
  const kinds = (await snapshot()).timeline.parts.map((part: { kind: string }) => part.kind);
  expect(kinds).toEqual([
    "message",
    "goal_created",
    "message",
    "handoff_requested",
    "message",
    "goal_completed",
  ]);
  await verifyTimelineLayout(page, info);
  await page.getByRole("button", { name: "Buka file: summary.txt", exact: true }).click();
  await page.getByRole("button", { name: "Open summary.txt", exact: true }).click();
  await expect(page.getByText("Verified campaign summary.", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  if (info.project.name === "mobile")
    await page
      .getByRole("dialog", { name: "Detail percakapan" })
      .getByRole("button", { name: "Close", exact: true })
      .click();
  else await page.getByRole("button", { name: "Tutup detail", exact: true }).click();
  const state = await snapshot();
  expect(state.goals[0]).toMatchObject({
    scope: "group",
    agent_id: null,
    coordinator_agent_id: members[0].id,
  });
  const peerView = await (
    await page.request.get(`/v1/threads/${group.id}/goals?agent_id=${members[1].id}`)
  ).json();
  expect(peerView.goals[0].id).toBe(state.goals[0].id);
  await page.getByRole("button", { name: `Detail ${groupName}` }).click();
  await page.getByRole("button", { name: "Shared campaign report", exact: true }).click();
  const goalDetail = page.getByRole("dialog", { name: "Shared campaign report", exact: true });
  await expect(goalDetail.getByRole("heading", { name: "Activity", exact: true })).toBeVisible();
  await expect(
    goalDetail.getByRole("button", { name: "summary.txt File", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("shared-goal-and-friendly-handoff.png") });
  const routine = await post(page, "/v1/routines", {
    thread_id: group.id,
    agent_id: members[0].id,
    instruction: "Check campaign progress",
    execution_target: { type: "auto" },
    timezone: "Asia/Makassar",
    schedule: { type: "once", at: "2050-11-02T00:00:00Z" },
  });
  expect(routine).toMatchObject({
    scope: "group",
    agent_id: null,
    execution_target: { type: "auto" },
  });
  await page.getByRole("button", { name: "Close detail", exact: true }).click();
  await page.getByRole("button", { name: "Check campaign progress", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Check campaign progress", exact: true }),
  ).toBeVisible();
  const toggle = page.getByRole("switch", { name: "Routine Check campaign progress", exact: true });
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.screenshot({ path: info.outputPath("group-routine-assignment.png") });
  await page.reload();
  await expect(page.locator("[data-collaboration-activity]")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Routine dibuat: Check campaign progress", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-activity-batch]").filter({ hasText: "Routine" })).toHaveCount(0);

  expect(
    (await snapshot()).routines.find((item: { id: string }) => item.id === routine.id).state,
  ).toBe("paused");
});
