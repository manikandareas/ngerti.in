import { expect, type Page, test } from "@playwright/test";

// Only availability and native login/inspection are fixtures. Connections, key storage,
// idempotency, revoke, projections, reloads and agent configuration use the real API/SQLite.
const harnesses = ["codex", "muse"].map((harness) => ({
  harness,
  state: "supported",
  version: harness === "codex" ? "0.166.0" : "1.4.14-R7309.1",
  manifest: {
    minimum_version: harness === "codex" ? "0.165.0" : "1.4.14",
    tested_native_version: harness === "codex" ? "0.166.0" : "1.4.14-R7309.1",
    authentication_methods: ["native_login", "api_key"],
  },
}));
async function settings(page: Page, url = "/") {
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const menu = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/" && url.searchParams.get("settings") === "general",
  );
  await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tutup pengaturan", exact: true })).toBeVisible();
}
async function section(page: Page, id: "general" | "providers", label: string) {
  await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeVisible();
  const mobile = page.getByRole("combobox", { name: "Menu pengaturan", exact: true });
  if (await mobile.isVisible()) {
    await mobile.selectOption(id);
    await expect(mobile).toHaveValue(id);
  } else {
    await page
      .getByRole("navigation", { name: "Menu pengaturan", exact: true })
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  }
}
async function providers(page: Page) {
  await section(page, "providers", "Providers");
  await expect(page.locator('.settings-nav-item[aria-current="page"]')).toHaveCount(1);
}
async function detail(page: Page, name: string) {
  const row = page.locator(".provider-list-row").filter({ hasText: name });
  if (!(await row.isVisible()))
    await page.getByRole("button", { name: /^Provider lainnya/ }).click();
  await row.getByRole("button", { name: /^(Kelola|Siapkan)$/ }).click();
  await expect(page.getByRole("region", { name: `Pengaturan ${name}`, exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/harnesses", (route) => route.fulfill({ json: harnesses }));
});

test("settings navigation, search, theme and return preserve the conversation draft", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await settings(page, "/?context=retained");
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeHidden();
  await page.goForward();
  await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tutup pengaturan", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Draft retained while checking settings.");
  const composer = await page.getByRole("textbox", { name: "Pesan", exact: true }).elementHandle();
  const menu = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  expect(await composer?.evaluate((element) => element.isConnected)).toBeTruthy();
  const search = page.getByRole("textbox", { name: "Cari pengaturan", exact: true });
  if (await search.isVisible()) {
    await search.fill("unknown menu");
    await expect(page.getByText("Tidak ada pengaturan yang cocok.")).toBeVisible();
    await search.press("Escape");
    await expect(search).toHaveValue("");
    await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeVisible();
    await search.fill("provider");
    await expect(
      page.getByRole("navigation", { name: "Menu pengaturan" }).getByRole("link", { name: "Umum" }),
    ).toHaveCount(0);
  }
  await providers(page);
  await section(page, "general", "Umum");
  for (const mode of ["gelap", "terang"]) {
    const radio = page
      .getByRole("radiogroup", { name: "Tema tampilan", exact: true })
      .getByRole("radio", { name: mode === "gelap" ? "Gelap" : "Terang", exact: true });
    await radio.click();
    await expect(radio).toBeChecked();
    await expect(page.locator("html")).toHaveClass(mode === "gelap" ? /dark/ : /light/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`general-${mode}.png`) });
  }
  await page.getByRole("button", { name: "Tutup pengaturan", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "Draft retained while checking settings.",
  );
  const restoredMenu = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await restoredMenu.isVisible()) await restoredMenu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')),
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/" &&
      !url.searchParams.has("settings") &&
      url.searchParams.get("context") === "retained",
  );
  expect(await composer?.evaluate((element) => element.isConnected)).toBeTruthy();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "Draft retained while checking settings.",
  );
  try {
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            !!document.activeElement?.closest(".workspace-shell") &&
            !document.activeElement?.closest("[inert]"),
        ),
      )
      .toBeTruthy();
    if (info.project.name === "mobile")
      await expect(
        page.getByRole("button", { name: "Buka percakapan", exact: true }),
      ).toBeFocused();
  } catch (failure) {
    await info.attach("settings-focus-lifecycle", {
      body: JSON.stringify(
        await page.evaluate(() => ({
          activeTag: document.activeElement?.tagName,
          active: document.activeElement?.outerHTML.slice(0, 1200),
          blocked: document.activeElement
            ?.closest('[inert], [aria-hidden="true"]')
            ?.outerHTML.slice(0, 300),
          dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map((dialog) => ({
            class: dialog.className,
            state: dialog.getAttribute("data-state"),
            hidden: !!dialog.closest('[inert], [aria-hidden="true"]'),
          })),
        })),
        null,
        2,
      ),
      contentType: "application/json",
    });
    throw failure;
  }
  expect(errors).toEqual([]);
});

