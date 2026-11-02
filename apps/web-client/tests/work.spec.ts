import { createHash } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function capture(page: Page, path: string) {
  await page
    .locator('[data-slot="sheet-content"], [data-slot="dialog-content"]')
    .evaluateAll(async (surfaces) => {
      const animations = surfaces
        .flatMap((surface) => surface.getAnimations())
        .filter((animation) =>
          Number.isFinite(Number(animation.effect?.getComputedTiming().endTime)),
        );
      await Promise.allSettled(animations.map((animation) => animation.finished));
    });
  await page.screenshot({ path });
}
async function expectNativeReceiptOrder(page: Page, ids: string[]) {
  expect(
    await page.evaluate((expected) => {
      const user = [...document.querySelectorAll(".chat-user-bubble [data-message-text]")].find(
        (element) => element.textContent?.trim() === "fixture interaction preface",
      );
      const preface = [...document.querySelectorAll("p")].find(
        (element) => element.textContent === "Before the question.",
      );
      const reply = [...document.querySelectorAll("p")].find(
        (element) => element.textContent === "Fixture answer: Markdown; approval: allow-once",
      );
      return expected.every((id) => {
        const card = document.querySelector(`[data-native-interaction="${id}"]`);
        return (
          user &&
          preface &&
          reply &&
          card &&
          !!(user.compareDocumentPosition(preface) & Node.DOCUMENT_POSITION_FOLLOWING) &&
          !!(preface.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING) &&
          !!(card.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING)
        );
      });
    }, ids),
  ).toBeTruthy();
}
async function start(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const a = await post(page, "/v1/creation/agents", {
    connection_id: null,
    harness: "codex",
    model_id: null,
    billing_source: "subscription",
  });
  const b = await post(page, "/v1/creation/agents", {
    connection_id: null,
    harness: "codex",
    model_id: null,
    billing_source: "subscription",
  });
  return { a, b };
}
async function menu(page: Page) {
  const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await open.isVisible()) await open.click();
  await page.getByRole("button", { name: "Buat baru", exact: true }).click();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
}
async function chooseAgent(page: Page, name: string) {
  const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await open.isVisible()) await open.click();
  await page
    .getByRole("navigation", { name: "Percakapan", exact: true })
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(page.getByRole("button", { name: `Detail ${name}`, exact: true })).toBeVisible();
}
async function revokeFixtureApps(page: Page, toolkit: string) {
  const connections = await (await page.request.get("/v1/apps/connections")).json();
  for (const connection of connections)
    if (connection.toolkit === toolkit && connection.state !== "revoked")
      await post(page, `/v1/apps/connections/${connection.id}/revoke`, {});
}

test("contextual goals, Routine and files use real scoped state and keep stop responsibility distinct from stop run", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const { a } = await start(page);
  const goal = await post(page, "/v1/goals", {
    thread_id: a.thread.id,
    agent_id: a.agent.id,
    title: "Research progress",
  });
  const routine = await post(page, "/v1/routines", {
    thread_id: a.thread.id,
    agent_id: a.agent.id,
    instruction: "Check research progress",
    goal_id: goal.id,
    schedule: { type: "once", at: "2035-01-01T00:00:00.000Z" },
    timezone: "Asia/Makassar",
  });
  await chooseAgent(page, a.agent.name);
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await expect(page.locator("#conversation-details").getByRole("tab")).toHaveText([
    "Detail",
    "Library",
    "Computer",
  ]);
  await expect(page.locator(".context-hero").getByRole("status")).toHaveCount(0);
  await expect(page.locator(".context-hero [data-activity-label]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ubah avatar", exact: true })).toHaveCount(0);
  await capture(page, testInfo.outputPath("agent-profile.png"));
  await page
    .locator("#conversation-details")
    .getByRole("button", { name: "Pilih model", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "Pilih model", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tab", { name: "Detail", exact: true })).toBeVisible();
  await page.locator('[data-panel-nav="Goals"]').click();
  await capture(page, testInfo.outputPath("goals-list.png"));
  await page.getByRole("button", { name: "Research progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Research progress", exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Stop run menghentikan satu eksekusi. Pause/stop goal juga menghentikan kelanjutannya.",
      { exact: true },
    ),
  ).toBeVisible();
  await capture(page, testInfo.outputPath("goal-detail.png"));
  const initial = await (await page.request.get(`/v1/threads/${a.thread.id}/snapshot`)).json();
  const userAdmissions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/v1\/(runs|groups\/[^/]+\/messages)$/.test(request.url()))
      userAdmissions.push(request.url());
  });
  let firstControlKey = "";
  let committedPause: { revision: number; state: string } | undefined;
  await page.route(`**/v1/goals/${goal.id}/control`, async (route) => {
    firstControlKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    committedPause = await response.json();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Jeda goal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Periksa perubahan", exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.locator('[data-panel-nav="Goals"]').click();
  await page.getByRole("button", { name: "Research progress", exact: true }).click();
  await expect(page.getByRole("button", { name: "Periksa perubahan", exact: true })).toBeVisible();
  await page.unroute(`**/v1/goals/${goal.id}/control`);
  const retry = page.waitForRequest((request) =>
    request.url().endsWith(`/v1/goals/${goal.id}/control`),
  );
  await page.getByRole("button", { name: "Periksa perubahan", exact: true }).click();
  expect((await retry).headers()["idempotency-key"]).toBe(firstControlKey);
  await expect(page.getByRole("button", { name: "Periksa perubahan", exact: true })).toHaveCount(0);
  let state = await (await page.request.get(`/v1/threads/${a.thread.id}/snapshot`)).json();
  expect(state.goals.find((item: { id: string }) => item.id === goal.id).revision).toBe(
    committedPause?.revision,
  );
  expect(state.goals.find((item: { id: string }) => item.id === goal.id).state).toBe("paused");
  expect(state.routines.find((item: { id: string }) => item.id === routine.id).state).toBe(
    "paused",
  );
  expect(state.runs.map((item: { id: string }) => item.id).sort()).toEqual(
    initial.runs.map((item: { id: string }) => item.id).sort(),
  );
  const resume = page.waitForResponse((response) =>
    response.url().endsWith(`/v1/goals/${goal.id}/control`),
  );
  await page.getByRole("button", { name: "Lanjutkan goal", exact: true }).click();
  expect((await resume).ok()).toBeTruthy();
  await page.getByRole("button", { name: "Kembali ke goals", exact: true }).click();
  await page.getByRole("button", { name: "Kembali ke detail", exact: true }).click();
  await page.locator('[data-panel-nav="Routine"]').click();
  const pauseRoutine = page.waitForResponse((response) =>
    response.url().endsWith(`/v1/routines/${routine.id}/control`),
  );
  await page.getByRole("switch", { name: "Routine Check research progress", exact: true }).click();
  expect((await pauseRoutine).ok()).toBeTruthy();
  await expect(
    page.getByRole("switch", { name: "Routine Check research progress", exact: true }),
  ).not.toBeChecked();
  state = await (await page.request.get(`/v1/threads/${a.thread.id}/snapshot`)).json();
  expect(state.routines.find((item: { id: string }) => item.id === routine.id).state).toBe(
    "paused",
  );
  await page.getByRole("button", { name: "Check research progress", exact: true }).click();
  await expect(page.getByText("Asia/Makassar", { exact: true })).toBeVisible();
  const enableRoutine = page.waitForResponse((response) =>
    response.url().endsWith(`/v1/routines/${routine.id}/control`),
  );
  await page.getByRole("switch", { name: "Routine Check research progress", exact: true }).click();
  expect((await enableRoutine).ok()).toBeTruthy();
  await expect(
    page.getByRole("switch", { name: "Routine Check research progress", exact: true }),
  ).toBeChecked();
  await capture(page, testInfo.outputPath("routine-detail.png"));
  await page.getByRole("button", { name: "Terkait goal: Research progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Research progress", exact: true })).toBeVisible();
  const stopGoal = page.waitForResponse((response) =>
    response.url().endsWith(`/v1/goals/${goal.id}/control`),
  );
  await page.getByRole("button", { name: "Hentikan goal", exact: true }).click();
  expect((await stopGoal).ok()).toBeTruthy();
  state = await (await page.request.get(`/v1/threads/${a.thread.id}/snapshot`)).json();
  expect(state.goals.find((item: { id: string }) => item.id === goal.id).state).toBe("stopped");
  expect(state.routines.find((item: { id: string }) => item.id === routine.id).state).toBe(
    "stopped",
  );
  const admitted = state.runs.filter(
    (run: { id: string }) =>
      !initial.runs.some((previous: { id: string }) => previous.id === run.id),
  );
  expect(admitted.length).toBeLessThanOrEqual(1);
  expect(
    admitted.every(
      (run: { goal_id: string; routine_id: string | null }) =>
        run.goal_id === goal.id && run.routine_id === null,
    ),
  ).toBeTruthy();
  expect(
    state.messages
      .filter((item: { author: string }) => item.author === "user")
      .map((item: { id: string }) => item.id)
      .sort(),
  ).toEqual(
    initial.messages
      .filter((item: { author: string }) => item.author === "user")
      .map((item: { id: string }) => item.id)
      .sort(),
  );
  expect(userAdmissions).toEqual([]);
  await expect(page.locator('[role="textbox"][aria-label="Pesan"]')).toHaveText("");
  await page.getByRole("button", { name: "Kembali ke goals", exact: true }).click();
  await page.getByRole("button", { name: "Kembali ke detail", exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "Gunakan folder percakapan", exact: true }).click();
  await page.getByLabel("Unggah file", { exact: true }).setInputFiles({
    name: "research.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Verifiable research result."),
  });
  await page.getByRole("button", { name: "Buka research.txt", exact: true }).click();
  await expect(page.getByText("Verifiable research result.", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Unduh file", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("research.txt");
  await page.getByRole("button", { name: "Close", exact: true }).last().click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await capture(page, testInfo.outputPath(`${testInfo.project.name}-files.png`));
});

