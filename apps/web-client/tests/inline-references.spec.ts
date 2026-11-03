import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function setup(page: Page, group = true) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const connection = await post(page, "/v1/connections", {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agents = [];
  for (const name of ["Nara", "Raka"])
    agents.push(
      await post(page, "/v1/agents", {
        name: `${name} ${crypto.randomUUID().slice(0, 6)}`,
        harness: "codex",
        connection_id: connection.id,
        model_id: "fixture",
        billing_source: "subscription",
      }),
    );
  const thread = group
    ? await post(page, "/v1/threads", {
        type: "group",
        member_agent_ids: agents.map((agent) => agent.id),
      })
    : await post(page, `/v1/agents/${agents[0].id}/dm`, {});
  for (const agent of group ? agents : agents.slice(0, 1)) {
    const dm = await post(page, `/v1/agents/${agent.id}/dm`, {});
    const warmup = await post(page, "/v1/runs", {
      agent_id: agent.id,
      thread_id: dm.id,
      text: "fixture warmup",
    });
    await expect
      .poll(async () => {
        const snapshot = await (await page.request.get(`/v1/threads/${dm.id}/snapshot`)).json();
        return snapshot.runs.find((run: { id: string }) => run.id === warmup.run.id)?.status;
      })
      .toBe("succeeded");
    const context = { agent_id: agent.id, thread_id: thread.id };
    const result = await post(page, "/v1/learning/skills/create", {
      context,
      name: group && agent.id === agents[1].id ? "review" : "research",
      visibility: group ? "group" : "dm_private",
      package: {
        description: "Research with sources",
        instructions: "Use sources and report findings in English.",
        assets: [],
      },
    });
    await post(page, "/v1/learning/skills/assign", {
      context,
      skill_id: result.skill.id,
      version: result.revision.version,
      enabled: true,
      expected_revision: 0,
    });
  }
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), thread.id);
  await page.reload();
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await expect(composer).toBeEditable();
  return { agents, thread, composer };
}

test("group mention and skill use shared chips, preserve routing and survive reload", async ({
  page,
}, info) => {
  const { agents, thread, composer } = await setup(page);
  await expect(page.getByRole("button", { name: "Mention agent", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pilih skill", exact: true })).toHaveCount(0);
  await composer.fill("@");
  await expect(page.getByRole("option")).toHaveCount(2);
  await composer.press("ArrowDown");
  await composer.press("Enter");
  const mention = composer.locator('[data-inline-reference="agent"]');
  await expect(mention).toHaveAttribute("data-reference-id", agents[1].id);
  await expect(mention).toHaveText(agents[1].name);
  await expect(mention.locator(".agent-avatar")).toBeVisible();
  expect(
    await mention.evaluate((element) => ({
      background: getComputedStyle(element).backgroundColor,
      shadow: getComputedStyle(element).boxShadow,
    })),
  ).toEqual({ background: "rgba(0, 0, 0, 0)", shadow: "none" });
  await expect(composer).toBeFocused();
  await page.keyboard.insertText("/");
  await expect(page.getByRole("option")).toHaveCount(1);
  await composer.press("Tab");
  await expect(composer.locator('[data-inline-reference="skill"]')).toHaveText("/review");
  await page.keyboard.insertText("Compare the source material.");
  await page.screenshot({ path: info.outputPath("selected-inline-references.png") });
  await page.reload();
  await expect(composer.locator("[data-inline-reference]")).toHaveCount(2);
  const sent = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith(`/v1/groups/${thread.id}/messages`),
  );
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  const body = (await sent).postDataJSON();
  expect(body.agent_id).toBe(agents[1].id);
  expect(body.text).toContain(`ngertiin://agent/${agents[1].id}`);
  expect(body.text).toContain("ngertiin://skill/application/");
  const user = page.locator(".chat-user-bubble").last();
  await expect(user.locator("[data-inline-reference]")).toHaveCount(2);
  await expect
    .poll(async () => {
      const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
      return snapshot.routes.find((route: { message_id: string }) =>
        snapshot.messages.some(
          (message: { id: string; text: string }) =>
            message.id === route.message_id && message.text === body.text,
        ),
      )?.selected_agent_id;
    })
    .toBe(agents[1].id);
  await page.reload();
  await expect(page.locator(".chat-user-bubble [data-inline-reference]")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("popover filters at the cursor, fits the viewport, dismisses and never sends an empty result", async ({
  page,
}, info) => {
  const { composer } = await setup(page);
  let sends = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/messages$/.test(request.url())) sends++;
  });
  await composer.fill("Discuss @");
  await expect(page.getByRole("option")).toHaveCount(2);
  const panel = page.locator(".composer-suggestions");
  const boxes = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const elementForm = document.querySelector(".conversation-composer");
    if (!elementForm) throw new Error("Missing composer");
    const form = elementForm.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      formTop: form.top,
      viewport: innerWidth,
    };
  });
  expect(boxes.left).toBeGreaterThanOrEqual(0);
  expect(boxes.right).toBeLessThanOrEqual(boxes.viewport);
  expect(boxes.bottom).toBeLessThan(boxes.formTop);
  await page.screenshot({ path: info.outputPath("mention-popover.png") });
  await composer.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(composer).toHaveText("Discuss @");
  await composer.fill("/missing-skill");
  await expect(panel).toContainText("Tidak ada hasil");
  await composer.press("Enter");
  expect(sends).toBe(0);
  await expect(composer).toHaveText("/missing-skill");
});

