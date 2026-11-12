import { expect, type Page, test } from "@playwright/test";
import type { SettingsSectionId } from "../src/features/settings/lib/settings-search.js";

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
  const menu = page.getByRole("button", { name: "Percakapan", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === "/" && url.searchParams.get("settings") === "general",
  );
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Percakapan", exact: true })).toBeVisible();
}
async function section(page: Page, id: SettingsSectionId, label: string) {
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeVisible();
  const mobileMenu = page.getByRole("combobox", { name: "Menu pengaturan", exact: true });
  if (await mobileMenu.isVisible()) await mobileMenu.selectOption(id);
  else
    await page
      .getByRole("navigation", { name: "Menu pengaturan", exact: true })
      .getByRole("link", { name: label, exact: true })
      .click();
  await expect(
    page
      .getByRole("main", { name: "Pengaturan", exact: true })
      .getByRole("heading", { name: label, exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL((url) => url.searchParams.get("settings") === id);
}
async function providers(page: Page) {
  await section(page, "providers", "Providers");
  await expect(page.locator('.settings-nav-item[aria-current="page"]')).toHaveCount(1);
}
async function detail(page: Page, name: string) {
  const row = page.locator(".provider-list-row").filter({ hasText: name });
  await row.getByRole("button", { name: /^(Kelola|Siapkan)$/ }).click();
  await expect(page.getByRole("region", { name: `Pengaturan ${name}`, exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/harnesses", (route) => route.fulfill({ json: harnesses }));
});

test("settings screen, navigation, theme and return preserve the conversation draft", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const screen = page.getByRole("main", { name: "Pengaturan", exact: true });
  const back = page.getByRole("button", { name: "Percakapan", exact: true });
  await settings(page, "/?context=retained");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".settings-scrim")).toHaveCount(0);
  await expect(page.getByRole("main", { name: "Percakapan aktif" })).toBeHidden();
  const screenBounds = await page.locator("[data-settings-screen]").boundingBox();
  const bodyBounds = await page.locator(".application-body").boundingBox();
  expect(screenBounds?.x).toBeGreaterThanOrEqual(48);
  expect(screenBounds?.width).toBeCloseTo(bodyBounds?.width ?? 0, 0);
  await expect(page.getByRole("navigation", { name: "Navigasi utama", exact: true })).toBeVisible();
  if (info.project.name === "desktop")
    expect((await page.locator(".settings-sidebar").boundingBox())?.width).toBe(280);
  await page.goBack();
  await expect(screen).toBeHidden();
  await page.goForward();
  await expect(screen).toBeVisible();
  await back.click();
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Draft retained while checking settings.");
  const composer = await page.getByRole("textbox", { name: "Pesan", exact: true }).elementHandle();
  const menu = page.getByRole("button", { name: "Percakapan", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(screen).toBeVisible();
  expect(await composer?.evaluate((element) => element.isConnected)).toBeTruthy();
  await expect(page.getByRole("textbox", { name: "Cari pengaturan" })).toHaveCount(0);
  await providers(page);
  await expect(page.getByRole("textbox", { name: "Cari provider" })).toHaveCount(0);
  await expect(page.locator(".provider-list-row")).toHaveCount(2);
  await section(page, "appearance", "Tampilan");
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
  await back.click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "Draft retained while checking settings.",
  );
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(screen.getByRole("heading", { name: "Tampilan", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("[data-settings-screen]")),
  ).toBeTruthy();
  // Escape belongs to inline editors and popovers; a full screen stays open.
  await page.keyboard.press("Escape");
  await expect(screen).toBeVisible();
  await section(page, "about", "Tentang");
  await expect(screen.getByRole("heading", { name: "Tentang", exact: true })).toBeFocused();
  await expect(screen.getByText("Ngertiin", { exact: true })).toBeVisible();
  await back.click();
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
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          !!document.activeElement?.closest(".application-frame") &&
          !document.activeElement?.closest("[inert]"),
      ),
    )
    .toBeTruthy();
  await expect(back).toBeFocused();
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
  await detail(page, "Muse Code");
  await page.getByRole("button", { name: "Tambah key" }).click();
  const dialog = page.getByRole("group", { name: "Meta API key untuk Muse Code" });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Simpan key" })).toBeDisabled();
  await dialog.getByLabel("API key", { exact: true }).fill("fake-private-key-for-dialog-only");
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveAttribute("type", "password");
  await detail(page, "ChatGPT");
  await expect(dialog).toBeHidden();
  await detail(page, "Muse Code");
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveValue(
    "fake-private-key-for-dialog-only",
  );
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
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await page.getByRole("button", { name: "Pilih model", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Pilih model", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Kelola akun & model", exact: true }).click();
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeVisible();
});

test("settings screen and provider URLs support reload, history and narrow viewports", async ({
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
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeVisible();
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
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeHidden();
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
    await section(page, "general", "Umum");
    const settingsScreen = page.getByRole("main", { name: "Pengaturan", exact: true });
    const picker = settingsScreen
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
    await expect(settingsScreen).toBeVisible();
    await settingsScreen.getByRole("button", { name: /^Akun & sumber biaya/ }).click();
    await expect(
      settingsScreen.locator(".settings-row").filter({ hasText: "Biaya dipilih" }),
    ).toContainText("API key");
    await expect(
      settingsScreen.locator(".settings-row").filter({ hasText: "Biaya terverifikasi" }),
    ).toContainText("API key");
    await expect(
      settingsScreen.locator(".settings-row").filter({ hasText: "Inference" }),
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
    await page.getByRole("button", { name: "Percakapan", exact: true }).click();
    const navigation = page.getByRole("button", { name: "Percakapan", exact: true });
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

test("device preferences persist and control the composer and reading surface", async ({
  page,
}, info) => {
  await settings(page);
  await expect(page.locator(".settings-nav-item")).toHaveCount(8);
  await section(page, "appearance", "Tampilan");
  await page
    .getByRole("combobox", { name: "Ukuran teks percakapan", exact: true })
    .selectOption("large");
  await page
    .getByRole("combobox", { name: "Lebar percakapan", exact: true })
    .selectOption("comfortable");
  await expect(page.getByRole("region", { name: "Pratinjau ukuran teks" })).toHaveCSS(
    "font-size",
    "17px",
  );
  await page.screenshot({ path: info.outputPath("appearance-expanded.png") });
  await section(page, "conversation", "Percakapan");
  await page
    .getByRole("combobox", { name: "Kirim pesan dengan", exact: true })
    .selectOption("mod-enter");
  await page.getByRole("switch", { name: "Tampilkan waktu pesan", exact: true }).uncheck();
  await page.getByRole("switch", { name: "Perhalus teks yang masuk", exact: true }).uncheck();
  await section(page, "accessibility", "Aksesibilitas");
  await page.getByRole("switch", { name: "Animasi avatar", exact: true }).uncheck();
  await page.getByRole("switch", { name: "Avatar mengikuti kursor", exact: true }).uncheck();
  await page.getByRole("switch", { name: "Selalu tampilkan aksi pesan", exact: true }).check();
  await page.reload();
  await expect(page.getByRole("switch", { name: "Animasi avatar", exact: true })).not.toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Selalu tampilkan aksi pesan", exact: true }),
  ).toBeChecked();
  await section(page, "shortcuts", "Pintasan keyboard");
  await expect(page.getByRole("main", { name: "Pengaturan" })).toContainText("⌘ / Ctrl + Enter");
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-chat-text-size", "large");
  await expect(page.locator("html")).toHaveAttribute("data-reading-width", "comfortable");
  await expect(page.locator(".message-time")).toHaveCount(0);
  await expect(page.locator(".chat-md").first()).toHaveCSS("font-size", "17px");
  await expect(page.locator(".conversation-column")).toHaveCSS("max-width", "704px");
  const input = page.getByRole("textbox", { name: "Pesan", exact: true });
  const text = `Settings shortcut ${crypto.randomUUID()}`;
  await input.fill(text);
  await input.press("End");
  await input.press("Enter");
  await input.press("a");
  await expect(input).toHaveText(`${text}\na`, { useInnerText: true });
  const admitted = page.waitForRequest(
    (request) => request.url().endsWith("/v1/runs") && request.method() === "POST",
  );
  await input.press("Control+Enter");
  expect((await admitted).postDataJSON().text).toBe(`${text}\na`);
  await expect(input).toBeEmpty();
});

test("draft privacy and reset change local preferences while preserving conversation data", async ({
  page,
  context,
}) => {
  await settings(page);
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  const draft = `Private local draft ${crypto.randomUUID()}`;
  await page.getByRole("textbox", { name: "Pesan", exact: true }).fill(draft);
  await expect
    .poll(() =>
      page.evaluate(
        () => Object.keys(localStorage).filter((key) => key.startsWith("ngertiin:draft:")).length,
      ),
    )
    .toBeGreaterThan(0);
  const menu = page.getByRole("button", { name: "Percakapan", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await section(page, "data", "Data & privasi");
  await page
    .getByRole("switch", { name: "Simpan draft setelah aplikasi ditutup", exact: true })
    .uncheck();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("ngertiin:draft:")),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(draft);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(draft);
  const another = await context.newPage();
  await another.goto("/");
  await expect(another.getByRole("textbox", { name: "Pesan", exact: true })).toBeEmpty();
  await another.close();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await section(page, "data", "Data & privasi");
  await page.getByRole("button", { name: "Atur ulang preferensi", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Atur ulang", exact: true })
    .click();
  await expect(
    page.getByRole("switch", { name: "Simpan draft setelah aplikasi ditutup", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(draft);
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
});

test("data export downloads public history and plugin management lives in Marketplace", async ({
  page,
}, info) => {
  await settings(page);
  await section(page, "data", "Data & privasi");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor percakapan", exact: true }).click();
  const download = await downloaded;
  expect(download.suggestedFilename()).toMatch(/^ngertiin-conversation-.*\.json$/);
  const path = info.outputPath("conversation-export.json");
  await download.saveAs(path);
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(await readFile(path, "utf8"));
  expect(data.version).toBe(1);
  expect(data.messages.length).toBeGreaterThan(0);
  expect(Object.keys(data.messages[0])).toEqual([
    "id",
    "author",
    "agent",
    "text",
    "created_at",
    "attachment_ids",
  ]);
  expect(data).not.toHaveProperty("runs");
  expect(data).not.toHaveProperty("connections");
  await expect(page.locator('[data-settings-page="apps"]')).toHaveCount(0);
  await page.route("**/v1/apps/catalog?*", (route) => route.fulfill({ json: { items: [] } }));
  await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: [] }));
  await page.goto("/settings?section=apps");
  await expect(page.getByRole("main", { name: "Marketplace", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/marketplace=plugins/);
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeHidden();
  await page.goto("/?settings=apps");
  await expect(page.getByRole("main", { name: "Marketplace", exact: true })).toBeVisible();
  await page.goto("/settings?section=appearance");
  await expect(page.getByRole("heading", { name: "Tampilan", exact: true })).toBeVisible();
});

test("startup preference opens Tobi on reload without changing the current conversation immediately", async ({
  page,
}) => {
  await settings(page);
  const response = await page.request.post("/v1/creation/agents", {
    headers: { "Idempotency-Key": crypto.randomUUID() },
    data: {
      harness: "codex",
      connection_id: null,
      model_id: null,
      reasoning: null,
      billing_source: "subscription",
    },
  });
  expect(response.ok()).toBeTruthy();
  const created = await response.json();
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  const menu = page.getByRole("button", { name: "Percakapan", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator(`[data-thread-id="${created.thread.id}"]`).click();
  await expect(
    page.getByRole("button", { name: `Detail ${created.agent.name}`, exact: true }),
  ).toBeVisible();
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await page.getByRole("combobox", { name: "Percakapan awal", exact: true }).selectOption("tobi");
  await page.getByRole("button", { name: "Percakapan", exact: true }).click();
  await expect(
    page.getByRole("button", { name: `Detail ${created.agent.name}`, exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
});

test("persistent rail switches the contextual sidebar without collapse controls", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const rail = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
  const conversation = rail.getByRole("button", { name: "Percakapan", exact: true });
  const preferences = rail.getByRole("button", { name: "Pengaturan", exact: true });
  const originalRail = await rail.elementHandle();
  await expect(rail.getByRole("button")).toHaveCount(3);
  await expect(conversation).toHaveAttribute("aria-current", "page");
  await expect(conversation.locator("svg")).toHaveCSS("width", "20px");
  await expect(page.locator(".application-body")).toHaveCSS("border-left-width", "0px");
  await expect(rail).toHaveCSS("width", info.project.name === "mobile" ? "48px" : "56px");
  await conversation.click();
  await conversation.click();
  const list = page.getByRole("complementary", { name: "Daftar percakapan", exact: true });
  await expect(list).toBeVisible();
  await expect(list.locator(".navigation-title")).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Tutup daftar percakapan" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Buka percakapan", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Percakapan", exact: true })).toHaveCount(0);
  if (info.project.name === "mobile")
    await list.locator('[data-thread-id][aria-current="page"]').click();
  await expect(page.getByRole("main", { name: "Percakapan aktif", exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Retained with the persistent rail.");
  await preferences.click();
  await expect(preferences).toHaveAttribute("aria-current", "page");
  await expect(rail).toBeVisible();
  expect(await originalRail?.evaluate((element) => element.isConnected)).toBe(true);
  await expect(page.getByRole("navigation", { name: "Menu pengaturan", exact: true })).toBeVisible({
    visible: info.project.name === "desktop",
  });
  await section(page, "appearance", "Tampilan");
  if (info.project.name === "desktop") {
    await expect(page.locator(".settings-sidebar-title")).toHaveCSS("font-size", "18px");
    await expect(page.locator(".settings-sidebar-title")).toHaveCSS(
      "font-size",
      await page
        .locator(".settings-content-header h1")
        .evaluate((element) => getComputedStyle(element).fontSize),
    );
    await expect(page.locator(".settings-sidebar")).toHaveCSS("border-right-width", "0px");
  }
  await preferences.click();
  await expect(page.getByRole("heading", { name: "Tampilan", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("rail-settings.png") });
  await conversation.click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
    "Retained with the persistent rail.",
  );
  await preferences.click();
  await expect(page.getByRole("heading", { name: "Tampilan", exact: true })).toBeVisible();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(rail).toBeVisible();
    await expect(preferences).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const bounds = await rail.boundingBox();
    expect(bounds?.x).toBe(0);
    expect(bounds?.width).toBe(width < 768 ? 48 : 56);
  }
  expect(await originalRail?.evaluate((element) => element.isConnected)).toBe(true);
});

test("returning through the rail retains the conversation reading position", async ({
  page,
}, info) => {
  // Only public text length is a fixture; bootstrap, scope and navigation use the real API.
  await page.route("**/v1/threads/*/snapshot", async (route) => {
    const response = await route.fetch();
    const snapshot = await response.json();
    const longText = Array.from(
      { length: 65 },
      (_, index) =>
        `Reading paragraph ${index + 1}. A long conversation retains the place where the owner is reading.`,
    ).join("\n\n");
    const fill = (message: { author: string; text: string }) =>
      message.author !== "user" ? { ...message, text: longText } : message;
    await route.fulfill({
      response,
      json: {
        ...snapshot,
        messages: snapshot.messages.map(fill),
        timeline: { ...snapshot.timeline, messages: snapshot.timeline.messages.map(fill) },
      },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await composer.fill("Draft stays at this reading position.");
  const scroll = page.locator(".conversation-scroll");
  await expect
    .poll(() => scroll.evaluate((element) => element.scrollHeight - element.clientHeight))
    .toBeGreaterThan(1000);
  await scroll.evaluate((element) => {
    element.scrollTop = 420;
  });
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeCloseTo(420, 0);
  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .getByRole("button", { name: "Pengaturan", exact: true })
    .click();
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .getByRole("button", { name: "Percakapan", exact: true })
    .click();
  await expect(composer).toHaveText("Draft stays at this reading position.");
  await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeCloseTo(420, 0);
  await page.screenshot({ path: info.outputPath(`rail-conversation-${info.project.name}.png`) });
});