test("file previews reuse source tables, code and markdown without executing file HTML", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const { a } = await start(page);
  const workspace = await post(page, "/v1/workspaces", {
    thread_id: a.thread.id,
    agent_id: a.agent.id,
  });
  const samples = [
    {
      name: "records.csv",
      media_type: "text/csv",
      text: 'ID,Value\n001,"hello, world"\n002,"He said ""Hi"""\n003,<b>not HTML</b>\n',
    },
    {
      name: "preview.html",
      media_type: "text/html",
      text: '<!doctype html><script>window.__previewExecuted=1</script><img src="https://example.invalid/preview-network" onerror="window.__previewExecuted=2">',
    },
    {
      name: "notes.md",
      media_type: "text/markdown",
      text: "# Preview notes\n\n**A useful result**\n\n| ID | Result |\n|---|---|\n| 001 | preserved |\n\n<script>window.__previewExecuted=3</script>",
    },
    { name: "ragged.csv", media_type: "text/csv", text: "ID,Value\n001\n" },
    { name: "large.csv", media_type: "text/csv", text: `ID,Value\n001,${"x".repeat(128000)}` },
  ];
  for (const file of samples)
    await post(page, `/v1/workspaces/${workspace.id}/uploads`, {
      name: file.name,
      media_type: file.media_type,
      content_base64: Buffer.from(file.text).toString("base64"),
    });
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.invalid/preview-network")) external.push(request.url());
  });
  await chooseAgent(page, a.agent.name);
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  async function open(name: string) {
    await expect(page.locator('[data-slot="dialog-content"]')).toHaveCount(0);
    const back = page.locator("#conversation-details [data-panel-back]");
    if (await back.count()) await back.click();
    await page.getByRole("button", { name: `File ${name}`, exact: true }).click();
    await page.getByRole("button", { name: `Buka ${name}`, exact: true }).click();
    return page.getByRole("dialog", { name, exact: true });
  }
  let preview = await open("records.csv");
  await expect(preview.getByRole("cell", { name: "001", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "hello, world", exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: 'He said "Hi"', exact: true })).toBeVisible();
  await expect(preview.getByRole("cell", { name: "<b>not HTML</b>", exact: true })).toBeVisible();
  await preview.getByRole("button", { name: "Urutkan ID", exact: true }).click();
  await expect(preview.getByRole("columnheader", { name: /ID/ })).toHaveAttribute(
    "aria-sort",
    "ascending",
  );
  await expect(preview.getByRole("button", { name: "Perbesar tabel", exact: true })).toHaveCount(0);
  await capture(page, testInfo.outputPath("file-table.png"));
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  preview = await open("preview.html");
  await expect(preview.locator("[data-code-block]")).toContainText("window.__previewExecuted=1");
  await expect(preview.getByRole("button", { name: "Salin kode", exact: true })).toHaveCount(1);
  await capture(page, testInfo.outputPath("file-code.png"));
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  preview = await open("notes.md");
  await expect(preview.getByRole("heading", { name: "Preview notes", exact: true })).toBeVisible();
  await expect(preview.locator("strong")).toHaveText("A useful result");
  await expect(preview.locator(".chat-agent-bubble")).toHaveCount(0);
  await capture(page, testInfo.outputPath("file-markdown.png"));
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  preview = await open("ragged.csv");
  await expect(preview.getByRole("alert")).toContainText("Tabel tidak valid");
  await preview.getByRole("button", { name: "Close", exact: true }).click();
  preview = await open("large.csv");
  await expect(preview.getByRole("alert")).toContainText("batas pratinjau 128 KB");
  await expect(preview.getByRole("link", { name: "Unduh file", exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.hasOwn(window, "__previewExecuted"))).toBeFalsy();
  expect(external).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});

