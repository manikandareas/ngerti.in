import { expect, type Page, test } from "@playwright/test";
import { withTimeline } from "./conversation-fixture.js";

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

async function post(page: Page, path: string, data: object) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function activityFixture(page: Page, group = false) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const actor = await post(page, "/v1/agents", {
    name: `Milo ${crypto.randomUUID().slice(0, 6)}`,
    harness: "codex",
    connection_id: null,
  });
  const peer = await post(page, "/v1/agents", {
    name: `Nara ${crypto.randomUUID().slice(0, 6)}`,
    harness: "codex",
    connection_id: null,
  });
  const thread = group
    ? await post(page, "/v1/threads", {
        type: "group",
        member_agent_ids: [actor.id, peer.id, (await post(page, "/v1/setup", {})).agent_id],
      })
    : await post(page, `/v1/agents/${actor.id}/dm`, {});
  const admitted = await post(page, "/v1/runs", {
    thread_id: thread.id,
    agent_id: actor.id,
    text: "Help me with this request.",
  });
  const second = group
    ? await post(page, "/v1/runs", {
        thread_id: thread.id,
        agent_id: peer.id,
        text: "Help with the shared file.",
      })
    : null;
  const state: {
    runs: Record<string, Record<string, unknown>>;
    messages: Record<string, unknown>[];
    humanRequests: Record<string, unknown>[];
  } = {
    runs: { [admitted.run.id]: { status: "running", activity: "generating" } },
    messages: [],
    humanRequests: [],
  };
  if (second)
    state.runs[second.run.id] = {
      status: "running",
      activity: "tool_running",
      active_tools: [{ call_id: "read", kind: "reading", target_agent_id: null }],
    };
  await page.route(`**/v1/threads/${thread.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    const messages = [...value.messages, ...state.messages];
    await route.fulfill({
      response,
      json: withTimeline({
        ...value,
        runs: value.runs.map((run: { id: string }) => ({ ...run, ...state.runs[run.id] })),
        messages,
        human_requests: state.humanRequests,
      }),
    });
  });
  await page.route("**/v1/agents/activity", async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    await route.fulfill({
      response,
      json: {
        ...value,
        items: value.items.map((item: { run_id: string }) => ({
          ...item,
          ...state.runs[item.run_id],
          waiting_for_user: state.humanRequests.some(
            (request) => request.source_run_id === item.run_id,
          ),
        })),
      },
    });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), thread.id);
  await page.reload();
  let refreshes = 0;
  async function refresh() {
    const current = await page.request
      .get(`/v1/entities/agent/${actor.id}`)
      .then((response) => response.json());
    await post(page, `/v1/agents/${actor.id}/configuration`, {
      expected_revision: current.revision,
      changes: { soul: `Activity refresh ${++refreshes}` },
    });
  }
  const bubble = (id = admitted.run.id) => page.locator(`[data-agent-activity="${id}"]`);
  return { actor, peer, thread, admitted, second, state, refresh, bubble };
}

test("DM activity updates one bubble, follows streaming output and survives reload without technical text", async ({
  page,
}, info) => {
  const f = await activityFixture(page);
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText(
    /^(Thinking it through|Connecting the dots|Let me think for a sec|Putting the pieces together|A little brainwork)…$/,
  );
  await expect(f.bubble().locator(".agent-activity-name")).toHaveCount(0);
  expect(
    await f
      .bubble()
      .locator('[data-slot="bubble-content"]')
      .evaluate((element) => getComputedStyle(element, "::before").animationName),
  ).toBe("activity-surface-shimmer");
  const thinking = await f.bubble().locator("[data-activity-text]").textContent();
  await f.refresh();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText(thinking ?? "");

  await expect(f.bubble().locator(".agent-activity-avatar")).toHaveCount(0);
  const initialLeft = await f
    .bubble()
    .locator(".agent-activity-bubble")
    .evaluate((element) => element.getBoundingClientRect().left);
  await expect(page.locator(".chat-user-bubble")).not.toContainText("Thinking it through");
  await f.bubble().evaluate((element) => element.setAttribute("data-stable-instance", "same"));
  f.state.runs[f.admitted.run.id] = {
    status: "running",
    activity: "tool_running",
    active_tools: [{ call_id: "search", kind: "searching", target_agent_id: null }],
    native_tools: [{ item_id: "secret", name: "PRIVATE_COMMAND", state: "started" }],
  };
  await f.refresh();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText("Searching the web…");
  await expect(f.bubble()).toHaveAttribute("data-stable-instance", "same");
  expect(
    await f
      .bubble()
      .locator(".agent-activity-bubble")
      .evaluate((element) => element.getBoundingClientRect().left),
  ).toBe(initialLeft);
  await expect(f.bubble()).not.toContainText("PRIVATE_COMMAND");
  await expect(f.bubble().locator("[data-shimmer]")).toHaveAttribute("data-shimmer", "true");
  await page.screenshot({ path: info.outputPath("dm-searching.png") });
  let extraAdmissions = 0;
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/v1/runs")
      extraAdmissions++;
  });
  await page.context().setOffline(true);
  try {
    await expect(f.bubble().locator("[data-activity-text]")).toHaveText("Reconnecting…");
    await expect(f.bubble()).toHaveAttribute("data-loading", "false");
    await expect(page.locator(".workspace-error")).toContainText("Connection lost. Reconnecting…");
  } finally {
    await page.context().setOffline(false);
  }
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText("Searching the web…");
  expect(extraAdmissions).toBe(0);
  await page.reload();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText("Searching the web…");
  const outputId = crypto.randomUUID();
  f.state.messages = [
    {
      ...f.admitted.message,
      id: outputId,
      author: "agent",
      author_agent_id: f.actor.id,
      run_id: f.admitted.run.id,
      text: "I found a useful starting point.",
      state: "partial",
    },
  ];
  await f.refresh();
  await expect(page.locator(`#message-${outputId}`)).toBeVisible();
  expect(
    await f
      .bubble()
      .evaluate(
        (element, id) =>
          Boolean(
            (document.getElementById(`message-${id}`)?.compareDocumentPosition(element) ?? 0) &
              Node.DOCUMENT_POSITION_FOLLOWING,
          ),
        outputId,
      ),
  ).toBe(true);
  await expect(f.bubble()).toHaveAttribute("data-loading", "true");
  f.state.runs[f.admitted.run.id] = { status: "succeeded", activity: "idle", active_tools: [] };
  await f.refresh();
  await expect(f.bubble()).toHaveCount(0);
  await expect(page.locator(`#message-${outputId}`)).toContainText(
    "I found a useful starting point.",
  );
});