test("provider inline setup, key entry, native-login fixture and actionable inspection failure", async ({
  page,
}, info) => {
  let loginStarts = 0;
  await page.route("**/v1/connections/*/login", (route) => {
    loginStarts++;
    return route.fulfill({
      json: {
        auth_url: "https://example.com/proof-login",
        user_code: "TEST-1234",
        expires_in_seconds: 600,
      },
    });
  });
  await page.route("**/v1/connections/*/login/cancel", (route) =>
    route.fulfill({ json: { status: "cancelled" } }),
  );
  await settings(page);
  await providers(page);
  await page.getByRole("textbox", { name: "Cari provider" }).fill("no such provider");
  await expect(page.getByText("Tidak ada provider yang cocok", { exact: false })).toBeVisible();
  await page.getByRole("textbox", { name: "Cari provider" }).fill("Muse");
  await detail(page, "Muse Code");
  await page.getByRole("button", { name: "Tambah key" }).click();
  const dialog = page.getByRole("group", { name: "Meta API key untuk Muse Code" });
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Simpan key" })).toBeDisabled();
  await dialog.getByLabel("API key", { exact: true }).fill("fake-private-key-for-dialog-only");
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveAttribute("type", "password");
  await dialog.getByRole("button", { name: "Lihat", exact: true }).click();
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveAttribute("type", "text");
  await dialog.getByRole("button", { name: "Sembunyikan" }).click();
  await page.screenshot({ path: info.outputPath("api-key-inline.png") });
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Tambah akun", exact: true }).click();
  await expect(page.getByText("TEST-1234", { exact: true })).toBeVisible();
  await page
    .locator(".provider-list-row")
    .filter({ hasText: "Muse Code" })
    .getByRole("button", { name: "Selesai", exact: true })
    .click();
  await expect(page.getByText("TEST-1234", { exact: true })).toBeHidden();
  await detail(page, "Muse Code");
  await expect(page.getByText("TEST-1234", { exact: true })).toBeVisible();
  expect(loginStarts).toBe(1);
  await expect(page.getByRole("link", { name: "Lanjutkan login" })).toHaveAttribute(
    "href",
    "https://example.com/proof-login",
  );
  const account = page.locator(".provider-account").filter({ hasText: "TEST-1234" });
  await expect(account.getByText("Belum terverifikasi", { exact: true })).toBeVisible();
  await account.getByRole("button", { name: "Periksa akun & model" }).click();
  await expect(page.getByRole("alert")).toContainText("ADAPTER_UNAVAILABLE");
  await account.getByRole("button", { name: "Batalkan login" }).click();
  await expect(page.getByText("TEST-1234", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("provider-detail.png") });
  await page
    .locator(".provider-list-row")
    .filter({ hasText: "Muse Code" })
    .getByRole("button", { name: "Selesai", exact: true })
    .click();
  await expect(page.locator('.settings-nav-item[aria-current="page"]')).toHaveText("Providers");
});

