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
async function settings(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  const menu = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: "Pengaturan", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
async function providers(page: Page) {
  await page
    .getByRole("navigation", { name: "Menu pengaturan" })
    .getByRole("link", { name: "Providers", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Providers", exact: true })).toBeVisible();
  await expect(page.locator('.settings-nav-item[aria-current="page"]')).toHaveCount(1);
}
async function detail(page: Page, name: string) {
  await page.locator(".provider-list-row").filter({ hasText: name }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/harnesses", (route) => route.fulfill({ json: harnesses }));
});

test("settings navigation, search, theme and return preserve the conversation draft", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await settings(page);
  await page.getByRole("link", { name: "Kembali ke percakapan" }).click();
  await page
    .getByRole("textbox", { name: "Pesan", exact: true })
    .fill("Draft retained while checking settings.");
  const menu = page.getByRole("button", { name: "Buka percakapan", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await page.getByRole("textbox", { name: "Cari pengaturan" }).fill("unknown menu");
  await expect(page.getByText("Tidak ada pengaturan yang cocok.")).toBeVisible();
  await page.getByRole("textbox", { name: "Cari pengaturan" }).fill("provider");
  await expect(
    page.getByRole("navigation", { name: "Menu pengaturan" }).getByRole("link", { name: "Umum" }),
  ).toHaveCount(0);
  await providers(page);
  await page
    .getByRole("navigation", { name: "Menu pengaturan" })
    .getByRole("link", { name: "Umum" })
    .click();
  for (const mode of ["gelap", "terang"]) {
    await page.getByRole("combobox", { name: "Tema tampilan" }).click();
    await page
      .getByRole("option", { name: mode === "gelap" ? "Gelap" : "Terang", exact: true })
      .click();
    await expect(page.locator("html")).toHaveClass(mode === "gelap" ? /dark/ : /light/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`general-${mode}.png`) });
  }
  await page.getByRole("link", { name: "Kembali ke percakapan" }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveValue(
    "Draft retained while checking settings.",
  );
  expect(errors).toEqual([]);
});

test("provider detail, key dialog, native-login fixture and actionable inspection failure", async ({
  page,
}, info) => {
  await page.route("**/v1/connections/*/login", (route) =>
    route.fulfill({
      json: {
        auth_url: "https://example.com/proof-login",
        user_code: "TEST-1234",
        expires_in_seconds: 600,
      },
    }),
  );
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
  const dialog = page.getByRole("dialog", { name: "Meta API key untuk Muse Code" });
  await expect(dialog.getByRole("button", { name: "Simpan key" })).toBeDisabled();
  await dialog.getByLabel("API key", { exact: true }).fill("fake-private-key-for-dialog-only");
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveAttribute("type", "password");
  await dialog.getByRole("button", { name: "Lihat", exact: true }).click();
  await expect(dialog.getByLabel("API key", { exact: true })).toHaveAttribute("type", "text");
  await dialog.getByRole("button", { name: "Sembunyikan" }).click();
  await page.screenshot({ path: info.outputPath("api-key-dialog.png") });
  await dialog.getByRole("button", { name: "Batal", exact: true }).click();
  await page.getByRole("button", { name: "Tambah akun", exact: true }).click();
  await expect(page.getByText("TEST-1234", { exact: true })).toBeVisible();
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
    .getByRole("navigation", { name: "Lokasi provider" })
    .getByRole("button", { name: "Providers", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Providers", exact: true })).toBeVisible();
});

test("real key onboarding retries a lost acknowledgement without duplicate, then revokes", async ({
  page,
}, info) => {
  await settings(page);
  await providers(page);
  await detail(page, "ChatGPT");
  await page.getByRole("button", { name: "Tambah key" }).click();
  const dialog = page.getByRole("dialog", { name: "OpenAI API key untuk ChatGPT" });
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
  await dialog.getByLabel("API key", { exact: true }).fill(secret);
  await dialog.getByRole("button", { name: "Simpan key", exact: true }).click();
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
    .getByRole("navigation", { name: "Lokasi provider" })
    .getByRole("button", { name: "Providers", exact: true })
    .click();
  await page.getByRole("link", { name: "Kembali ke percakapan" }).click();
  await page.getByTitle("Pengaturan model dan koneksi").click();
  await expect(page.getByLabel("Koneksi Tobi", { exact: true })).toBeVisible();
});

test("dedicated settings and provider URLs support reload, history and narrow viewports", async ({
  page,
}, info) => {
  await settings(page);
  await providers(page);
  await detail(page, "Muse Code");
  await expect(page).toHaveURL(/section=providers.*provider=muse/);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Providers", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Muse Code", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Muse Code", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator('.settings-nav-item[aria-current="page"]')).toHaveCount(1);
  for (const width of info.project.name === "mobile" ? [320, 390] : [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    await page.screenshot({ path: info.outputPath(`provider-${width}.png`) });
  }
});