test("group activity belongs to each working agent and hands off without idle member bubbles", async ({
  page,
}, info) => {
  const f = await activityFixture(page, true);
  await expect(page.locator("[data-agent-activity]")).toHaveCount(2);
  await expect(f.bubble()).toHaveAttribute("data-activity-agent", f.actor.id);
  await expect(f.bubble().locator(".agent-activity-name")).toHaveCount(0);
  await expect(f.bubble(f.second.run.id)).toHaveAttribute("data-activity-agent", f.peer.id);
  await expect(f.bubble(f.second.run.id).locator("[data-activity-text]")).toHaveText(
    "Reading your file…",
  );
  f.state.runs[f.admitted.run.id] = {
    status: "running",
    activity: "tool_running",
    active_tools: [{ call_id: "handoff", kind: "asking_agent", target_agent_id: f.peer.id }],
  };
  await f.refresh();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText(
    `Asking @${f.peer.name} for help…`,
  );
  await page.screenshot({ path: info.outputPath("group-handoff.png") });
  f.state.runs[f.admitted.run.id] = { status: "succeeded", activity: "idle", active_tools: [] };
  await f.refresh();
  await expect(f.bubble()).toHaveCount(0);
  await expect(page.locator("[data-agent-activity]")).toHaveCount(1);
  f.state.runs[f.second.run.id] = {
    status: "running",
    activity: "generating",
    publication: "deferred",
    input_message_id: "private-continuation",
  };
  f.state.humanRequests = [
    {
      id: crypto.randomUUID(),
      state: "answered",
      source_run_id: f.admitted.run.id,
      continuation_run_id: f.second.run.id,
      response_message_id: f.second.message.id,
      message_id: "earlier-question",
    },
  ];
  await f.refresh();
  await expect(f.bubble(f.second.run.id).locator("[data-activity-text]")).toHaveText(
    /^(Thinking it through|Connecting the dots|Let me think for a sec|Putting the pieces together|A little brainwork)…$/,
  );
  await expect(f.bubble(f.second.run.id).locator(".ngertiin-avatar")).toHaveAttribute(
    "data-avatar-loading",
    "true",
  );
  await page.reload();
  await expect(page.locator("[data-agent-activity]")).toHaveCount(1);
});

