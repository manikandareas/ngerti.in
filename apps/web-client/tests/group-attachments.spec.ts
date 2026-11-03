import { expect, type Page, test } from "@playwright/test";

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function snapshot(page: Page, groupId: string) {
  return (await page.request.get(`/v1/threads/${groupId}/snapshot`)).json();
}
async function setup(page: Page) {
  test.setTimeout(60_000);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const agents = [];
  for (const name of ["Writer", "Reviewer"]) {
    const connection = await post(page, "/v1/connections", {
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    });
    const agent = await post(page, "/v1/agents", {
      name: `${name} ${crypto.randomUUID().slice(0, 8)}`,
      harness: "codex",
      connection_id: connection.id,
      model_id: "fixture",
      billing_source: "subscription",
    });
    const dm = await post(page, `/v1/agents/${agent.id}/dm`, {});
    const warmup = await post(page, "/v1/runs", {
      agent_id: agent.id,
      thread_id: dm.id,
      text: "fixture warmup",
    });
    await expect
      .poll(
        async () =>
          (await snapshot(page, dm.id)).runs.find((r: { id: string }) => r.id === warmup.run.id)
            ?.status,
        { timeout: 20_000 },
      )
      .toBe("succeeded");
    agents.push(agent);
  }
  const created = await post(page, "/v1/creation/groups", {
    name: `Shared files ${crypto.randomUUID().slice(0, 8)}`,
    member_agent_ids: agents.map((a) => a.id),
  });
  const group = created.thread;
  await expect
    .poll(async () => (await snapshot(page, group.id)).routes[0]?.state, { timeout: 20_000 })
    .toBe("selected");
  await expect
    .poll(
      async () =>
        (await snapshot(page, group.id)).runs.every(
          (r: { status: string }) => r.status === "succeeded",
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
  await page.evaluate((id) => localStorage.setItem("ngertiin:thread", id), group.id);
  await page.reload();
  await expect(
    page.getByRole("button", { name: `Detail ${group.name}`, exact: true }),
  ).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await expect(composer).toBeEditable();
  return { group, agents, composer, initial: await snapshot(page, group.id) };
}
const documentFile = (name: string) => ({
  name,
  mimeType: "text/plain",
  buffer: Buffer.from(`Group source ${name}`),
});

test("group file-only sends stay local, route through the group API and keep uploads in chat instead of the results panel", async ({
  page,
}, info) => {
  const { group, composer } = await setup(page);
  let uploads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/v1/message-uploads")) uploads++;
  });
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile("group-source.txt"));
  await expect(composer.locator("[data-attachment-chip]")).toHaveAttribute(
    "data-upload-state",
    "local",
  );
  expect(uploads).toBe(0);
  expect((await snapshot(page, group.id)).artifacts).toHaveLength(0);
  const sent = page.waitForRequest(
    (r) => r.url().endsWith(`/v1/groups/${group.id}/messages`) && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  expect((await sent).postDataJSON().artifact_ids).toHaveLength(1);
  await expect(composer).toHaveText("");
  await expect(page.locator(".chat-user-bubble [data-attachment-chip]")).toHaveCount(1);
  const state = await snapshot(page, group.id);
  expect(state.artifacts).toHaveLength(1);
  expect(state.artifacts[0].agent_id).toBeNull();
  expect(
    state.workspaces.filter(
      (w: { scope: string; state: string }) => w.scope === "group" && w.state === "active",
    ),
  ).toHaveLength(1);
  await page.getByRole("button", { name: `Detail ${group.name}`, exact: true }).click();
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "File group-source.txt", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Files created by your agent will appear here.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("group-shared-file.png") });
});

test("a lost group-send acknowledgement restores the same submission after reload without publishing twice", async ({
  page,
}) => {
  const { group, agents, composer } = await setup(page);
  const keys: string[] = [];
  await page.route(`**/v1/groups/${group.id}/messages`, async (route) => {
    keys.push(route.request().headers()["idempotency-key"]);
    await route.fetch();
    await route.abort("failed");
  });
  await composer.fill(`@${agents[0].handle} Read `);
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile("durable-group.txt"));
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(page.getByRole("button", { name: "Periksa pengiriman", exact: true })).toBeEnabled();
  await page.unroute(`**/v1/groups/${group.id}/messages`);
  await page.reload();
  await expect(composer).not.toBeEditable();
  await page.getByRole("button", { name: "Periksa pengiriman", exact: true }).click();
  await expect(composer).toHaveText("");
  const state = await snapshot(page, group.id);
  expect(keys).toHaveLength(1);
  expect(state.artifacts).toHaveLength(1);
  expect(
    state.messages.filter(
      (m: { artifact_ids: string[]; author: string }) =>
        m.author === "user" && m.artifact_ids.includes(state.artifacts[0].id),
    ),
  ).toHaveLength(1);
});

