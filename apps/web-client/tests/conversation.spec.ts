import { expect, type Page, test } from "@playwright/test";

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
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveValue(
    "Keep this unsent draft.",
  );
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeFocused();
  await expect(queued).toContainText("Remember to keep answers concise.");
  await queued.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("textbox", { name: "Edit pesan" }).fill("Keep answers concise and useful.");
  await page.getByRole("textbox", { name: "Edit pesan", exact: true }).press("Enter");
  await expect(page.getByRole("textbox", { name: "Edit pesan", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveValue(
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
  await expect(page.getByRole("tab", { name: "Agent", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Memory/ }).click();
  await expect(page.getByText("Prefers concise explanations.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Koreksi", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Koreksi memory" })
    .fill("Prefers short Indonesian explanations.");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(
    page.getByText("Prefers short Indonesian explanations.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hapus memory" }).click();
  await expect(
    page.getByText("Prefers short Indonesian explanations.", { exact: true }),
  ).toHaveCount(0);
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
  await expect(composer).toHaveValue("Preserve the separate draft.");
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
  await expect(composer).toHaveValue("Steer this admitted message.");
  await composer.press("Enter");
  await expect(composer).toHaveValue("");
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
  await expect(composer).toHaveValue("");
  await expect(page.getByRole("button", { name: "Arahkan sekarang", exact: true })).toBeEnabled();
  await page.clock.setFixedTime(new Date(now.getTime() + 1501));
  await composer.press("Enter");
  expect(sent).toHaveLength(1);
  await expect(
    page.locator("[data-queued-message]").filter({ hasText: "An expired shortcut stays queued." }),
  ).toBeVisible();

  await composer.fill("A fresh pending request fences steering.");
  await composer.press("Enter");
  await expect(composer).toHaveValue("");
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
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveValue(
    "A durable message.",
  );
  await page.getByRole("button", { name: "Periksa pengiriman", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveValue("");
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
  await expect(page.getByRole("region", { name: /pesan menunggu$/ })).toBeVisible();
  await expect(page.getByText("Dihentikan", { exact: true })).toHaveCount(0);
});