test("a dark tablet DM omits the avatar and keeps bubble geometry stable when loading stops", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  const f = await activityFixture(page);
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(f.bubble()).toHaveAttribute("data-loading", "true");
  await expect(f.bubble().locator(".agent-activity-name")).toHaveCount(0);
  expect(
    await f
      .bubble()
      .locator('[data-slot="bubble-content"]')
      .evaluate((element) => getComputedStyle(element, "::before").animationName),
  ).toBe("activity-surface-shimmer");
  const thinking = await f.bubble().locator("[data-activity-text]").textContent();
  await f.refresh();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText(thinking ?? "");

  const geometry = () =>
    f.bubble().evaluate((element) => {
      const bubbleElement = element.querySelector(".agent-activity-bubble");
      if (!bubbleElement) throw new Error("Expected the activity bubble.");
      const bubble = bubbleElement.getBoundingClientRect();
      return {
        avatarCount: element.querySelectorAll(".agent-activity-avatar").length,
        bubbleLeft: bubble.left,
        rowHeight: element.getBoundingClientRect().height,
      };
    });
  const before = await geometry();
  await page.screenshot({ path: info.outputPath("tablet-dark-thinking.png") });
  f.state.runs[f.admitted.run.id] = {
    status: "cancelled",
    activity: "idle",
    cancellation: "confirmed",
  };
  await f.refresh();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText("Stopped.");
  await expect(f.bubble()).toHaveAttribute("data-loading", "false");
  expect(await geometry()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("waiting, uncertain results, confirmed stop and reduced motion never imply active thinking", async ({
  page,
}, info) => {
  const f = await activityFixture(page);
  await expect(f.bubble()).toHaveAttribute("data-loading", "true");
  f.state.runs[f.admitted.run.id] = { status: "succeeded", activity: "idle" };
  f.state.humanRequests = [
    {
      id: crypto.randomUUID(),
      source_run_id: f.admitted.run.id,
      state: "pending",
      message_id: "question-outside-this-fixture",
    },
  ];
  await f.refresh();
  await expect(f.bubble()).toHaveCount(0);
  await expect(
    page.locator(".conversation-column").getByText("Waiting for your reply…", { exact: true }),
  ).toHaveCount(0);
  f.state.humanRequests = [];
  f.state.runs[f.admitted.run.id] = { status: "cancel_requested", activity: "stopping" };
  await f.refresh();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText("Stopping…");
  await expect(f.bubble()).toHaveAttribute("data-loading", "true");
  f.state.runs[f.admitted.run.id] = {
    status: "cancelled",
    activity: "idle",
    cancellation: "confirmed",
  };
  await f.refresh();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText("Stopped.");
  await expect(f.bubble()).toHaveAttribute("data-loading", "false");
  f.state.runs[f.admitted.run.id] = { status: "unknown", activity: "unknown" };
  await f.refresh();
  await expect(f.bubble().getByRole("button", { name: "Check status" })).toBeVisible();
  await expect(f.bubble()).toHaveAttribute("data-loading", "false");
  f.state.runs[f.admitted.run.id] = { status: "failed", activity: "idle" };
  await f.refresh();
  await expect(f.bubble().locator("[data-activity-text]")).toHaveText("I couldn’t finish this.");
  await expect(f.bubble()).toHaveAttribute("data-loading", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  f.state.runs[f.admitted.run.id] = { status: "running", activity: "generating" };
  await f.refresh();
  await expect(f.bubble()).toHaveAttribute("data-loading", "true");
  expect(
    await f
      .bubble()
      .locator("[data-activity-text]")
      .evaluate((element) => getComputedStyle(element, "::after").display),
  ).toBe("none");
  await page.screenshot({ path: info.outputPath("reduced-motion.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("streamed bursts settle promptly, preserve emoji and flush completed replies", async ({
  page,
}) => {
  const f = await activityFixture(page);
  const id = crypto.randomUUID();
  const message = {
    ...f.admitted.message,
    id,
    author: "agent",
    author_agent_id: f.actor.id,
    run_id: f.admitted.run.id,
    text: "First",
    state: "partial",
  };
  f.state.messages = [message];
  await f.refresh();
  const answer = page.locator(`#message-${id} [data-message-text]`);
  await expect(answer).toHaveText("First");
  await answer.evaluate((element) => {
    const samples: string[] = [];
    (window as unknown as { streamSamples: string[] }).streamSamples = samples;
    new MutationObserver(() => samples.push(element.textContent ?? "")).observe(element, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  message.text = `First ${"smooth streaming 👋 ".repeat(30)}`.trim();
  await f.refresh();
  await expect(answer).toHaveText(message.text, { timeout: 2000 });
  const samples = await page.evaluate(
    () => (window as unknown as { streamSamples: string[] }).streamSamples,
  );
  expect(samples.some((sample) => sample.length > 5 && sample.length < message.text.length)).toBe(
    true,
  );
  expect(samples.every((sample) => !/[\uD800-\uDBFF]$/.test(sample))).toBe(true);
  f.state.runs[f.admitted.run.id] = { status: "succeeded", activity: "idle" };
  message.text += " Complete.";
  await f.refresh();
  await expect(answer).toHaveText(message.text);
  await page.reload();
  await expect(answer).toHaveText(message.text);
});

test("an active composer switches Stop to Send while dirty without stopping its run", async ({
  page,
}, info) => {
  const f = await activityFixture(page);
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/v1\/(runs|groups\/[^/]+\/messages)/.test(request.url()))
      mutations.push(request.url());
  });
  await expect(page.locator(".composer-send")).toHaveAccessibleName("Stop run");
  await composer.fill("One more thought");
  await expect(page.locator(".composer-send")).toHaveAccessibleName("Kirim");
  await expect(page.locator(".composer-actions .composer-aux")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("active-composer-dirty.png") });
  await composer.fill("");
  await expect(page.locator(".composer-send")).toHaveAccessibleName("Stop run");
  await page.screenshot({ path: info.outputPath("active-composer-empty.png") });
  expect(mutations).toEqual([]);
  await expect(f.bubble()).toHaveAttribute("data-loading", "true");
});

test("message actions stay reachable across the bubble edge and sources belong to the assistant answer", async ({
  page,
}, info) => {
  const f = await activityFixture(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const outputId = crypto.randomUUID();
  f.state.runs[f.admitted.run.id] = {
    status: "succeeded",
    activity: "idle",
    sources: [
      { url: "https://example.org/report", title: "Published report", operation: "search" },
      { url: "https://example.org/report", title: "Published report", operation: "open" },
      { url: "javascript:alert(1)", title: "Invalid source", operation: "search" },
    ],
  };
  f.state.messages = [
    {
      ...f.admitted.message,
      id: outputId,
      author: "agent",
      author_agent_id: f.actor.id,
      run_id: f.admitted.run.id,
      text: "According to [the report](https://example.org/report), this is the result.",
      state: "complete",
    },
  ];
  await f.refresh();
  const answer = page.locator(`#message-${outputId}`);
  const anchor = answer.locator(".message-action-anchor");
  const copy = anchor.getByRole("button", { name: "Salin pesan", exact: true });
  await expect(anchor).toBeVisible();
  await expect(anchor.locator(".message-hover-actions")).toHaveCSS("opacity", "0");
  if (info.project.name === "mobile") await anchor.tap();
  else {
    await anchor.hover();
    const bubble = await anchor.boundingBox();
    const button = await copy.boundingBox();
    if (!bubble || !button) throw new Error("The message action geometry is missing.");
    await page.mouse.move(bubble.x + bubble.width - 1, button.y + button.height / 2);
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: 15 });
    await page.waitForTimeout(250);
  }
  await expect(copy).toBeVisible();
  await copy.click();
  await expect(anchor.getByRole("button", { name: "Pesan disalin", exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "According to [the report]",
  );
  await expect(answer.locator(".source-citation")).toHaveText("example.org");
  await expect(answer.getByLabel("1 sumber riset")).toBeVisible();
  await answer.getByLabel("1 sumber riset").click();
  await expect(
    answer.getByRole("list", { name: "Sumber riset", exact: true }).getByRole("link"),
  ).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("hover-actions-and-sources.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const user = page.locator(`#message-${f.admitted.message.id} .message-action-anchor`);
  if (info.project.name === "mobile") await user.tap();
  else await user.hover();
  await user.getByRole("button", { name: "Salin pesan", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "Help me with this request.",
  );
});

test("an empty group composer exposes Stop with an explicit target for concurrent agents", async ({
  page,
}, info) => {
  const f = await activityFixture(page, true);
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await expect(page.locator(".composer-send")).toHaveAccessibleName("Stop");
  await composer.fill("A follow-up for the group");
  await expect(page.locator(".composer-send")).toHaveAccessibleName("Kirim");
  await composer.fill("");
  await page.locator(".composer-send").click();
  const choices = page.getByRole("dialog", { name: "Pilih agent untuk dihentikan" });
  await expect(
    choices.getByRole("button", { name: `Stop ${f.actor.name}`, exact: true }),
  ).toBeVisible();
  await expect(
    choices.getByRole("button", { name: `Stop ${f.peer.name}`, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("group-stop-target.png") });
  await page.keyboard.press("Escape");
  await expect(f.bubble()).toHaveAttribute("data-loading", "true");
});

test("the web studio uses product interactions and consistent Computer cards without dispatch", async ({
  page,
}, info) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") writes.push(request.url());
  });
  await page.goto("/assistant-studio?section=input&state=single&mode=dm");
  await expect(
    page.getByRole("navigation", { name: "Kategori tampilan", exact: true }).getByText(/native/i),
  ).toHaveCount(0);
  const radio = page.getByRole("radio", {
    name: "Ringkas",
    exact: true,
  });
  await expect(radio).toBeVisible();
  const submit = page.getByRole("button", { name: "Lanjut", exact: true });
  await expect(submit).toBeDisabled();
  await radio.check();
  await expect(submit).toBeEnabled();
  await expect(radio).toBeVisible();
  await submit.click();
  await expect(
    page.locator('.conversation-interaction[data-interaction-state="settled"]'),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".conversation-interaction")
      .locator("button, input, textarea, footer, .conversation-interaction-body"),
  ).toHaveCount(0);
  await expect(page.locator('[data-native-state="submitted"]')).toHaveCount(0);
  await page.goto("/assistant-studio?section=input&state=input&mode=dm");
  await expect(
    page.getByText("Apa yang perlu dijelaskan untuk staf operasional?", { exact: true }),
  ).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await expect(composer).toBeEditable();
  await expect(page.locator(".conversation-interaction")).toHaveCount(0);
  await composer.fill("Jelaskan langkah impor.");
  await page.screenshot({ path: info.outputPath("studio-text-composer.png") });
  await page.goto("/assistant-studio?section=input&state=approval&mode=group");
  await expect(page.getByRole("button", { name: "Tolak", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Setujui", exact: true })).toBeVisible();
  await expect(page.locator('.conversation-interaction button[aria-label*="Tutup"]')).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Setujui", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("studio-product-approval.png") });
  await page.goto("/assistant-studio?section=files&state=attached&mode=group");
  const file = page.locator(".conversation-file-action").first();
  await expect(file).toBeVisible();
  await file.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("studio-file-actions.png") });
  await file.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  for (const state of ["preparing", "completed"]) {
    await page.goto(`/assistant-studio?section=computer&state=${state}&mode=dm`);
    const card = page.getByRole("region", { name: "Computer · Tobi", exact: true });
    await expect(card).toBeVisible();
    await expect(card.locator("iframe")).toHaveCount(0);
    await expect(card.getByRole("button", { name: "Open Computer", exact: true })).toHaveCount(0);
    expect(await card.evaluate((element) => element.closest(".chat-agent-bubble"))).toBeNull();
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`studio-computer-${state}.png`) });
  }
  expect(writes).toEqual([]);
});

test("editable alternatives behave as options and approval details remain readable while scrolling", async ({
  page,
}, info) => {
  await page.goto("/assistant-studio?section=input&state=custom&mode=dm");
  const custom = page.getByRole("radio", { name: "Jawaban lain", exact: true });
  const input = page.getByRole("textbox", { name: "Isi jawaban lain", exact: true });
  const submit = page.getByRole("button", { name: "Lanjut", exact: true });
  await custom.check();
  await expect(custom).toBeChecked();
  await expect(submit).toBeDisabled();
  await input.fill("Panduan untuk kasir baru");
  await expect(submit).toBeEnabled();
  await page.getByRole("radio", { name: "Ringkas", exact: true }).check();
  await expect(custom).not.toBeChecked();
  await expect(input).toHaveValue("");
  await input.fill("Panduan untuk kasir baru");
  await expect(custom).toBeChecked();
  await expect(page.getByRole("radio", { name: "Ringkas", exact: true })).not.toBeChecked();
  await custom.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("editable-custom-option.png") });
  await submit.click();
  await expect(page.getByText("Panduan untuk kasir baru", { exact: true })).toBeVisible();
  await expect(
    page.locator('.conversation-interaction[data-interaction-state="settled"]'),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".conversation-interaction")
      .locator("button, input, textarea, footer, .conversation-interaction-body"),
  ).toHaveCount(0);

  await page.goto("/assistant-studio?section=input&state=approval&mode=dm");
  const details = page.getByRole("region", { name: "Rincian tindakan", exact: true });
  await expect(details).toBeVisible();
  await expect(page.locator(".conversation-interaction details")).toHaveCount(0);
  await expect(details.getByText("checklist-impor.md", { exact: true })).toBeVisible();
  await expect(details.getByText("Isi file", { exact: true })).toBeVisible();
  const frame = page.locator(".approval-details-frame");
  await expect(frame).toHaveAttribute("data-shadow-top", "false");
  await expect(frame).toHaveAttribute("data-shadow-bottom", "true");
  await details.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("approval-details-top.png") });
  await details.focus();
  await details.press("End");
  await expect(frame).toHaveAttribute("data-shadow-top", "true");
  await expect(frame).toHaveAttribute("data-shadow-bottom", "false");
  await expect(details).toContainText("Periksa pratinjau dan laporan hasil sebelum melanjutkan.");
  await page.screenshot({ path: info.outputPath("approval-details-bottom.png") });
  await page.getByRole("button", { name: "Setujui", exact: true }).click();
  await expect(
    page.locator('.conversation-interaction[data-interaction-state="settled"]'),
  ).toHaveCount(1);
  await expect(
    page
      .locator(".conversation-interaction")
      .locator("button, input, textarea, footer, .conversation-interaction-body"),
  ).toHaveCount(0);
});