test("real key onboarding retries a lost acknowledgement without duplicate, then revokes", async ({
  page,
}, info) => {
  await settings(page);
  await providers(page);
  await detail(page, "ChatGPT");
  await page.getByRole("button", { name: "Tambah key" }).click();
  const dialog = page.getByRole("group", { name: "OpenAI API key untuk ChatGPT" });
  const secret = `ui-proof-key-${crypto.randomUUID()}`;
  let stored:
    | {
        id: string;
        authentication: { billing_source: string };
        effective_billing_source: string;
        inference: string;
      }
    | undefined;
  let firstKey: string | undefined;
  await page.route("**/v1/connections/api-key", async (route) => {
    firstKey = route.request().headers()["idempotency-key"];
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    stored = await response.json();
    await route.abort("failed");
  });
  await dialog.getByLabel("API key", { exact: true }).evaluate((input, value) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", value);
    input.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  }, secret);
  await expect(dialog.getByRole("button", { name: "Periksa penyimpanan" })).toBeVisible();
  await expect(dialog.getByLabel("API key", { exact: true })).toBeDisabled();
  await page.unroute("**/v1/connections/api-key");
  const retry = page.waitForRequest((request) => request.url().endsWith("/v1/connections/api-key"));
  await dialog.getByRole("button", { name: "Periksa penyimpanan" }).click();
  expect((await retry).headers()["idempotency-key"]).toBe(firstKey);
  await expect(dialog).toBeHidden();
  expect(stored?.authentication.billing_source).toBe("api_key");
  expect(stored?.effective_billing_source).toBe("unknown");
  expect(stored?.inference).toBe("not_attempted");
  const all = await page.request.get("/v1/entities/connection").then((response) => response.json());
  expect(all.filter((connection: { id: string }) => connection.id === stored?.id)).toHaveLength(1);
  expect(JSON.stringify(all)).not.toContain(secret);
  expect(
    await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
  ).not.toContain(secret);
  await page.screenshot({ path: info.outputPath("saved-key.png") });
  const keyAccount = page.locator(".provider-account").filter({ hasText: "OpenAI API key" }).last();
  await keyAccount.getByRole("button", { name: /^Kelola / }).click();
  await page.getByRole("menuitem", { name: "Putuskan", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Ya, putuskan" }).click();
  await expect(keyAccount).toHaveCount(0);
  const final = await page.request
    .get("/v1/entities/connection")
    .then((response) => response.json());
  expect(final.find((connection: { id: string }) => connection.id === stored?.id).state).toBe(
    "revoked",
  );
});

test("missing runtime remains repairable without claiming provider readiness", async ({ page }) => {
  await page.route("**/v1/harnesses", (route) =>
    route.fulfill({
      json: harnesses.map((harness) => ({ ...harness, state: "missing", version: null })),
    }),
  );
  await settings(page);
  await providers(page);
  await detail(page, "Muse Code");
  await expect(page.getByRole("button", { name: "Tambah akun", exact: true })).toBeDisabled();
  await expect(page.getByText("Runtime belum ditemukan", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tambah key", exact: true })).toBeEnabled();
  await page
    .locator(".provider-list-row")
    .filter({ hasText: "Muse Code" })
    .getByRole("button", { name: "Selesai", exact: true })
    .click();
  await page.getByRole("button", { name: "Tutup pengaturan", exact: true }).click();
  await page.getByRole("button", { name: "Pilih model", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Pilih model", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kelola akun & model", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeVisible();
});

test("settings overlay and provider URLs support reload, history and narrow viewports", async ({
  page,
}, info) => {
  await settings(page);
  await providers(page);
  await detail(page, "Muse Code");
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/" &&
      url.searchParams.get("settings") === "providers" &&
      url.searchParams.get("provider") === "muse",
  );
  await page.goBack();
  await expect(page.locator('.settings-nav-item[aria-current="page"]')).toHaveText("Providers");
  await expect(
    page.getByRole("region", { name: "Pengaturan Muse Code", exact: true }),
  ).toBeHidden();
  await page.goForward();
  await expect(
    page.getByRole("region", { name: "Pengaturan Muse Code", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("region", { name: "Pengaturan Muse Code", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeVisible();
  await expect(page.locator('.settings-nav-item[aria-current="page"]')).toHaveCount(1);
  for (const width of info.project.name === "mobile" ? [320, 390] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`provider-${width}.png`) });
  }
  await page.goto("/settings?section=providers&provider=muse");
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/" &&
      url.searchParams.get("settings") === "providers" &&
      url.searchParams.get("provider") === "muse",
  );
  await expect(
    page.getByRole("region", { name: "Pengaturan Muse Code", exact: true }),
  ).toBeVisible();
  await page.locator(".settings-scrim").click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog", { name: "Pengaturan", exact: true })).toBeHidden();
  await expect(page).toHaveURL((url) => url.pathname === "/" && !url.searchParams.has("settings"));
});

test("default model picker persists Tobi choices and new agents inherit the explicit account and billing", async ({
  page,
}, info) => {
  await settings(page);
  const getTobi = async () => {
    const agents = await page.request.get("/v1/entities/agent").then((response) => response.json());
    return agents.find((agent: { system_role: string | null }) => agent.system_role === "tobi");
  };
  const before = await getTobi();
  const response = await page.request.post("/v1/connections", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      harness: "codex",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: crypto.randomUUID(),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const account = await response.json();
  const model = `settings-default-${crypto.randomUUID().slice(0, 8)}`;
  // Only the native-inspection projection is controlled. Configuration and creation
  // persist through the real API/SQLite; this does not claim native inference.
  await page.route("**/v1/entities/connection", async (route) => {
    const upstream = await route.fetch();
    const connections = await upstream.json();
    await route.fulfill({
      response: upstream,
      json: connections.map((connection: { id: string }) =>
        connection.id === account.id
          ? {
              ...connection,
              login: "authenticated",
              discovery: "succeeded",
              effective_billing_source: "api_key",
              account_id: "settings-default-proof",
              models: [{ id: model, reasoning: ["low", "high"] }],
            }
          : connection,
      ),
    });
  });
  let created: { agent: { id: string; name: string }; thread: { id: string } } | null = null;
  try {
    await page.reload();
    await providers(page);
    const settingsDialog = page.getByRole("dialog", { name: "Pengaturan", exact: true });
    const picker = settingsDialog
      .locator(".settings-default-control")
      .getByRole("button", { name: "Pilih model", exact: true });
    await picker.click();
    const menu = page.getByRole("dialog", { name: "Pilih model", exact: true });
    const group = menu.locator(`[data-simple-provider="${account.id}"]`);
    await expect(group).toContainText("API key");
    const update = page.waitForRequest(
      (request) =>
        request.url().endsWith(`/v1/agents/${before.id}/configuration`) &&
        request.method() === "POST",
    );
    await group.getByRole("button", { name: model, exact: true }).click();
    expect((await update).postDataJSON().changes).toMatchObject({
      connection_id: account.id,
      model_id: model,
      harness: "codex",
      billing_source: "api_key",
    });
    await expect(menu).toBeHidden();
    await expect(picker).toHaveText(model);
    await picker.click();
    await menu.getByRole("button", { name: "high", exact: true }).click();
    await expect.poll(async () => (await getTobi()).reasoning).toBe("high");
    await page.keyboard.press("Escape");
    await expect(settingsDialog).toBeVisible();
    await settingsDialog.getByRole("button", { name: /^Akun & sumber biaya/ }).click();
    await expect(
      settingsDialog.locator(".settings-row").filter({ hasText: "Biaya dipilih" }),
    ).toContainText("API key");
    await expect(
      settingsDialog.locator(".settings-row").filter({ hasText: "Biaya terverifikasi" }),
    ).toContainText("API key");
    await expect(
      settingsDialog.locator(".settings-row").filter({ hasText: "Inference" }),
    ).toContainText("Belum dicoba");
    await page.screenshot({ path: info.outputPath("default-model-truth.png") });
    await page.reload();
    await expect(picker).toHaveText(model);
    expect(await getTobi()).toMatchObject({
      connection_id: account.id,
      model_id: model,
      reasoning: "high",
      billing_source: "api_key",
    });
    await page.getByRole("button", { name: "Tutup pengaturan", exact: true }).click();
    const navigation = page.getByRole("button", { name: "Buka percakapan", exact: true });
    if (await navigation.isVisible()) await navigation.click();
    await page.getByRole("button", { name: "Buat baru", exact: true }).click();
    const creation = page.waitForResponse(
      (result) =>
        result.url().endsWith("/v1/creation/agents") && result.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Create agent", exact: true }).click();
    const result = await creation;
    expect(result.ok()).toBeTruthy();
    created = await result.json();
    expect(created?.agent).toMatchObject({
      connection_id: account.id,
      model_id: model,
      reasoning: "high",
      harness: "codex",
      billing_source: "api_key",
    });
    await expect(
      page.getByRole("button", { name: `Detail ${created?.agent.name}`, exact: true }),
    ).toBeVisible();
  } finally {
    const current = await getTobi();
    const restored = await page.request.post(`/v1/agents/${current.id}/configuration`, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {
        expected_revision: current.revision,
        changes: {
          connection_id: before.connection_id,
          harness: before.harness,
          model_id: before.model_id,
          reasoning: before.reasoning,
          billing_source: before.billing_source,
        },
      },
    });
    expect(restored.ok()).toBeTruthy();
    if (created) {
      const snapshot = await page.request
        .get(`/v1/threads/${created.thread.id}/snapshot`)
        .then((result) => result.json());
      for (const run of snapshot.runs)
        if (run.status === "queued")
          await page.request.post(`/v1/runs/${run.id}/cancel`, { data: {} });
    }
    const revoked = await page.request.post(`/v1/connections/${account.id}/revoke`, {
      headers: { "Idempotency-Key": crypto.randomUUID() },
      data: {},
    });
    expect(revoked.ok()).toBeTruthy();
  }
});
