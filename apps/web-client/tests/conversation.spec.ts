import { expect, type Locator, type Page, test } from "@playwright/test";
import { withTimeline } from "./conversation-fixture.js";

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "wait" });
});

async function idleDm(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const headers = () => ({ "Idempotency-Key": crypto.randomUUID() });
  const agentResponse = await page.request.post("/v1/agents", {
    headers: headers(),
    data: {
      name: `Queue regression ${crypto.randomUUID()}`,
      harness: "codex",
      connection_id: null,
    },
  });
  expect(agentResponse.ok(), await agentResponse.text()).toBeTruthy();
  const agent = await agentResponse.json();
  const threadResponse = await page.request.post(`/v1/agents/${agent.id}/dm`, {
    headers: headers(),
    data: {},
  });
  expect(threadResponse.ok()).toBeTruthy();
  const thread = await threadResponse.json();
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), thread.id);
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Detail ${agent.name}`, exact: true }),
  ).toBeVisible();
  return { agent, thread };
}

test("switching conversations keeps exactly one attachment button and editor", async ({ page }) => {
  const { agent, thread } = await idleDm(page);
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeFocused();
  for (let index = 0; index < 12; index++) {
    await sidebar(page);
    const target =
      index % 2 === 0
        ? page.locator("[data-thread-id]").filter({ hasText: "Tobi" }).first()
        : page.locator(`[data-thread-id="${thread.id}"]`);
    await target.click();
    await expect(
      page.getByRole("button", {
        name: `Detail ${index % 2 === 0 ? "Tobi" : agent.name}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Tambah lampiran", exact: true })).toHaveCount(1);
    await expect(page.getByLabel("Lampirkan file ke pesan", { exact: true })).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeFocused();
  }
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Composer still works.");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Tambah lampiran", exact: true }).click();
  expect((await chooser).isMultiple()).toBe(true);
});

test("an idle DM shows its first admitted message directly in the conversation", async ({
  page,
}) => {
  await idleDm(page);
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Send directly in an idle DM.");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(
    page.locator(".conversation-message .chat-user-bubble [data-message-text]"),
  ).toHaveText("Send directly in an idle DM.");
  await expect(page.locator("[data-queued-message]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Arahkan sekarang", exact: true })).toHaveCount(0);
  await expect(page.locator(".message-run-state")).toContainText("Waiting to start…");
});

test("event bursts update the conversation without repeatedly reloading global catalogs", async ({
  page,
}, testInfo) => {
  const { agent, thread } = await idleDm(page);
  const admitted = await page.request.post("/v1/runs", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { agent_id: agent.id, thread_id: thread.id, text: "Live revision 0" },
  });
  expect(admitted.ok()).toBeTruthy();
  const receipt = await admitted.json();
  await expect(page.locator(".chat-user-bubble [data-message-text]")).toHaveText("Live revision 0");
  const reads = { catalogs: 0, snapshots: 0, opening: 0 };
  page.on("request", (request) => {
    if (request.method() !== "GET") return;
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/v1/entities/")) reads.catalogs++;
    if (path === `/v1/threads/${thread.id}/snapshot`) reads.snapshots++;
    if (path === `/v1/threads/${thread.id}/opening`) reads.opening++;
  });
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Keep my unsent draft.");
  let revision = receipt.message.revision;
  for (let index = 1; index <= 16; index++) {
    const response = await page.request.post(`/v1/messages/${receipt.message.id}/edit`, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: { expected_revision: revision, text: `Live revision ${index}` },
    });
    expect(response.ok()).toBeTruthy();
    revision = (await response.json()).revision;
  }
  await expect(page.locator(".chat-user-bubble [data-message-text]")).toHaveText(
    "Live revision 16",
  );
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "Keep my unsent draft.",
  );
  expect(reads.catalogs).toBe(0);
  expect(reads.opening).toBe(0);
  expect(reads.snapshots).toBeLessThan(16);
  await testInfo.attach("projection-request-counts", {
    body: JSON.stringify({ committed_edits: 16, ...reads }),
    contentType: "application/json",
  });
});

