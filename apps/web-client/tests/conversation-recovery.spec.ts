import { expect, type Page, test } from "@playwright/test";
import { withTimeline } from "./conversation-fixture.js";

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function conversation(page: Page, group = false) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agent = await post(page, "/v1/agents", {
    name: `Recovery ${crypto.randomUUID()}`,
    harness: "codex",
    connection_id: null,
  });
  const thread = await post(
    page,
    group ? "/v1/threads" : `/v1/agents/${agent.id}/dm`,
    group ? { type: "group", member_agent_ids: [agent.id] } : {},
  );
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), thread.id);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeEditable();
  // Direct admission keeps this transport fixture independent of semantic routing.
  const receipt = await post(page, "/v1/runs", {
    thread_id: thread.id,
    agent_id: agent.id,
    text: "Original input",
  });
  const message = page.locator(".chat-user-bubble [data-message-text]");
  await expect(message).toHaveText("Original input");
  const messageId = receipt.message.id;
  let revision = 1;
  const edit = async (text: string) => {
    const value = await post(page, `/v1/messages/${messageId}/edit`, {
      expected_revision: revision,
      text,
    });
    revision = value.revision;
  };
  return { agent, thread, message, edit };
}

test("reconnect cancels a hanging DM snapshot and keeps later live updates and the draft", async ({
  page,
}) => {
  const f = await conversation(page);
  let held = false;
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/v1/threads/${f.thread.id}/snapshot`, async (route) => {
    if (held) return route.continue();
    held = true;
    await blocked;
    await route.abort().catch(() => {});
  });
  try {
    await f.edit("Input during the hanging read");
    await expect.poll(() => held).toBe(true);
    const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
    await composer.fill("Keep this unsent draft.");
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await page.getByRole("button", { name: "Coba hubungkan lagi", exact: true }).click();
    await expect(f.message).toHaveText("Input during the hanging read");
    await f.edit("Live updates still work after reconnect");
    await expect(f.message).toHaveText("Live updates still work after reconnect");
    await expect(composer).toHaveText("Keep this unsent draft.");
  } finally {
    release();
  }
});

test("a hanging group snapshot times out and recovers automatically without a reload", async ({
  page,
}) => {
  test.setTimeout(40_000);
  const f = await conversation(page, true);
  let held = false;
  let release: () => void = () => {};
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/v1/threads/${f.thread.id}/snapshot`, async (route) => {
    if (held) return route.continue();
    held = true;
    await blocked;
    await route.abort().catch(() => {});
  });
  try {
    await f.edit("Recovered automatically after the snapshot deadline");
    await expect.poll(() => held).toBe(true);
    await expect(f.message).toHaveText("Recovered automatically after the snapshot deadline", {
      timeout: 25_000,
    });
    await f.edit("Group events continue after recovery");
    await expect(f.message).toHaveText("Group events continue after recovery");
  } finally {
    release();
  }
});

test("foreground reconciliation repairs a missed answer without another event connection or inference", async ({
  page,
}) => {
  const f = await conversation(page, true);
  let complete = false;
  let streams = 0;
  let admissions = 0;
  page.on("request", (request) => {
    if (request.url().includes("/v1/events/stream")) streams++;
    if (request.method() === "POST" && /\/(runs|messages)$/.test(new URL(request.url()).pathname))
      admissions++;
  });
  await page.route(`**/v1/threads/${f.thread.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    if (!complete) return route.fulfill({ response, json: snapshot });
    const run = snapshot.runs[0];
    const answer = {
      id: `recovered-answer-${run.id}`,
      revision: 1,
      created_at: run.created_at,
      thread_id: f.thread.id,
      author: "agent",
      author_agent_id: f.agent.id,
      run_id: run.id,
      purpose: "conversation",
      text: "The durable completed answer.",
      state: "complete",
      artifact_ids: [],
    };
    await route.fulfill({
      response,
      json: withTimeline({
        ...snapshot,
        runs: [{ ...run, status: "succeeded", activity: "idle" }],
        messages: [...snapshot.messages, answer],
      }),
    });
  });
  complete = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("The durable completed answer.", { exact: true })).toBeVisible();
  expect(streams).toBe(0);
  expect(admissions).toBe(0);
});
