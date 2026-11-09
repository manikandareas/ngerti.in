import { createHash } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

// Controlled presentation projections; the API still owns setup, identity and thread reads.
interface Message {
  id: string;
  thread_id: string;
  revision: number;
  author: string;
  author_agent_id: string | null;
  text: string;
  state: string;
  run_id: string | null;
  created_at: string;
  artifact_ids: string[];
  purpose: string;
}
interface Actor {
  id: string;
  name: string;
  handle: string | null;
  avatar_config?: unknown;
}
interface ConversationPart {
  id: string;
  sequence: number;
  source_cursor: number;
  thread_id: string;
  created_at: string;
  kind: string;
  message_id: string | null;
  resource_id: string | null;
  source_message_id: string | null;
  name: string;
  summary: string | null;
  actors: Actor[];
}
interface Snapshot {
  cursor: number;
  agents: Actor[];
  messages: Message[];
  runs: Record<string, unknown>[];
  human_requests: Record<string, unknown>[];
  timeline: {
    messages: Message[];
    parts: ConversationPart[];
    has_more: boolean;
    next_before: number | null;
  };
}
function sampleRun(changes: Record<string, unknown>) {
  return {
    revision: 1,
    status: "running",
    delivery: "accepted",
    activity: "generating",
    cancellation: "none",
    native_run_id: "fixture-native",
    diagnostic: null,
    product_tools: [],
    native_tools: [],
    native_interactions: [],
    sources: [],
    publication: "immediate",
    goal_id: null,
    routine_id: null,
    ...changes,
  };
}