test("a rejected second group upload restores both local files and can be corrected without partial publication", async ({
  page,
}) => {
  const { group, agents, composer } = await setup(page);
  let calls = 0;
  await page.route("**/v1/message-uploads", async (route) => {
    if (++calls === 2)
      await route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "SCOPE_DENIED", message: "Rejected fixture upload." },
        }),
      });
    else await route.fulfill({ response: await route.fetch() });
  });
  await composer.fill(`@${agents[0].handle} Review `);
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles([documentFile("first-group.txt"), documentFile("second-group.txt")]);
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(composer).toBeEditable();
  await expect(composer.locator("[data-attachment-chip]")).toHaveCount(2);
  await expect(page.getByRole("alert").filter({ hasText: "Pesan belum terkirim" })).toBeVisible();
  expect((await snapshot(page, group.id)).artifacts).toHaveLength(0);
  await page.unroute("**/v1/message-uploads");
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(composer).toHaveText("");
  expect((await snapshot(page, group.id)).artifacts).toHaveLength(2);
});

test("rejected routing retries the original group message and source attachment", async ({
  page,
}) => {
  const { group, composer } = await setup(page);
  await composer.fill("fixture reject routing: review ");
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles(documentFile("route-source.txt"));
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  const retry = page.getByRole("button", { name: "Coba pilih penjawab lagi", exact: true });
  await expect(retry).toBeVisible({ timeout: 20_000 });
  const before = await snapshot(page, group.id);
  const original = before.routes.find((r: { state: string }) => r.state === "rejected");
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await snapshot(page, group.id)).routes.find((r: { id: string }) => r.id === original.id)
          ?.state,
      { timeout: 20_000 },
    )
    .toBe("selected");
  const after = await snapshot(page, group.id);
  expect(after.routes.find((r: { id: string }) => r.id === original.id)).toMatchObject({
    state: "selected",
    message_id: original.message_id,
  });
  expect(after.messages.filter((m: { author: string }) => m.author === "user")).toHaveLength(
    before.messages.filter((m: { author: string }) => m.author === "user").length,
  );
  expect(after.artifacts.map((a: { id: string }) => a.id)).toEqual(
    before.artifacts.map((a: { id: string }) => a.id),
  );
});

test("group image eligibility follows the mentioned member and a capable member receives normalized visual input", async ({
  page,
}, info) => {
  const { group, agents, composer } = await setup(page);
  const current = (await snapshot(page, group.id)).agents.find(
    (a: { id: string }) => a.id === agents[0].id,
  );
  await post(page, `/v1/agents/${current.id}/configuration`, {
    expected_revision: current.revision,
    changes: { model_id: "text-only" },
  });
  await expect
    .poll(
      async () =>
        (await snapshot(page, group.id)).agents.find((a: { id: string }) => a.id === current.id)
          ?.model_id,
    )
    .toBe("text-only");
  await page.reload();
  await composer.fill(`@${agents[0].handle} Describe `);
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles("../../docs/verification/nma-059/visual-input.png");
  await expect(composer.locator("[data-attachment-chip]")).toHaveCount(0);
  await expect(page.getByRole("alert").filter({ hasText: "Belum ada anggota" })).toBeVisible();
  await composer.fill(`@${agents[1].handle} Describe `);
  await page
    .getByLabel("Lampirkan file ke pesan", { exact: true })
    .setInputFiles("../../docs/verification/nma-059/visual-input.png");
  await expect(composer.locator("[data-attachment-chip]")).toHaveCount(1);
  await expect(page.getByRole("alert").filter({ hasText: "Belum ada anggota" })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("group-image-composer.png") });
  await page.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(composer).toHaveText("");
  await expect
    .poll(
      async () =>
        (await snapshot(page, group.id)).runs.some(
          (r: { agent_id: string; visual_inputs?: unknown[] }) =>
            r.agent_id === agents[1].id && r.visual_inputs?.length === 1,
        ),
      { timeout: 20_000 },
    )
    .toBe(true);
});
