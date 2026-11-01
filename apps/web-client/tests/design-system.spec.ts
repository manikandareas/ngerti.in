import { test as base, expect } from "@playwright/test";
import { components } from "../src/lib/component-catalog.js";

const test = base.extend({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await use(page);
    expect(errors, "Browser runtime errors").toEqual([]);
  },
});

test("dedicated route opens directly and refreshes", async ({ page }) => {
  await page.goto("/design-system");
  await expect(page).toHaveTitle("Design System · Ngertiin");
  await expect(page.getByRole("heading", { name: "Design system", exact: true })).toBeVisible();
  await expect(page.getByTestId("foundations")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Typography", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("foundations")).toBeVisible();
  await page.getByRole("link", { name: "Kembali ke beranda" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
});

for (const mode of ["light", "dark"] as const) {
  test(`${mode}: foundations use live Midnight/Daylight tokens`, async ({ page }) => {
    await page.goto("/design-system");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    await expect(page.locator('[data-token-value="background"]')).toHaveText(
      mode === "light" ? "#fcfcfc" : "#121212",
    );
    await expect(page.locator('[data-token-value="primary"]')).toHaveText(
      mode === "light" ? "#0b62c4" : "#1084fe",
    );
    await expect(page.locator('[data-token="card"]')).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(240, 240, 240)" : "rgb(31, 31, 31)",
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: test.info().outputPath(`${mode}-foundations.png`),
      fullPage: true,
    });
  });

  test(`${mode}: every installed primitive has a working preview`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/design-system");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    for (const component of components) {
      await test.step(component, async () => {
        await page.goto(`/design-system?component=${component}`);
        const preview = page.locator(`[data-example="${component}"]`);
        await expect(preview).toBeVisible();
        await expect(preview.locator("[data-slot]").first()).toBeVisible();
        await expect(page.locator("html")).toHaveClass(mode);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${component} viewport overflow`,
        ).toBe(true);
        if (["button", "calendar", "chart", "sidebar", "questionnaire"].includes(component)) {
          await page
            .locator(`[data-preview="${component}"]`)
            .screenshot({ path: test.info().outputPath(`${mode}-${component}.png`) });
        }
      });
    }
  });
}

test("search and category filters narrow the primitive list", async ({ page }) => {
  await page.goto("/design-system?component=button");
  const nav = page.getByRole("navigation", { name: "Primitive components", exact: true });
  await expect(nav.getByRole("link")).toHaveCount(63);
  await page.getByRole("searchbox", { name: "Cari komponen" }).fill("slider");
  await expect(nav.getByRole("link")).toHaveCount(1);
  await nav.getByRole("link", { name: "Slider", exact: true }).click();
  await expect(page).toHaveURL(/component=slider/);
  await expect(page.locator('[data-example="slider"]')).toBeVisible();
  await page.getByRole("searchbox", { name: "Cari komponen" }).fill("tidak-ditemukan");
  await expect(nav).toContainText("Tidak ada komponen yang cocok");
  await page.getByRole("searchbox", { name: "Cari komponen" }).clear();
  await page.getByRole("combobox", { name: "Kategori", exact: true }).selectOption("actions");
  await expect(nav.getByRole("link")).toHaveCount(4);
  await nav.getByRole("link", { name: "Button", exact: true }).click();
  await expect(nav.getByRole("link", { name: "Button", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.goBack();
  await expect(page).toHaveURL(/component=slider/);
});

test("interactive previews work and can reset", async ({ page }) => {
  await page.goto("/design-system?component=progress");
  await page.getByRole("button", { name: "Tambah progress" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "76");
  await page.getByRole("button", { name: "Reset contoh" }).click();
  await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "64");
  await page.goto("/design-system?component=combobox");
  await page.getByRole("combobox", { name: "Cari agent" }).fill("Bud");
  await page.getByRole("option", { name: "Bud", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Cari agent" })).toHaveValue("Bud");
  await page.goto("/design-system?component=dropdown-menu");
  await page.getByRole("button", { name: "Buka menu" }).click();
  const checkbox = page.getByRole("menuitemcheckbox", { name: "Notifikasi" });
  await expect(checkbox).toBeChecked();
  await checkbox.click();
  await page.getByRole("button", { name: "Buka menu" }).click();
  await expect(page.getByRole("menuitemcheckbox", { name: "Notifikasi" })).not.toBeChecked();
  await page.keyboard.press("Escape");
  await page.goto("/design-system?component=dialog");
  await page.getByRole("button", { name: "Buka dialog" }).click();
  await page.getByRole("textbox", { name: "Nama", exact: true }).fill("Bud");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Contoh disimpan")).toBeVisible();
});

test("questionnaire demo advances and submits locally", async ({ page }) => {
  await page.goto("/design-system?component=questionnaire");
  await page.getByRole("radio", { name: "Dark mode", exact: true }).check();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("radio", { name: "Compact", exact: true }).check();
  await page.getByRole("button", { name: "Selesai", exact: true }).click();
  await expect(page.getByText("Jawaban contoh disimpan")).toBeVisible();
});

test("invalid component falls back to foundations and unknown routes show 404", async ({
  page,
}) => {
  await page.goto("/design-system?component=unknown");
  await expect(page.getByTestId("foundations")).toBeVisible();
  await page.goto("/unknown-page");
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan." })).toBeVisible();
});
