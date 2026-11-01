import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
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
    .getByRole("button", { name: `${name} Codex / ChatGPT`, exact: true })
    .click();
  await expect(page.getByRole("button", { name: `Detail ${name}`, exact: true })).toBeVisible();
}

test("contextual goals, Routine and files use real scoped state and keep stop responsibility distinct from stop run", async ({
  page,
}, testInfo) => {
  const { a } = await start(page);
  const goal = await post(page, "/v1/goals", {
    thread_id: a.thread.id,
    agent_id: a.agent.id,
    title: "Research progress",
  });
  await post(page, "/v1/routines", {
    thread_id: a.thread.id,
    agent_id: a.agent.id,
    instruction: "Check research progress",
    goal_id: goal.id,
    schedule: { type: "once", at: "2035-01-01T00:00:00.000Z" },
    timezone: "Asia/Makassar",
  });
  await chooseAgent(page, a.agent.name);
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Goals", exact: true }).click();
  await page.getByRole("button", { name: "Research progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Research progress", exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Stop run menghentikan satu eksekusi. Pause/stop goal juga menghentikan kelanjutannya.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Jeda goal melalui chat", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveValue(
    /Research progress/,
  );
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Routine", exact: true }).click();
  await page.getByRole("button", { name: "Check research progress", exact: true }).click();
  await expect(page.getByText("Asia/Makassar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Terkait goal: Research progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Research progress", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "File", exact: true }).click();
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
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-files.png`) });
});

test("group creation recovers a lost acknowledgement, routes messages and keeps member DM resources private", async ({
  page,
}) => {
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
  await expect(page.getByRole("tab", { name: "Anggota", exact: true })).toBeVisible();
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
}) => {
  test.setTimeout(90000);
  const { a } = await start(page);
  await chooseAgent(page, a.agent.name);
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "File", exact: true }).click();
  await expect(page.getByText("Browser percakapan", { exact: true })).toBeVisible();
  await page.getByText("Browser percakapan", { exact: true }).click();
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/v1/browser/profiles") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Aktifkan browser percakapan", exact: true }).click();
  const profile = await (await created).json();
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
    await page.getByRole("button", { name: "Sambungkan ulang tampilan", exact: true }).click();
    await expect(page.getByText("Tampilan terhubung", { exact: true })).toBeVisible();
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
}) => {
  const { a } = await start(page);
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
  await page.getByRole("textbox", { name: "Cari aplikasi", exact: true }).fill("calendar");
  await page.getByRole("button", { name: "Cari aplikasi", exact: true }).click();
  const connected = page.waitForResponse(
    (r) => r.url().endsWith("/v1/apps/connect") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Hubungkan Calendar fixture", exact: true }).click();
  const created = (await (await connected).json()).connection;
  const account = page.getByRole("region", {
    name: `Koneksi calendar ${created.id.slice(0, 8)}`,
    exact: true,
  });
  await account.getByRole("button", { name: "Periksa koneksi calendar", exact: true }).click();
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
  await expect(page.getByText("Fixture ready", { exact: true })).toBeVisible({ timeout: 20000 });
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill(`fixture apps:${created.id}`);
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await page.getByRole("button", { name: `Detail ${a.agent.name}`, exact: true }).click();
  await page.getByText("Koneksi aplikasi", { exact: true }).click();
  await page.getByText("calendar list events · Berhasil", { exact: true }).click();
  await expect(page.getByText("Receipt: fixture-provider-receipt", { exact: true })).toBeVisible();
});

test("native input and a specific approval preserve request identity through the real broker", async ({
  page,
}) => {
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
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("fixture interaction");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await page.getByRole("radio", { name: "Markdown A concise report", exact: true }).check();
  await page.getByRole("button", { name: "Kirim jawaban ke harness", exact: true }).click();
  await page.getByRole("button", { name: "Allow this read", exact: true }).click();
  await expect(
    page.getByText("Fixture answer: Markdown; approval: allow-once", { exact: true }),
  ).toBeVisible();
  const snapshot = await (await page.request.get(`/v1/threads/${thread.id}/snapshot`)).json();
  expect(snapshot.runs).toHaveLength(1);
  expect(snapshot.runs[0].status).toBe("succeeded");
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
  await page.getByRole("tab", { name: "File", exact: true }).click();
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
async function chooseGroup(page: Page, name: string, count: number) {
  const open = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await open.isVisible()) await open.click();
  await page
    .getByRole("navigation", { name: "Percakapan", exact: true })
    .getByRole("button", { name: `${name} ${count} agent`, exact: true })
    .click();
  await expect(page.getByRole("button", { name: `Detail ${name}`, exact: true })).toBeVisible();
}

test("all concurrent group lanes expose their native questions and free text uses one answer representation", async ({
  page,
}) => {
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
  await chooseGroup(page, group.name, 2);
  const first = page.getByRole("region", { name: `Permintaan native ${a.name}`, exact: true });
  const second = page.getByRole("region", { name: `Permintaan native ${b.name}`, exact: true });
  await expect(
    first.getByRole("radio", { name: "Markdown A concise report", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await second.getByRole("checkbox", { name: "Markdown A concise report", exact: true }).check();
  await second.getByRole("textbox", { name: "Jawaban: Format", exact: true }).fill("Plain summary");
  await second.getByRole("button", { name: "Kirim jawaban ke harness", exact: true }).click();
  await second.getByRole("button", { name: "Allow this read", exact: true }).click();
  await expect(
    page.getByText("Fixture answer: Plain summary; approval: allow-once", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: `Stop ${a.name}`, exact: true }).click();
  await expect(first).toHaveCount(0);
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
  await chooseGroup(page, group.name, 1);
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
  await chooseGroup(page, group.name, 2);
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
  await expect(page.getByText("Fixture ready", { exact: true })).toBeVisible({ timeout: 20000 });
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