test("blocked preparation explains readiness and exposes an exact-input retry", async ({
  page,
}) => {
  const { agent, thread } = await idleDm(page);
  await page.route(`**/v1/threads/${thread.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    await route.fulfill({
      response,
      json: {
        ...snapshot,
        runs: snapshot.runs.map((run: object) => ({
          ...run,
          preparation: { state: "blocked", attempts: 1, next_attempt_at: null },
          diagnostic: {
            code: "MODEL_UNAVAILABLE",
            category: "configuration",
            outcome: "not_dispatched",
          },
        })),
      },
    });
  });
  await page.request.post("/v1/runs", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: { agent_id: agent.id, thread_id: thread.id, text: "Keep this original request." },
  });
  await expect(page.locator("[data-agent-activity] [data-activity-text]")).toHaveText(
    "I couldn’t get started.",
  );
  const activity = page.locator("[data-agent-activity] .message-action-anchor");
  if (test.info().project.name === "mobile") await activity.tap();
  else await activity.hover();
  await expect(page.getByRole("button", { name: "Try again", exact: true })).toBeVisible();
  await expect(page.locator(".message-diagnostic")).toContainText("Choose an available model");
});

test("queued inputs enter the transcript after the preceding answer, including late answers and reload", async ({
  page,
}, testInfo) => {
  const { agent, thread } = await idleDm(page);
  let phase: "running" | "streaming" | "unknown" | "next" | "complete" = "running";
  // Admissions and FIFO identity use real HTTP/SQLite. Only native progress/output is a fixture.
  await page.route(`**/v1/threads/${thread.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot: { messages: unknown[]; runs: { id: string; created_at: string }[] } =
      await response.json();
    const answers: unknown[] = [];
    const runs = snapshot.runs.map((run, index) => {
      const done = phase === "complete" || (phase === "next" && index === 0);
      if (done || (phase === "streaming" && index === 0))
        answers.push({
          id: `answer-${run.id}`,
          revision: 1,
          created_at: run.created_at,
          thread_id: thread.id,
          author: "agent",
          author_agent_id: agent.id,
          text: `Answer ${index + 1}`,
          state: done ? "complete" : "partial",
          run_id: run.id,
          artifact_ids: [],
          purpose: "conversation",
        });
      return {
        ...run,
        status: done
          ? "succeeded"
          : index === 0
            ? phase === "unknown"
              ? "unknown"
              : "running"
            : "queued",
      };
    });
    const count = phase === "complete" ? 3 : phase === "next" ? 2 : 1;
    const published = snapshot.messages
      .slice(0, count)
      .flatMap((message, index) => [
        message,
        ...answers.filter((answer) => (answer as { run_id: string }).run_id === runs[index].id),
      ]);
    await route.fulfill({
      response,
      json: withTimeline(
        { ...snapshot, runs, messages: [...snapshot.messages, ...answers] },
        published,
      ),
    });
  });
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  for (const text of ["Input 1", "Input 2", "Input 3"]) {
    await expect(composer).toHaveAttribute("contenteditable", "true");
    await composer.fill(text);
    await composer.press("Enter");
    await expect(composer).toHaveText("");
  }
  await expect(page.locator("[data-queued-message]")).toHaveCount(2);
  phase = "streaming";
  await page.reload();
  await expect(page.getByText("Answer 1", { exact: true })).toBeVisible();
  await expect(page.locator("[data-queued-message]")).toHaveCount(2);
  phase = "unknown";
  await page.reload();
  await expect(page.getByRole("button", { name: "Check status", exact: true })).toBeVisible();
  await expect(page.locator("[data-queued-message]")).toHaveCount(2);
  phase = "next";
  await page.reload();
  await expect(
    page.locator(
      ".conversation-message .chat-user-bubble [data-message-text], .conversation-message .chat-agent-bubble [data-message-text]",
    ),
  ).toHaveText(["Input 1", "Answer 1", "Input 2"]);
  await expect(page.locator("[data-queued-message]")).toHaveCount(1);
  phase = "complete";
  await page.reload();
  await expect(
    page.locator(
      ".conversation-message .chat-user-bubble [data-message-text], .conversation-message .chat-agent-bubble [data-message-text]",
    ),
  ).toHaveText(["Input 1", "Answer 1", "Input 2", "Answer 2", "Input 3", "Answer 3"]);
  await expect(page.locator("[data-queued-message]")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("conversation-turn-order.png") });
});