test("typing longer queries keeps the same visible popover without restarting its animation", async ({
  page,
}) => {
  const { composer } = await setup(page);
  for (const [trigger, query] of [
    ["/", "com"],
    ["@", "nar"],
  ]) {
    await composer.fill(trigger);
    const panel = page.locator(".composer-suggestions");
    await expect(panel).toBeVisible();
    await expect
      .poll(() =>
        panel.evaluate(
          (element) =>
            element.getAnimations().filter((animation) => animation.playState === "running").length,
        ),
      )
      .toBe(0);
    await panel.evaluate((element) => {
      const state = { removals: 0, starts: 0 };
      Object.assign(window, { referencePopoverProbe: state });
      new MutationObserver((records) => {
        for (const record of records)
          for (const removed of record.removedNodes)
            if (removed === element || removed.contains(element)) state.removals++;
      }).observe(document.body, { childList: true, subtree: true });
      element.addEventListener("animationstart", () => state.starts++);
    });
    await composer.pressSequentially(query, { delay: 60 });
    await expect(panel).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { referencePopoverProbe: { removals: number; starts: number } })
            .referencePopoverProbe,
      ),
    ).toEqual({ removals: 0, starts: 0 });
    await composer.press("Escape");
  }
});

test("DM skill chips delete atomically and Markdown assistant references share their styling", async ({
  page,
}, info) => {
  const { agents, thread, composer } = await setup(page, false);
  await expect(page.getByRole("button", { name: "Mention agent", exact: true })).toHaveCount(0);
  await composer.fill("/res");
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("skill-popover.png") });
  await composer.press("Enter");
  await expect(composer.locator('[data-inline-reference="skill"]')).toHaveCount(1);
  await composer.press("Backspace");
  await composer.press("Backspace");
  await expect(composer.locator("[data-inline-reference]")).toHaveCount(0);
  await expect(composer).toHaveText("");
  await composer.pressSequentially("/");
  await expect(page.getByRole("option")).toHaveCount(1);
  await composer.press("Enter");
  await page.keyboard.insertText(`Ask @${agents[0].handle} to investigate.`);
  const sent = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().endsWith("/v1/runs"),
  );
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  const body = (await sent).postDataJSON();
  await expect
    .poll(async () => {
      const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
      return snapshot.runs.find((run: { input_message_id: string }) =>
        snapshot.messages.some(
          (message: { id: string; text: string }) =>
            message.id === run.input_message_id && message.text === body.text,
        ),
      )?.status;
    })
    .toBe("succeeded");
  // Simulate provider-authored Markdown; the submission and skill inventory use the real HTTP API.
  await page.route(`**/v1/threads/${thread.id}/snapshot*`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const reply = snapshot.messages.findLast(
      (message: { author: string }) => message.author === "agent",
    );
    if (reply)
      reply.text = `${body.text}\n\n@${agents[0].handle} uses /research.\n\n\`@${agents[0].handle} /research\`\n\n\`\`\`text\n@${agents[0].handle} /research\n\`\`\``;
    await route.fulfill({ response, json: snapshot });
  });
  await page.reload();
  const reply = page.locator(".assistant-answer").last();
  await expect(reply.locator('[data-inline-reference="skill"]')).toHaveCount(2);
  await expect(reply.locator('[data-inline-reference="agent"]')).toHaveCount(2);
  await expect(reply.locator("code [data-inline-reference]")).toHaveCount(0);
  const color = await reply
    .locator('[data-inline-reference="agent"]')
    .first()
    .evaluate((element) => getComputedStyle(element).color);
  expect(
    await page
      .locator('.chat-user-bubble [data-inline-reference="agent"]')
      .last()
      .evaluate((element) => getComputedStyle(element).color),
  ).toBe(color);
  await page.screenshot({ path: info.outputPath("message-inline-references.png") });
  await page.evaluate(() => {
    document.documentElement.classList.add("dark");
  });
  await page.screenshot({ path: info.outputPath("message-inline-references-dark.png") });
});