test.use({ timezoneId: "Asia/Makassar" });
test.afterEach(async ({ page }) => page.unrouteAll({ behavior: "wait" }));
const at = (day: number, time: string) =>
  `2026-11-${String(day).padStart(2, "0")}T${time}:00+08:00`;

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function fixture(page: Page, group = false) {
  const setup = await post(page, "/v1/setup", {});
  const thread = group
    ? await post(page, "/v1/threads", {
        type: "group",
        member_agent_ids: [setup.agent_id],
      })
    : { id: setup.thread_id };
  const snapshot: Snapshot = await page.request
    .get(`/v1/threads/${thread.id}/snapshot`)
    .then((r) => r.json());
  Object.assign(snapshot, {
    messages: [],
    runs: [],
    routes: [],
    human_requests: [],
    goals: [],
    routines: [],
    controls: [],
    tasks: [],
  });
  snapshot.timeline = { messages: [], parts: [], has_more: false, next_before: null };
  await page.route(`**/v1/threads/${thread.id}/snapshot*`, (route) =>
    route.fulfill({ json: snapshot }),
  );
  await page.addInitScript((id) => localStorage.setItem("ngertiin:thread", id), thread.id);
  function message(
    id: string,
    sequence: number,
    created: string,
    text: string,
    author = "user",
    published = created,
    runId: string | null = null,
  ) {
    const value: Message = {
      id,
      thread_id: thread.id,
      revision: 1,
      author,
      author_agent_id: author === "agent" ? setup.agent_id : null,
      text,
      state: "published",
      run_id: runId,
      created_at: created,
      artifact_ids: [],
      purpose: "conversation",
    };
    const part: ConversationPart = {
      id: `part:${id}`,
      sequence,
      source_cursor: snapshot.cursor,
      thread_id: thread.id,
      created_at: published,
      kind: "message",
      message_id: id,
      resource_id: null,
      source_message_id: null,
      name: "",
      summary: null,
      actors: author === "agent" ? snapshot.agents : [],
    };
    return { value, part };
  }
  function publish(...items: ReturnType<typeof message>[]) {
    snapshot.messages = items.map((item) => item.value);
    snapshot.timeline.messages = snapshot.messages;
    snapshot.timeline.parts = items.map((item) => item.part);
  }
  return { snapshot, thread, agentId: setup.agent_id as string, message, publish };
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme} calendar groups survive overlapping history and keep overnight queue publication clocks`, async ({
    page,
  }, info) => {
    await page.addInitScript(
      (theme) => localStorage.setItem("ngertiin-web-client-theme", theme),
      theme,
    );
    const f = await fixture(page);
    const old = f.message("late-note", 1, at(1, "23:59"), "Late note");
    const first = f.message("new-day", 2, at(2, "00:01"), "New day message");
    const queued = f.message(
      "queued-overnight",
      3,
      at(1, "23:59"),
      "Queued overnight",
      "user",
      at(2, "00:02"),
    );
    const latest = f.message("latest", 4, at(2, "09:00"), "Latest note");
    f.publish(queued, latest);
    f.snapshot.timeline.next_before = 3;
    f.snapshot.timeline.has_more = true;
    await page.route(`**/v1/threads/${f.thread.id}/timeline*`, (route) =>
      route.fulfill({
        json: {
          parts: [old.part, first.part, queued.part],
          messages: [old.value, first.value, queued.value],
          has_more: false,
          next_before: null,
        },
      }),
    );
    await page.goto("/");
    await expect(page.locator("[data-conversation-date]")).toHaveCount(1);
    await expect(page.locator("#message-queued-overnight .message-time")).toHaveAttribute(
      "datetime",
      at(2, "00:02"),
    );
    await page.getByRole("button", { name: "Pesan sebelumnya", exact: true }).click();
    const dates = page.locator("[data-conversation-date]");
    await expect(dates).toHaveText(["1 November 2026", "2 November 2026"]);
    await expect(page.locator("#message-new-day")).not.toHaveAttribute("data-join-above", "true");
    await expect(page.locator("#message-late-note")).not.toHaveAttribute("data-join-below", "true");
    await expect(page.locator("#message-queued-overnight")).toHaveCount(1);
    const geometry = await dates.last().evaluate((element) => {
      const label = element.querySelector("time")?.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return {
        offset: label
          ? Math.abs((label.left + label.right - bounds.left - bounds.right) / 2)
          : Infinity,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    expect(geometry.offset).toBeLessThan(1);
    expect(geometry.overflow).toBe(false);
    await page.locator("#message-new-day").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`dates-${theme}.png`) });
  });
}

test("group approval and finished Computer retain clocks while Goal/Routine bars remain timeless", async ({
  page,
}, info) => {
  const f = await fixture(page, true);
  const input = f.message("request", 1, at(1, "23:58"), "Prepare the summary");
  const question = f.message("approval", 2, at(1, "23:59"), "Approve this summary?", "agent");
  const output = f.message(
    "answer",
    3,
    at(2, "00:03"),
    "Summary ready.",
    "agent",
    at(2, "00:03"),
    "computer-run",
  );
  f.publish(input, question, output);
  const request = {
    id: "approval-request",
    revision: 1,
    created_at: at(2, "00:01"),
    thread_id: f.thread.id,
    agent_id: f.agentId,
    source_run_id: "approval-run",
    task_id: null,
    purpose: "approval",
    options: null,
    action: null,
    message_id: question.value.id,
    state: "pending",
    response_message_id: null,
    continuation_run_id: null,
  };
  f.snapshot.human_requests = [request];
  f.snapshot.runs = [
    sampleRun({
      id: "computer-run",
      agent_id: f.agentId,
      input_message_id: input.value.id,
      created_at: at(1, "23:58"),
      status: "succeeded",
      computer_activity: {
        machine_id: "fixture-machine",
        generation: 1,
        phase: "active",
        started_at: at(2, "00:02"),
      },
    }),
  ];
  for (const [index, kind] of ["goal_created", "routine_created"].entries())
    f.snapshot.timeline.parts.push({
      ...question.part,
      id: `event:${kind}`,
      kind: kind as "goal_created" | "routine_created",
      message_id: null,
      sequence: 4 + index,
      created_at: at(2, "00:05"),
      name: kind === "goal_created" ? "Review inventory" : "Daily check",
    });
  await page.route("**/v1/human-requests/approval-request/reply", async (route) => {
    expect(route.request().postDataJSON().decision).toBe("approve");
    request.state = "answered";
    f.snapshot.cursor++;
    await route.fulfill({ json: {} });
  });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Approve this summary?", exact: true });
  await expect(card.locator(".message-time")).toHaveAttribute("datetime", request.created_at);
  await expect(card.locator(".group-bubble-author")).toHaveCount(0);
  const computer = page.locator('[data-computer-activity="computer-run"]');
  await expect(computer.locator(".message-time")).toHaveAttribute("datetime", at(2, "00:02"));
  await expect(computer.locator("iframe")).toHaveCount(0);
  await expect(
    page.locator('[data-conversation-event="goal"], [data-conversation-event="routine"]'),
  ).toHaveCount(2);
  await expect(page.locator("[data-conversation-event] .message-time")).toHaveCount(0);
  await expect(page.locator("[data-conversation-date]")).toHaveText([
    "1 November 2026",
    "2 November 2026",
  ]);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("cards-pending.png") });
  await card.getByRole("button", { name: "Setujui", exact: true }).click();
  await expect(card).toHaveAttribute("data-interaction-state", "settled");
  await expect(card.locator(".message-time")).toHaveAttribute("datetime", request.created_at);
  await page.reload();
  await expect(card).toHaveAttribute("data-interaction-state", "settled");
  await expect(card.locator(".message-time")).toHaveAttribute("datetime", request.created_at);
  await expect(computer.locator(".message-time")).toHaveAttribute("datetime", at(2, "00:02"));
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("cards-settled.png") });
});

test("a verified native question crossing midnight splits dates without splitting Markdown or losing text", async ({
  page,
}, info) => {
  const f = await fixture(page, true);
  const input = f.message("input", 1, at(1, "23:58"), "Review the draft");
  const prefix = "Before the question.\n\n";
  const output = f.message(
    "native-answer",
    2,
    at(1, "23:59"),
    `${prefix}After the question.`,
    "agent",
    at(1, "23:59"),
    "native-run",
  );
  f.publish(input, output);
  const record = {
    id: "native-question",
    request_id: "question",
    type: "user_input",
    source_index: null,
    anchor_message_id: output.value.id,
    anchor_text_offset: prefix.length,
    anchor_prefix_sha256: createHash("sha256").update(prefix).digest("hex"),
    observed_at: at(2, "00:01"),
    last_observed_at: at(2, "00:04"),
    observed_state: "pending",
    submission: null,
    request: {
      userInputId: "question",
      questions: [
        {
          id: "format",
          header: "Format",
          question: "Which format?",
          options: [{ label: "Markdown" }],
          selection: { mode: "single" },
        },
      ],
    },
  };
  f.snapshot.runs = [
    sampleRun({
      id: "native-run",
      agent_id: f.agentId,
      input_message_id: input.value.id,
      created_at: input.value.created_at,
      native_interactions: [record],
    }),
  ];
  await page.goto("/");
  await expect(
    page.locator('[data-native-interaction="native-question"] .message-time'),
  ).toHaveAttribute("datetime", record.observed_at);
  await expect(page.locator("[data-native-history-fallback]")).toHaveCount(0);
  await expect(page.locator("[data-conversation-date]")).toHaveText([
    "1 November 2026",
    "2 November 2026",
  ]);
  await expect(page.getByText("Before the question.", { exact: true })).toBeVisible();
  await expect(page.getByText("After the question.", { exact: true })).toBeVisible();
  await expect(page.locator("#message-native-answer")).toHaveCount(1);
  expect(
    await page.locator(".conversation-column").evaluate((element) => {
      const items = [
        ...element.querySelectorAll(
          "[data-conversation-date], .chat-agent-bubble, [data-native-interaction]",
        ),
      ];
      return items.map(
        (item) => item.getAttribute("data-conversation-date") ?? item.textContent?.trim(),
      );
    }),
  ).toEqual([
    "2026-11-01",
    expect.stringContaining("Before the question."),
    "2026-11-02",
    expect.stringContaining("Permintaan tersimpan"),
    expect.stringContaining("After the question."),
  ]);
  await page.screenshot({ path: info.outputPath("native-midnight.png") });
});

test("file-only assistant replies retain their clock and attribution without an empty text bubble", async ({
  page,
}, info) => {
  for (const group of [false, true]) {
    const f = await fixture(page, group);
    const file = f.message("file-reply", 1, at(2, "00:08"), "", "agent");
    file.value.artifact_ids = ["summary-file"];
    f.publish(file);
    Object.assign(f.snapshot, {
      artifacts: [
        {
          id: "summary-file",
          name: "summary.csv",
          media_type: "text/csv",
          origin: "native_output",
          created_at: file.value.created_at,
        },
      ],
    });
    await page.goto("/");
    const attachment = page.locator("[data-message-attachments]");
    await expect(attachment.getByRole("button", { name: /summary.csv/ })).toBeVisible();
    await expect(attachment.locator(".message-time")).toHaveAttribute(
      "datetime",
      file.part.created_at,
    );
    await expect(attachment.locator(".group-bubble-author")).toHaveCount(0);
    await expect(page.locator(".chat-agent-bubble")).toHaveCount(0);
    await expect(page.locator("[data-conversation-date]")).toHaveText(["2 November 2026"]);
    await page.screenshot({ path: info.outputPath(`file-only-${group ? "group" : "dm"}.png`) });
  }
});