async function sidebar(page: Page) {
  const button = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await button.isVisible()) await button.click();
}
async function createAgent(page: Page) {
  await sidebar(page);
  await page.getByRole("button", { name: "Buat baru" }).click();
  await expect(page.getByRole("button", { name: "Create group", exact: true })).toBeEnabled();
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
  const admitted = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  const original = admitted.messages.find(
    (message: { text: string }) => message.text === "Remember to keep answers concise.",
  );
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("Keep this unsent draft.");
  await queued.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Edit pesan", exact: true })).toBeFocused();
  await expect(page.getByRole("dialog", { name: "Edit pesan menunggu" })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Edit pesan", exact: true }).fill("Cancel this change.");
  await page.getByRole("textbox", { name: "Edit pesan", exact: true }).press("Escape");
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "Keep this unsent draft.",
  );
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeFocused();
  await expect(queued).toContainText("Remember to keep answers concise.");
  await queued.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Edit pesan" }).fill("Keep answers concise and useful.");
  await page.getByRole("textbox", { name: "Edit pesan", exact: true }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Edit pesan", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "Keep this unsent draft.",
  );
  await expect(page.getByText("Keep answers concise and useful.", { exact: true })).toBeVisible();
  const edited = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  expect(
    edited.messages.find((message: { id: string }) => message.id === original.id),
  ).toMatchObject({
    id: original.id,
    run_id: original.run_id,
    revision: original.revision + 1,
    text: "Keep answers concise and useful.",
  });
  expect(edited.runs.map((run: { id: string }) => run.id)).toEqual(
    admitted.runs.map((run: { id: string }) => run.id),
  );
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
  await expect(page.getByRole("tab", { name: "Details", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await expect(page.getByText("Prefers concise explanations.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "About Memory", exact: true }).click();
  await expect(page.getByRole("tooltip")).toContainText("remember, change, or forget");
  await page.keyboard.press("Escape");
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

test("queued composer edit replays a lost acknowledgement without another message or revision", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const created = await createAgent(page);
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await composer.fill("Edit this admitted message once.");
  await composer.press("Enter");
  const item = page
    .locator("[data-queued-message]")
    .filter({ hasText: "Edit this admitted message once." });
  await expect(item).toBeVisible();
  const before = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  const original = before.messages.find(
    (message: { text: string }) => message.text === "Edit this admitted message once.",
  );
  const operations: { key: string | undefined; body: unknown }[] = [];
  let committed = false;
  await page.route(`**/v1/messages/${original.id}/edit`, async (route) => {
    operations.push({
      key: route.request().headers()["idempotency-key"],
      body: route.request().postDataJSON(),
    });
    if (operations.length === 1) {
      const response = await route.fetch();
      expect(response.ok()).toBeTruthy();
      committed = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await composer.fill("Preserve the separate draft.");
  await item.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Edit pesan", exact: true });
  await editor.fill("The confirmed edited text.");
  await page.getByRole("button", { name: "Simpan pesan", exact: true }).click();
  await expect.poll(() => committed).toBeTruthy();
  await expect(editor).not.toBeEditable();
  await expect(page.getByRole("button", { name: "Batal edit pesan", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Periksa perubahan pesan", exact: true }).click();
  await expect(composer).toHaveText("Preserve the separate draft.");
  await expect(composer).toBeFocused();
  expect(operations).toHaveLength(2);
  expect(operations[0].key).toBeTruthy();
  expect(operations[1]).toEqual(operations[0]);
  const after = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  expect(
    after.messages.find((message: { id: string }) => message.id === original.id),
  ).toMatchObject({
    id: original.id,
    run_id: original.run_id,
    text: "The confirmed edited text.",
    revision: original.revision + 1,
  });
  expect(after.messages).toHaveLength(before.messages.length);
  expect(after.runs.map((run: { id: string }) => run.id)).toEqual(
    before.runs.map((run: { id: string }) => run.id),
  );
});

test("a second empty Enter steers only inside the source window and after a fresh native check", async ({
  page,
}) => {
  const now = new Date("2026-11-02T00:00:00Z");
  await page.clock.setFixedTime(now);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const created = await createAgent(page);
  const account = await page.request.post("/v1/connections", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    },
  });
  expect(account.ok()).toBeTruthy();
  const connection: { id: string } = await account.json();
  const configured = await page.request.post(`/v1/agents/${created.agent.id}/configuration`, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      expected_revision: created.agent.revision,
      changes: {
        connection_id: connection.id,
        harness: "codex",
        model_id: "keyboard-fixture",
        billing_source: "subscription",
      },
    },
  });
  expect(configured.ok()).toBeTruthy();
  // Only the active native lane, inspection and steer acknowledgement are UI fixtures.
  // Message admission, queue identity and edit/delete checks use the real API/SQLite.
  const steered = new Set<string>();
  const sent: { queued_run_id: string; expected_native_run_id: string }[] = [];
  let nativePending = false;
  await page.route("**/v1/entities/connection", async (route) => {
    const response = await route.fetch();
    const accounts: { id: string; capabilities: Record<string, string> }[] = await response.json();
    await route.fulfill({
      response,
      json: accounts.map((candidate) =>
        candidate.id === connection.id
          ? {
              ...candidate,
              login: "authenticated",
              effective_billing_source: "subscription",
              capabilities: {
                ...candidate.capabilities,
                steer: "supported",
                permission_requests: "supported",
              },
            }
          : candidate,
      ),
    });
  });
  await page.route(`**/v1/threads/${created.thread.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const snapshot: { runs: { id: string }[] } = await response.json();
    await route.fulfill({
      response,
      json: {
        ...snapshot,
        runs: snapshot.runs.map((run) =>
          run.id === created.run.id
            ? {
                ...run,
                status: "running",
                native_run_id: "keyboard-fixture-run",
                native_interactions: [],
              }
            : steered.has(run.id)
              ? { ...run, status: "steered" }
              : run,
        ),
      },
    });
  });
  await page.route(`**/v1/runs/${created.run.id}/interactions`, (route) =>
    route.fulfill({
      json: {
        approvals: [],
        user_inputs: nativePending
          ? [
              {
                userInputId: "keyboard-fixture-pending",
                questions: [
                  {
                    id: "decision",
                    header: "Decision",
                    question: "Choose before steering.",
                    options: [{ label: "Continue" }],
                    selection: { mode: "single" },
                  },
                ],
              },
            ]
          : [],
      },
    }),
  );
  await page.route(`**/v1/runs/${created.run.id}/steer`, async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    steered.add(body.queued_run_id);
    await route.fulfill({ json: { state: "accepted" } });
  });
  await page.reload();
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await expect(composer).toBeVisible();
  await composer.fill("Steer this admitted message.");
  await composer.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true });
  await expect(composer).toHaveText("Steer this admitted message.");
  await composer.press("Enter");
  await expect(composer).toHaveText("");
  await expect(page.getByRole("button", { name: "Arahkan sekarang", exact: true })).toBeEnabled();
  await composer.press("Enter");
  await expect.poll(() => sent.length).toBe(1);
  const first = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  const message = first.messages.find(
    (candidate: { text: string }) => candidate.text === "Steer this admitted message.",
  );
  expect(sent[0]).toEqual({
    queued_run_id: message.run_id,
    expected_native_run_id: "keyboard-fixture-run",
  });
  await expect(
    page.locator("[data-queued-message]").filter({ hasText: "Steer this admitted message." }),
  ).toHaveCount(0);
  await composer.press("Enter");
  expect(sent).toHaveLength(1);

  await composer.fill("An expired shortcut stays queued.");
  await composer.press("Enter");
  await expect(composer).toHaveText("");
  await expect(page.getByRole("button", { name: "Arahkan sekarang", exact: true })).toBeEnabled();
  await page.clock.setFixedTime(new Date(now.getTime() + 1501));
  await composer.press("Enter");
  expect(sent).toHaveLength(1);
  await expect(
    page.locator("[data-queued-message]").filter({ hasText: "An expired shortcut stays queued." }),
  ).toBeVisible();

  await composer.fill("A fresh pending request fences steering.");
  await composer.press("Enter");
  await expect(composer).toHaveText("");
  await expect(
    page.locator("[data-queued-message]").filter({
      hasText: "A fresh pending request fences steering.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Arahkan sekarang", exact: true })).toBeEnabled();
  nativePending = true;
  await composer.press("Enter");
  await expect(
    page.getByText("Jawab permintaan agent yang sedang menunggu sebelum mengarahkan antrean.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(sent).toHaveLength(1);
  const final = await page.request
    .get(`/v1/threads/${created.thread.id}/snapshot`)
    .then((r) => r.json());
  expect(final.messages).toHaveLength(4);
  expect(final.runs).toHaveLength(4);
  expect(
    final.messages.filter(
      (candidate: { text: string }) => candidate.text === "Steer this admitted message.",
    ),
  ).toHaveLength(1);
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
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "A durable message.",
  );
  await page.getByRole("button", { name: "Periksa pengiriman", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText("");
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
  await expect(page.getByRole("region", { name: /pesan menunggu$/ })).toHaveCount(0);
  await expect(page.locator(".message-run-state")).toContainText("Waiting to start…");
  await expect(page.getByText("Stopped.", { exact: true })).toHaveCount(0);
});

type ConversationMode = "dm" | "group";
type ScrollRecordingWindow = typeof window & {
  conversationScrollSamples: number[];
  recordConversationScroll: () => void;
};

async function expectAtBottom(scroll: Locator): Promise<void> {
  await expect
    .poll(() => scroll.evaluate((node) => node.scrollHeight - node.clientHeight - node.scrollTop))
    .toBeLessThanOrEqual(2);
}

async function expectRecordedScrollAtBottom(page: Page): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => (window as ScrollRecordingWindow).conversationScrollSamples.length),
      { timeout: 15000 },
    )
    .toBe(12);
  const samples = await page.evaluate(
    () => (window as ScrollRecordingWindow).conversationScrollSamples,
  );
  expect(samples[0]).toBeLessThanOrEqual(2);
  expect(Math.max(...samples)).toBeLessThanOrEqual(2);
}

async function scrollFixture(
  page: Page,
  mode: ConversationMode,
  { publishSubmitted = true }: { publishSubmitted?: boolean } = {},
) {
  const { agent, thread: dm } = await idleDm(page);
  let thread = dm;
  if (mode === "group") {
    const response = await page.request.post("/v1/threads", {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: { type: "group", member_agent_ids: [agent.id] },
    });
    expect(response.ok()).toBeTruthy();
    thread = await response.json();
  }
  const messages = Array.from({ length: 40 }, (_, index) => ({
    id: `scroll-history-${thread.id}-${index}`,
    revision: 1,
    created_at: new Date(1700000000000 + index * 1000).toISOString(),
    thread_id: thread.id,
    author: index % 2 ? "agent" : "user",
    author_agent_id: index % 2 ? agent.id : null,
    run_id: null,
    purpose: "conversation",
    state: "complete",
    artifact_ids: [],
    text: `History ${index}: A message long enough to wrap on a mobile screen.\n\nA second paragraph keeps the scrollable conversation taller than its viewport.`,
  }));
  await page.route(`**/v1/threads/${thread.id}/snapshot`, async (route) => {
    const response = await route.fetch();
    const value = await response.json();
    await route.fulfill({
      response,
      json: withTimeline(
        { ...value, messages: [...messages, ...value.messages] },
        publishSubmitted ? undefined : messages,
      ),
    });
  });
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), thread.id);
  return { agent, thread, messages };
}

for (const mode of ["dm", "group"] as const) {
  test(`${mode} opens at the latest message on its first visible frame`, async ({ page }) => {
    const f = await scrollFixture(page, mode);
    await page.addInitScript((lastMessageId) => {
      const samples: number[] = [];
      Object.assign(window, {
        conversationScrollSamples: samples,
        recordConversationScroll: () => {
          samples.length = 0;
          requestAnimationFrame(sample);
        },
      });
      function sample() {
        const scroll = document.querySelector<HTMLElement>(".conversation-scroll");
        if (
          scroll &&
          document.getElementById(`message-${lastMessageId}`) &&
          scroll.clientHeight > 0
        )
          samples.push(scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop);
        if (samples.length < 12) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, f.messages[39].id);
    await page.reload();
    await expectRecordedScrollAtBottom(page);
    await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeFocused();

    await sidebar(page);
    await page.locator("[data-thread-id]").filter({ hasText: "Tobi" }).first().click();
    await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
    await sidebar(page);
    await page.evaluate(() => (window as ScrollRecordingWindow).recordConversationScroll());
    const target = page.locator(`[data-thread-id="${f.thread.id}"]`);
    await target.evaluate((element) => element.scrollIntoView({ block: "nearest" }));
    await target.click();
    await expectRecordedScrollAtBottom(page);
    await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeFocused();
  });

  test(`${mode} sending a message returns to the bottom after reading older messages`, async ({
    page,
  }) => {
    await scrollFixture(page, mode);
    await page.reload();
    const scroll = page.locator(".conversation-scroll");
    await expect(page.locator(".conversation-message")).toHaveCount(40, { timeout: 15000 });
    await expectAtBottom(scroll);
    await scroll.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(page.getByRole("button", { name: "Pesan terbaru", exact: true })).toBeVisible();
    const text = `New ${mode} message from the normal composer`;
    await page.getByRole("textbox", { name: "Pesan", exact: true }).fill(text);
    await page.getByRole("button", { name: "Kirim", exact: true }).click();
    await expect(
      page.locator(".conversation-message [data-message-text]").filter({ hasText: text }),
    ).toHaveCount(1);
    await expectAtBottom(scroll);
  });

  test(`${mode} assistant updates preserve the position while reading history`, async ({
    page,
  }) => {
    const f = await scrollFixture(page, mode);
    await page.reload();
    const scroll = page.locator(".conversation-scroll");
    await expect(page.locator(".conversation-message")).toHaveCount(40, { timeout: 15000 });
    await expectAtBottom(scroll);
    await scroll.evaluate((node) => {
      node.scrollTop = 200;
    });
    await expect(page.getByRole("button", { name: "Pesan terbaru", exact: true })).toBeVisible();
    const before = await scroll.evaluate((node) => node.scrollTop);
    f.messages.push({
      ...f.messages[39],
      id: `late-${f.thread.id}`,
      text: "New assistant reply while reading history.",
    });
    const updated = await page.request.post(`/v1/agents/${f.agent.id}/configuration`, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: { expected_revision: f.agent.revision, changes: { soul: "Scroll history regression" } },
    });
    expect(updated.ok()).toBeTruthy();
    await expect(
      page.getByText("New assistant reply while reading history.", { exact: true }),
    ).toHaveCount(1);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    expect(await scroll.evaluate((node) => node.scrollTop)).toBeCloseTo(before, 0);
  });

  test(`${mode} queued sends reveal the bottom without publishing pending input`, async ({
    page,
  }) => {
    const f = await scrollFixture(page, mode, { publishSubmitted: false });
    await page.reload();
    const scroll = page.locator(".conversation-scroll");
    await expect(page.locator(".conversation-message")).toHaveCount(40, { timeout: 15000 });
    await expectAtBottom(scroll);
    await scroll.evaluate((node) => {
      node.scrollTop = 0;
    });
    await expect(page.getByRole("button", { name: "Pesan terbaru", exact: true })).toBeVisible();
    const text = `Queued ${mode} message while reading history`;
    const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
    const addressed =
      mode === "group" ? `[@${f.agent.name}](ngertiin://agent/${f.agent.id}) ${text}` : text;
    await composer.fill(addressed);
    await composer.press("Enter");
    await expect(page.locator("[data-queued-message]")).toContainText(text);
    await expect(page.locator(".conversation-message")).toHaveCount(40, { timeout: 15000 });
    await expectAtBottom(scroll);
  });
}