test("group creation recovers a lost acknowledgement, routes messages and keeps member DM resources private", async ({
  page,
}, testInfo) => {
  const { a, b } = await start(page);
  await post(page, "/v1/learning/memories/write", {
    context: { agent_id: a.agent.id, thread_id: a.thread.id },
    memory_id: crypto.randomUUID(),
    expected_revision: 0,
    visibility: "dm_private",
    text: "Private member memory must stay in its DM.",
  });
  await menu(page);
  await page.getByLabel("Nama grup", { exact: true }).fill("Research circle");
  await page.getByRole("checkbox", { name: a.agent.name, exact: true }).check();
  await page.getByRole("checkbox", { name: b.agent.name, exact: true }).check();
  await capture(page, testInfo.outputPath("create-group.png"));
  let created: { thread: { id: string } } | undefined;
  await page.route("**/v1/creation/groups", async (route) => {
    created = await (await route.fetch()).json();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Buat grup", exact: true }).click();
  await expect.poll(() => created?.thread.id).toBeTruthy();
  await page.unroute("**/v1/creation/groups");
  await page.reload();
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  await menu(page);
  await expect(page.getByLabel("Nama grup", { exact: true })).toHaveValue("Research circle");
  await page.getByRole("button", { name: "Periksa pembuatan grup", exact: true }).click();
  await page.getByRole("button", { name: "Detail Research circle", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Detail", exact: true })).toBeVisible();
  await capture(page, testInfo.outputPath("group-profile.png"));
  await page.getByRole("button", { name: `Profil anggota ${a.agent.name}`, exact: true }).click();
  await expect(
    page.getByText("Private member memory must stay in its DM.", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Hapus memory", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Kembali ke anggota", exact: true }).click();
  const close = page.getByRole("button", { name: "Tutup detail", exact: true });
  if (await close.isVisible()) await close.click();
  else await page.getByRole("button", { name: "Close", exact: true }).click();
  const opening = await (
    await page.request.get(`/v1/threads/${created?.thread.id}/opening`)
  ).json();
  await post(page, `/v1/runs/${opening.run.id}/cancel`, {});
  await page.getByRole("button", { name: "Lanjutkan pembuka", exact: true }).click();
  await expect(page.getByRole("button", { name: "Lanjutkan pembuka", exact: true })).toHaveCount(0);
  const continued = await (
    await page.request.get(`/v1/threads/${created?.thread.id}/opening`)
  ).json();
  expect(continued.message.id).toBe(opening.message.id);
  expect(continued.run.id).not.toBe(opening.run.id);
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Find a useful research direction.");
  const sent = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/v1/groups/${created?.thread.id}/messages`) &&
      r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  expect((await sent).ok()).toBeTruthy();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Detail Research circle", exact: true }),
  ).toBeVisible();
  const snapshot = await (
    await page.request.get(`/v1/threads/${created?.thread.id}/snapshot`)
  ).json();
  expect(
    snapshot.messages.filter(
      (m: { creation_operation_id: string | null }) => m.creation_operation_id,
    ),
  ).toHaveLength(1);
  expect(snapshot.routes).toHaveLength(2);
  expect(snapshot.goals).toHaveLength(0);
});

test("browser viewer connects to the managed browser and reconnects its view without replaying actions", async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  const { a } = await start(page);
  let openRequests = 0;
  page.on("request", (request) => {
    if (/\/v1\/browser\/profiles\/[^/]+\/open$/.test(request.url()) && request.method() === "POST")
      openRequests++;
  });
  await chooseAgent(page, a.agent.name);
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Computer", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Aktifkan browser percakapan", exact: true }),
  ).toBeVisible();
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/v1/browser/profiles") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Aktifkan browser percakapan", exact: true }).click();
  const profile = await (await created).json();
  await capture(page, testInfo.outputPath("browser-profiles.png"));
  let sessionId = "";
  try {
    const opened = page.waitForResponse((r) =>
      r.url().endsWith(`/v1/browser/profiles/${profile.id}/open`),
    );
    await page.getByRole("button", { name: "Lihat browser", exact: true }).click();
    sessionId = (await (await opened).json()).id;
    await expect(page.getByText("Tampilan terhubung", { exact: true })).toBeVisible({
      timeout: 45000,
    });
    await expect(
      page.getByRole("dialog", { name: "Browser percakapan", exact: true }).locator("canvas"),
    ).toBeVisible();
    await capture(page, testInfo.outputPath("browser-view.png"));
    const renewed = page.waitForResponse((response) =>
      response.url().endsWith(`/v1/browser/sessions/${sessionId}/view`),
    );
    await page.getByRole("button", { name: "Sambungkan ulang tampilan", exact: true }).click();
    await renewed;
    await expect(page.getByText("Tampilan terhubung", { exact: true })).toBeVisible();
    expect(openRequests).toBe(1);
    const previewRead = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        response.url().includes(`/v1/browser/sessions/${sessionId}?`),
    );
    await page
      .getByRole("dialog", { name: "Browser percakapan", exact: true })
      .getByRole("button", { name: "Close", exact: true })
      .click();
    const observationResponse = await previewRead;
    const observation = await observationResponse.json();
    const hasRaster =
      observationResponse.ok() &&
      observation.content?.some(
        (item: { type: string; mimeType?: string }) =>
          item.type === "image" &&
          ["image/png", "image/jpeg", "image/webp"].includes(item.mimeType ?? ""),
      );
    if (hasRaster)
      await expect(
        page.getByAltText("Pratinjau dari sesi browser yang sama", { exact: true }),
      ).toBeVisible();
    else {
      await expect(
        page.getByAltText("Pratinjau dari sesi browser yang sama", { exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: `Lihat tampilan browser ${a.agent.name}`, exact: true }),
      ).toContainText("Sesi tersedia");
    }
    await capture(page, testInfo.outputPath("browser-preview.png"));
    const existingView = page.waitForResponse((response) =>
      response.url().endsWith(`/v1/browser/sessions/${sessionId}/view`),
    );
    await page
      .getByRole("button", { name: `Lihat tampilan browser ${a.agent.name}`, exact: true })
      .click();
    await existingView;
    await expect(page.getByText("Tampilan terhubung", { exact: true })).toBeVisible();
    expect(openRequests).toBe(1);
    const receipts = await (
      await page.request.get(
        `/v1/browser/sessions/${sessionId}/receipts?agent_id=${a.agent.id}&thread_id=${a.thread.id}`,
      )
    ).json();
    expect(receipts).toHaveLength(0);
  } finally {
    if (sessionId)
      await post(page, `/v1/browser/sessions/${sessionId}/control`, {
        agent_id: a.agent.id,
        thread_id: a.thread.id,
        operation: "close",
      });
  }
});

test("application access is assigned explicitly to this context and unsupported images never upload", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const { a } = await start(page);
  await revokeFixtureApps(page, "calendar");
  await page
    .context()
    .route("https://example.invalid/fixture-connect", (route) =>
      route.fulfill({ contentType: "text/html", body: "Fixture authorization boundary" }),
    );
  await chooseAgent(page, a.agent.name);
  await page.getByLabel("Lampirkan file ke pesan", { exact: true }).setInputFiles({
    name: "image.png",
    mimeType: "image/png",
    buffer: Buffer.from("unsupported input must not upload"),
  });
  await expect(
    page.getByText("Input gambar belum didukung oleh koneksi dan model yang dipilih.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await (await page.request.get(`/v1/threads/${a.thread.id}/snapshot`)).json()).artifacts,
  ).toHaveLength(0);
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByText("Koneksi aplikasi", { exact: true }).click();
  await expect(page.getByText("Calendar fixture", { exact: true })).toBeVisible();
  await expect(page.getByText("Mail fixture", { exact: true })).toBeVisible();
  await capture(page, testInfo.outputPath("apps-catalog.png"));
  await page.getByRole("textbox", { name: "Cari aplikasi", exact: true }).fill("calendar");
  await expect(
    page.getByRole("button", { name: "Hubungkan Mail fixture", exact: true }),
  ).toHaveCount(0);
  const connected = page.waitForResponse(
    (r) => r.url().endsWith("/v1/apps/connect") && r.request().method() === "POST",
  );
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Hubungkan Calendar fixture", exact: true }).click();
  const authorizationPage = await opened;
  await expect(authorizationPage).toHaveURL("https://example.invalid/fixture-connect");
  expect(await authorizationPage.evaluate(() => window.opener)).toBeNull();
  await authorizationPage.close();
  const created = (await (await connected).json()).connection;
  const account = page.getByRole("region", {
    name: `Koneksi calendar ${created.id.slice(0, 8)}`,
    exact: true,
  });
  // Authorization is a provider fixture; only the real refresh receipt enables scoped access.
  await expect(
    account.getByRole("button", { name: "Kelola akses calendar", exact: true }),
  ).toBeVisible({ timeout: 12000 });
  expect(
    (await (await page.request.get("/v1/apps/connections")).json()).find(
      (connection: { id: string }) => connection.id === created.id,
    ).grants,
  ).toEqual([]);
  await capture(page, testInfo.outputPath("apps-connected.png"));
  await account.getByRole("button", { name: "Kelola akses calendar", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Cari tindakan aplikasi", exact: true })
    .fill("list calendar");
  await page.getByRole("button", { name: "Cari tindakan", exact: true }).click();
  await page.getByRole("checkbox", { name: "Read upcoming calendar events", exact: true }).check();
  await page.getByRole("button", { name: "Simpan akses percakapan", exact: true }).click();
  await expect(page.getByText("Akses percakapan diperbarui.", { exact: true })).toBeVisible();
  const connections = await (await page.request.get("/v1/apps/connections")).json();
  const calendar = connections.find((c: { id: string }) => c.id === created.id);
  expect(calendar.grants).toEqual([
    { thread_id: a.thread.id, agent_id: a.agent.id, tools: ["CALENDAR_LIST_EVENTS"] },
  ]);
  const harness = await post(page, "/v1/connections", {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  await post(page, `/v1/agents/${a.agent.id}/configuration`, {
    expected_revision: a.agent.revision,
    changes: { connection_id: harness.id, model_id: "fixture", billing_source: "subscription" },
  });
  const close = page.getByRole("button", { name: "Tutup detail", exact: true });
  if (await close.isVisible()) await close.click();
  else await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page
      .getByRole("main", { name: "Percakapan aktif" })
      .getByText("Fixture ready", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill(`fixture apps:${created.id}`);
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByText("Koneksi aplikasi", { exact: true }).click();
  await page.getByText("calendar list events · Berhasil", { exact: true }).click();
  await expect(page.getByText("Receipt: fixture-provider-receipt", { exact: true })).toBeVisible();
});

test("apps catalog searches live and authorization recovers from blocked popups and failed reads without changing grants", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  const { a } = await start(page);
  await revokeFixtureApps(page, "mail");
  await chooseAgent(page, a.agent.name);
  let catalogFailed = false;
  await page.route("**/v1/apps/catalog?**", async (route) => {
    if (!catalogFailed) {
      catalogFailed = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByText("Koneksi aplikasi", { exact: true }).click();
  await page.getByRole("button", { name: "Muat ulang katalog", exact: true }).click();
  await expect(page.getByText("Calendar fixture", { exact: true })).toBeVisible();
  await expect(page.getByText("Mail fixture", { exact: true })).toBeVisible();
  const search = page.getByRole("textbox", { name: "Cari aplikasi", exact: true });
  await search.fill("no matching fixture app");
  await expect(page.getByText("Tidak ada aplikasi yang cocok.", { exact: true })).toBeVisible();
  await search.fill("mail");
  await expect(page.getByText("Calendar fixture", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Hubungkan Mail fixture", exact: true }),
  ).toBeVisible();
  // The external provider is a fixture. A blocked popup must retain the server-issued link;
  // connect, refresh, reconnect and assignment receipts still come from the real scoped API.
  await page.evaluate(() => {
    window.open = () => null;
  });
  const commands: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      /\/v1\/apps\/(?:connect|connections\/[^/]+\/reconnect)$/.test(request.url())
    )
      commands.push(request.url());
  });
  const connected = page.waitForResponse((response) => response.url().endsWith("/v1/apps/connect"));
  await page.getByRole("button", { name: "Hubungkan Mail fixture", exact: true }).click();
  const created = (await (await connected).json()).connection;
  expect(created.grants).toEqual([]);
  const account = page.getByRole("region", {
    name: `Koneksi mail ${created.id.slice(0, 8)}`,
    exact: true,
  });
  await expect(
    page.getByText("Jendela login diblokir. Gunakan tautan Lanjutkan koneksi di bawah.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    account.getByRole("link", { name: "Lanjutkan koneksi di Composio ↗", exact: true }),
  ).toHaveAttribute("href", "https://example.invalid/fixture-connect");
  let readFailed = false;
  await page.route(`**/v1/apps/connections/${created.id}/refresh`, async (route) => {
    if (!readFailed) {
      readFailed = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await expect(
    page.getByText(
      "Status koneksi belum dapat diperiksa. Lanjutkan login, lalu periksa koneksi lagi.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 12000 });
  await account.getByRole("button", { name: "Periksa koneksi mail", exact: true }).click();
  await expect(
    account.getByRole("button", { name: "Hubungkan ulang mail", exact: true }),
  ).toBeVisible();
  const before = (await (await page.request.get("/v1/apps/connections")).json()).find(
    (connection: { id: string }) => connection.id === created.id,
  );
  expect(before.state).toBe("auth_required");
  expect(before.grants).toEqual([]);
  // An explicit existing grant is setup for the reconnect-preservation assertion, never an automatic grant.
  const grants = [{ thread_id: a.thread.id, agent_id: a.agent.id, tools: ["MAIL_LIST_MESSAGES"] }];
  await post(page, `/v1/apps/connections/${created.id}/assign`, {
    expected_revision: before.revision,
    grants,
  });
  await capture(page, testInfo.outputPath("apps-auth-recovery.png"));
  const reconnected = page.waitForResponse((response) =>
    response.url().endsWith(`/v1/apps/connections/${created.id}/reconnect`),
  );
  await account.getByRole("button", { name: "Hubungkan ulang mail", exact: true }).click();
  const renewed = (await (await reconnected).json()).connection;
  expect(renewed.id).toBe(created.id);
  expect(renewed.account_id).not.toBe(created.account_id);
  expect(renewed.grants).toEqual(grants);
  await expect(account.getByRole("button", { name: "Kelola akses mail", exact: true })).toBeVisible(
    { timeout: 12000 },
  );
  const persisted = (await (await page.request.get("/v1/apps/connections")).json()).find(
    (connection: { id: string }) => connection.id === created.id,
  );
  expect(persisted.state).toBe("active");
  expect(persisted.grants).toEqual(grants);
  expect(commands).toHaveLength(2);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await capture(page, testInfo.outputPath("apps-reconnected.png"));
  await account.getByRole("button", { name: "Kelola akses mail", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "mail list messages", exact: true }),
  ).toBeChecked();
});

test("tool calls stay out of the conversation while native receipts remain persisted", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agent = await fixtureAgent(page, "Native tool activity");
  const thread = await post(page, `/v1/agents/${agent.id}/dm`, {});
  await chooseAgent(page, agent.name);
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("fixture tools");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(
    page
      .getByRole("main", { name: "Percakapan aktif" })
      .getByText("Fixture ready", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect
    .poll(async () => {
      const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
      return snapshot.runs.flatMap((run: { native_tools: { state: string }[] }) =>
        run.native_tools.map((tool) => tool.state),
      );
    })
    .toEqual(["completed", "completed", "failed", "started"]);
  await expect(page.locator("[data-activity-run], [data-tool-activity]")).toHaveCount(0);
  await expect(page.getByText("fixture_read_source", { exact: true })).toHaveCount(0);
  await capture(page, testInfo.outputPath("tool-calls-hidden.png"));
  await page.reload();
  await expect(
    page
      .getByRole("main", { name: "Percakapan aktif" })
      .getByText("Fixture ready", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-activity-run], [data-tool-activity]")).toHaveCount(0);
});

test("native acknowledgements survive lost HTTP replies, completion, reload and connection revocation", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const connection = await post(page, "/v1/connections", {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = await post(page, "/v1/agents", {
    name: `Native fixture ${crypto.randomUUID().slice(0, 8)}`,
    harness: "codex",
    connection_id: connection.id,
    model_id: "fixture",
    billing_source: "subscription",
  });
  const thread = await post(page, `/v1/agents/${agent.id}/dm`, {});
  await chooseAgent(page, agent.name);
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("fixture interaction preface");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: "Markdown A concise report", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  const pendingSnapshot = await (
    await page.request.get(`/v1/threads/${thread.id}/snapshot`)
  ).json();
  const runId = pendingSnapshot.runs[0].id;
  const sent: { type: string; request_id: string; source_index?: number }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(`/v1/runs/${runId}/interactions`))
      sent.push(request.postDataJSON());
  });
  // Only the external harness is a fixture. The response journal, scoped API and SQLite are real.
  let discardedAcknowledgement = false;
  await page.route(`**/v1/runs/${runId}/interactions`, async (route) => {
    if (
      route.request().method() !== "POST" ||
      route.request().postDataJSON().type !== "user_input"
    ) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(await response.json()).toEqual({ status: "submitted" });
    discardedAcknowledgement = true;
    await route.abort("failed");
  });
  await capture(page, testInfo.outputPath("native-question.png"));
  await page.getByRole("radio", { name: "Markdown A concise report", exact: true }).click();
  const questionReceipt = page.getByRole("group", { name: "Status jawaban native", exact: true });
  await expect(questionReceipt).toHaveAttribute("data-native-state", "submitted");
  await expect(questionReceipt).toContainText("Kamu memilih: Markdown · diterima harness");
  expect(discardedAcknowledgement).toBeTruthy();
  await expect(
    page.getByRole("radio", { name: "Markdown A concise report", exact: true }),
  ).toHaveCount(0);
  await page.unroute(`**/v1/runs/${runId}/interactions`);
  await page.reload();
  await expect(questionReceipt).toContainText("Kamu memilih: Markdown · diterima harness");
  await expect(page.getByRole("button", { name: "Allow this read", exact: true })).toBeVisible();
  await capture(page, testInfo.outputPath("native-approval.png"));
  await page.getByRole("button", { name: "Allow this read", exact: true }).click();
  await expect(
    page.getByText("Fixture answer: Markdown; approval: allow-once", { exact: true }),
  ).toBeVisible();
  const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  expect(snapshot.runs).toHaveLength(1);
  expect(snapshot.runs[0].status).toBe("succeeded");
  const history = await (await page.request.get(`/v1/runs/${runId}/interactions/history`)).json();
  expect(history.coverage).toBe("observed_requests_only");
  expect(history.records).toHaveLength(2);
  const reply = snapshot.messages.find(
    (message: { text: string }) =>
      message.text.startsWith("Before the question.\n\n") &&
      message.text.includes("Fixture answer:"),
  );
  expect(reply).toBeDefined();
  for (const record of history.records) {
    expect(record.anchor_message_id).toBe(reply.id);
    expect(record.anchor_text_offset).toBeGreaterThan(2048);
    const prefix = reply.text.slice(0, record.anchor_text_offset);
    expect(prefix).toMatch(/^Before the question\.\n\n/);
    expect(prefix).toMatch(/\n\n$/);
    expect(record.anchor_prefix_sha256).toBe(createHash("sha256").update(prefix).digest("hex"));
  }
  expect(
    history.records.every(
      (record: { submission: { state: string } }) => record.submission.state === "submitted",
    ),
  ).toBeTruthy();
  expect(
    history.records.find((record: { type: string }) => record.type === "user_input").submission
      .answer,
  ).toEqual({
    type: "user_input",
    request_id: "fixture-question",
    answers: [{ questionId: "format", selectedLabel: "Markdown" }],
  });
  expect(
    sent.map(({ type, request_id, source_index }) => ({ type, request_id, source_index })),
  ).toEqual([
    { type: "user_input", request_id: "fixture-question", source_index: undefined },
    { type: "approval", request_id: "fixture-approval", source_index: 7 },
  ]);
  await expectNativeReceiptOrder(
    page,
    history.records.map((record: { id: string }) => record.id),
  );
  await post(page, `/v1/connections/${connection.id}/revoke`, {});
  const terminalPendingReads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && request.url().endsWith(`/v1/runs/${runId}/interactions`))
      terminalPendingReads.push(request.url());
  });
  await page.reload();
  await expect(questionReceipt).toContainText("Kamu memilih: Markdown · diterima harness");
  const approvalReceipt = page.getByRole("group", { name: "Status keputusan native", exact: true });
  await expect(approvalReceipt).toHaveAttribute("data-native-state", "submitted");
  await expect(approvalReceipt).toContainText("Allow this read");
  await expectNativeReceiptOrder(
    page,
    history.records.map((record: { id: string }) => record.id),
  );
  await questionReceipt.getByRole("button", { name: "Rincian", exact: true }).click();
  await expect(questionReceipt).toContainText(
    "Harness mengonfirmasi penerimaan. Ini tidak menyatakan tindakan dijalankan atau pekerjaan selesai.",
  );
  await capture(page, testInfo.outputPath("native-settled.png"));
  // More than one poll interval proves terminal history does not reopen a native session.
  await page.waitForTimeout(3200);
  expect(terminalPendingReads).toEqual([]);
  expect(sent).toHaveLength(2);
});

test("an ambiguous native submission stays fenced through status reads, reload and cancellation", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agent = await fixtureAgent(page, "Unknown acknowledgement");
  const thread = await post(page, `/v1/agents/${agent.id}/dm`, {});
  await chooseAgent(page, agent.name);
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("fixture interaction unknown");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.getByRole("radio", { name: "CSV", exact: true })).toBeVisible({
    timeout: 20000,
  });
  const before = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  const runId = before.runs[0].id;
  const submissions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(`/v1/runs/${runId}/interactions`))
      submissions.push(request.postData() ?? "");
  });
  // The fixture throws an ambiguous native transport error; the real broker persists its fence.
  await page.getByRole("radio", { name: "CSV", exact: true }).click();
  const receipt = page.getByRole("group", { name: "Status jawaban native", exact: true });
  await expect(receipt).toHaveAttribute("data-native-state", "unknown");
  await expect(receipt).toContainText("Pengiriman jawaban belum terkonfirmasi CSV");
  await expect(receipt).toContainText("Jangan kirim ulang; periksa status.");
  const observed = await (await page.request.get(`/v1/runs/${runId}/interactions/history`)).json();
  const record = observed.records.find((item: { type: string }) => item.type === "user_input");
  expect(record.observed_state).toBe("pending");
  expect(record.submission.state).toBe("unknown");
  expect(record.submission.diagnostic.outcome).toBe("unknown");
  expect(record.submission.answer.answers).toEqual([
    { questionId: "format", selectedLabel: "CSV" },
  ]);
  for (let read = 0; read < 2; read++) {
    await receipt.getByRole("button", { name: "Periksa status", exact: true }).click();
    await expect(
      receipt.getByRole("button", { name: "Periksa status", exact: true }),
    ).toBeEnabled();
  }
  await page.reload();
  await expect(receipt).toHaveAttribute("data-native-state", "unknown");
  await expect(page.getByRole("radio", { name: "CSV", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Jawaban: Format", exact: true })).toHaveCount(0);
  await capture(page, testInfo.outputPath("native-unknown.png"));
  await page.getByRole("button", { name: "Stop run", exact: true }).click();
  await expect
    .poll(async () => {
      const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
      return snapshot.runs.find((run: { id: string }) => run.id === runId)?.status;
    })
    .toBe("cancelled");
  await page.reload();
  await expect(receipt).toHaveAttribute("data-native-state", "unknown");
  await expect(receipt).toContainText("CSV");
  const settled = await (await page.request.get(`/v1/runs/${runId}/interactions/history`)).json();
  const unchanged = settled.records.find((item: { id: string }) => item.id === record.id);
  expect(settled.cancellation).toBe("confirmed");
  expect(unchanged.submission.attempt_id).toBe(record.submission.attempt_id);
  expect(unchanged.submission.state).toBe("unknown");
  expect(submissions).toHaveLength(1);
});

test("unsafe Markdown cuts and changed prefixes keep complete content beside a labeled native-history fallback", async ({
  page,
}, testInfo) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agent = await fixtureAgent(page, "Markdown anchor boundary");
  const thread = await post(page, `/v1/agents/${agent.id}/dm`, {});
  const admission = await post(page, "/v1/runs", {
    thread_id: thread.id,
    agent_id: agent.id,
    text: "fixture interaction preface",
  });
  const runId = admission.run.id;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/v1/runs/${runId}/interactions`);
        if (!response.ok()) return false;
        const pending = await response.json();
        return pending.user_inputs.some(
          (input: { userInputId: string }) => input.userInputId === "fixture-question",
        );
      },
      { timeout: 20000 },
    )
    .toBeTruthy();
  await post(page, `/v1/runs/${runId}/interactions`, {
    type: "user_input",
    request_id: "fixture-question",
    answers: [{ questionId: "format", selectedLabel: "Markdown" }],
  });
  await post(page, `/v1/runs/${runId}/interactions`, {
    type: "approval",
    request_id: "fixture-approval",
    source_index: 7,
    choice_id: "allow-once",
  });
  type AnchorSnapshot = {
    messages: {
      id: string;
      run_id: string | null;
      author: string;
      text: string;
      revision: number;
    }[];
    runs: {
      id: string;
      status: string;
      revision: number;
      native_interactions: {
        anchor_message_id: string | null;
        anchor_text_offset: number | null;
        anchor_prefix_sha256: string | null;
      }[];
    }[];
  };
  let base: AnchorSnapshot;
  await expect
    .poll(async () => {
      base = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
      return base.runs.find((run) => run.id === runId)?.status;
    })
    .toBe("succeeded");
  base = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  const original = base.messages.find(
    (message) => message.run_id === runId && message.author === "agent",
  );
  expect(original).toBeDefined();
  await chooseAgent(page, agent.name);
  // Only the scoped projection is controlled below. These cases test the rendering boundary;
  // persistence, native acknowledgement and reload are proved separately against the real API.
  let projected = base;
  await page.route(`**/v1/threads/${thread.id}/snapshot*`, (route) =>
    route.fulfill({ json: projected }),
  );
  const cases = [
    {
      name: "code",
      text: "Before code.\n\n```js\nconst intact = 1;\nconsole.log(intact);\n```\n\nAfter code.",
      marker: "console.log",
      mismatch: false,
    },
    {
      name: "table",
      text: "Before table.\n\n| Name | Count |\n| --- | --- |\n| Alpha | 1 |\n| Beta | 2 |\n\nAfter table.",
      marker: "| Beta",
      mismatch: false,
    },
    {
      name: "changed-prefix",
      text: "Changed introduction.\n\nKept full ending.",
      marker: "Kept",
      mismatch: true,
    },
  ];
  for (const item of cases) {
    projected = structuredClone(base);
    const message = projected.messages.find((value) => value.id === original?.id);
    const run = projected.runs.find((value) => value.id === runId);
    if (!message || !run) throw new Error("Completed fixture projection is missing.");
    message.text = item.text;
    message.revision += 100;
    run.revision += 100;
    const offset = item.text.indexOf(item.marker);
    const prefix = item.mismatch ? "Original introduction.\n\n" : item.text.slice(0, offset);
    for (const record of run.native_interactions) {
      record.anchor_message_id = message.id;
      record.anchor_text_offset = offset;
      record.anchor_prefix_sha256 = createHash("sha256").update(prefix).digest("hex");
    }
    await page.reload();
    const fallback = page.locator("[data-native-history-fallback]");
    await expect(fallback).toHaveCount(1);
    // Wait past asynchronous prefix verification so its initial conservative fallback cannot pass alone.
    await page.waitForTimeout(300);
    await expect(fallback).toHaveCount(1);
    await expect(fallback.locator("[data-native-interaction]")).toHaveCount(2);
    if (item.name === "code") {
      await expect(page.locator("[data-code-block]")).toHaveCount(1);
      await expect(page.locator("[data-code-body]")).toHaveText(
        "const intact = 1;\nconsole.log(intact);",
      );
      await expect(page.getByText("Before code.", { exact: true })).toBeVisible();
      await expect(page.getByText("After code.", { exact: true })).toBeVisible();
    } else if (item.name === "table") {
      await expect(page.locator("[data-table-card]")).toHaveCount(1);
      await expect(page.getByRole("columnheader")).toHaveCount(2);
      await expect(page.getByRole("cell", { name: "Alpha", exact: true })).toBeVisible();
      await expect(page.getByRole("cell", { name: "Beta", exact: true })).toBeVisible();
      await expect(page.getByText("After table.", { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText("Changed introduction.", { exact: true })).toBeVisible();
      await expect(page.getByText("Kept full ending.", { exact: true })).toBeVisible();
    }
    await capture(page, testInfo.outputPath(`native-anchor-${item.name}.png`));
  }
});

test("rejected group membership preserves the draft and allows a corrected operation", async ({
  page,
}) => {
  const { a } = await start(page);
  await menu(page);
  await page.getByLabel("Nama grup", { exact: true }).fill("Keep this group draft");
  await page.getByRole("checkbox", { name: a.agent.name, exact: true }).check();
  await page.route("**/v1/creation/groups", async (route) => {
    await route.continue({
      postData: JSON.stringify({
        ...route.request().postDataJSON(),
        member_agent_ids: [crypto.randomUUID()],
      }),
    });
  });
  await page.getByRole("button", { name: "Buat grup", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Akses anggota berubah. Periksa pilihan anggota lalu coba lagi.",
  );
  await expect(page.getByLabel("Nama grup", { exact: true })).toHaveValue("Keep this group draft");
  await expect(page.getByRole("checkbox", { name: a.agent.name, exact: true })).toBeChecked();
  await page.unroute("**/v1/creation/groups");
  await page.getByRole("button", { name: "Buat grup", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Detail Keep this group draft", exact: true }),
  ).toBeVisible();
});

test("sharing copies only the selected file into the explicit destination and preserves byte identity", async ({
  page,
}) => {
  const { a, b } = await start(page);
  const source = await post(page, "/v1/workspaces", {
    thread_id: a.thread.id,
    agent_id: a.agent.id,
    name: "Source folder",
  });
  const destination = await post(page, "/v1/workspaces", {
    thread_id: b.thread.id,
    agent_id: b.agent.id,
    name: "Destination folder",
  });
  const artifact = await post(page, `/v1/workspaces/${source.id}/uploads`, {
    name: "share.txt",
    media_type: "text/plain",
    content_base64: Buffer.from("Only this file is shared.").toString("base64"),
  });
  await post(page, `/v1/workspaces/${source.id}/uploads`, {
    name: "private.txt",
    media_type: "text/plain",
    content_base64: Buffer.from("Keep this file private.").toString("base64"),
  });
  await chooseAgent(page, a.agent.name);
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await page.getByRole("button", { name: "File share.txt", exact: true }).click();
  await page.getByText("Bagikan salinan ke percakapan lain", { exact: true }).click();
  await page.getByLabel("Folder tujuan", { exact: true }).selectOption(destination.id);
  await page.getByRole("button", { name: "Bagikan file ini", exact: true }).click();
  await expect(page.getByText("Salinan berhasil dibagikan.", { exact: true })).toBeVisible();
  const snapshot = await (await page.request.get(`/v1/threads/${b.thread.id}/snapshot`)).json();
  expect(snapshot.artifacts).toHaveLength(1);
  expect(snapshot.artifacts[0].sha256).toBe(artifact.sha256);
  expect(snapshot.artifacts[0].origin).toBe("shared_copy");
  const bytes = await page.request.get(
    `/v1/artifacts/${snapshot.artifacts[0].id}/content?workspace_id=${destination.id}`,
  );
  expect(await bytes.text()).toBe("Only this file is shared.");
});

async function fixtureAgent(page: Page, prefix: string) {
  const connection = await post(page, "/v1/connections", {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  return post(page, "/v1/agents", {
    name: `${prefix} ${crypto.randomUUID().slice(0, 8)}`,
    harness: "codex",
    connection_id: connection.id,
    model_id: "fixture",
    billing_source: "subscription",
  });
}
async function chooseGroup(page: Page, name: string) {
  const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await open.isVisible()) await open.click();
  await page
    .getByRole("navigation", { name: "Percakapan", exact: true })
    .getByRole("button")
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
  await expect(page.getByRole("button", { name: `Detail ${name}`, exact: true })).toBeVisible();
}

test("all concurrent group lanes expose their native questions and free text uses one answer representation", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const a = await fixtureAgent(page, "First lane");
  const b = await fixtureAgent(page, "Second lane");
  const group = await newGroup(page, `Concurrent ${crypto.randomUUID().slice(0, 8)}`, [a.id, b.id]);
  await post(page, `/v1/groups/${group.id}/messages`, {
    agent_id: a.id,
    text: "fixture interaction",
  });
  await post(page, `/v1/groups/${group.id}/messages`, {
    agent_id: b.id,
    text: "fixture interaction multiple",
  });
  await chooseGroup(page, group.name);
  const first = page.getByRole("region", { name: `Permintaan native ${a.name}`, exact: true });
  const second = page.getByRole("region", { name: `Permintaan native ${b.name}`, exact: true });
  await expect(
    first.getByRole("radio", { name: "Markdown A concise report", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(
    second.getByRole("checkbox", { name: "Markdown A concise report", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await second.getByRole("checkbox", { name: "Markdown A concise report", exact: true }).click();
  await second.getByRole("textbox", { name: "Jawaban: Format", exact: true }).fill("Plain summary");
  await second.getByRole("button", { name: "Kirim jawaban ke harness", exact: true }).click();
  await second.getByRole("button", { name: "Allow this read", exact: true }).click();
  await expect(
    page.getByText("Fixture answer: Plain summary; approval: allow-once", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Stop ${a.name}`, exact: true }).click();
  await expect(
    first.getByRole("radio", { name: "Markdown A concise report", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Run dihentikan; jawaban native tidak tercatat", { exact: true }).first(),
  ).toBeVisible();
});

test("an unconfirmed human reply is restored verbatim and locked across reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agent = await fixtureAgent(page, "Human request");
  const group = await newGroup(page, `Human ${crypto.randomUUID().slice(0, 8)}`, [agent.id]);
  await post(page, `/v1/groups/${group.id}/messages`, {
    agent_id: agent.id,
    text: "fixture human",
  });
  await chooseGroup(page, group.name);
  const input = page.getByRole("textbox", { name: `Jawaban untuk ${agent.name}`, exact: true });
  await input.fill("Keep this exact answer.");
  await page.route("**/v1/human-requests/*/reply", (route) => route.abort("failed"));
  await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
  await expect(page.getByRole("button", { name: "Periksa jawaban", exact: true })).toBeVisible();
  await page.unroute("**/v1/human-requests/*/reply");
  await page.reload();
  await expect(input).toHaveValue("Keep this exact answer.");
  await expect(input).not.toBeEditable();
  await page.getByRole("button", { name: "Periksa jawaban", exact: true }).click();
  await expect(
    page.getByText("Jawaban tersimpan untuk permintaan ini.", { exact: true }),
  ).toBeVisible();
  const snapshot = await (await page.request.get(`/v1/threads/${group.id}/snapshot`)).json();
  expect(snapshot.human_requests).toHaveLength(1);
  expect(snapshot.human_requests[0].state).toBe("answered");
  expect(
    snapshot.messages.filter(
      (m: { purpose: string; text: string }) =>
        m.purpose === "human_reply" && m.text === "Keep this exact answer.",
    ),
  ).toHaveLength(1);
});

test("membership editing keeps its original revision and cannot overwrite a concurrent change", async ({
  page,
}) => {
  const { a, b } = await start(page);
  const group = await newGroup(page, `Membership ${crypto.randomUUID().slice(0, 8)}`, [
    a.agent.id,
    b.agent.id,
  ]);
  await chooseGroup(page, group.name);
  await page.getByRole("button", { name: `Detail ${group.name}`, exact: true }).click();
  await page.getByText("Kelola anggota", { exact: true }).click();
  await post(page, `/v1/groups/${group.id}/membership`, {
    expected_revision: group.revision,
    member_agent_ids: [a.agent.id],
  });
  await expect(page.getByRole("heading", { name: "Anggota · 1", exact: true })).toBeVisible();
  const response = page.waitForResponse(
    (r) => r.url().endsWith(`/v1/groups/${group.id}/membership`) && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Simpan anggota", exact: true }).click();
  expect((await response).status()).toBe(409);
  const snapshot = await (await page.request.get(`/v1/threads/${group.id}/snapshot`)).json();
  expect(snapshot.thread.member_agent_ids).toEqual([a.agent.id]);
  await page.getByRole("button", { name: "Muat anggota terbaru", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: `Anggota ${b.agent.name}`, exact: true }),
  ).not.toBeChecked();
});

test("four ordinary file attachments still allow a supported image", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agent = await fixtureAgent(page, "Attachment count");
  await post(page, `/v1/agents/${agent.id}/dm`, {});
  await chooseAgent(page, agent.name);
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("fixture warmup");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(
    page
      .getByRole("main", { name: "Percakapan aktif" })
      .getByText("Fixture ready", { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  for (let i = 0; i < 4; i++) {
    await expect(page.getByRole("button", { name: "Tambah lampiran", exact: true })).toBeEnabled();
    await page.getByLabel("Lampirkan file ke pesan", { exact: true }).setInputFiles({
      name: `notes-${i}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`Notes ${i}`),
    });
    await expect(
      page.getByRole("button", { name: `Hapus lampiran notes-${i}.txt`, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Tambah lampiran", exact: true })).toBeEnabled();
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles("../../docs/verification/nma-059/visual-input.png");
  await expect(
    page.getByRole("button", { name: "Hapus lampiran visual-input.png", exact: true }),
  ).toBeVisible();
});

async function newGroup(page: Page, name: string, ids: string[]) {
  const thread = await post(page, "/v1/threads", { type: "group", member_agent_ids: ids });
  return post(page, `/v1/groups/${thread.id}/configuration`, {
    expected_revision: thread.revision,
    changes: { name },
  });
}
