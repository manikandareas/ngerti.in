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
  test(`${mode}: foundations use live Midnight/Daylight tokens`, async ({ page }, info) => {
    const phone = info.project.name === "mobile";
    await page.goto("/design-system");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    await expect(page.locator('[data-token-value="background"]')).toHaveText(
      mode === "light" ? "#fcfcfc" : phone ? "#141414" : "#121212",
    );
    await expect(page.locator('[data-token-value="primary"]')).toHaveText("#0b62c4");
    await expect(page.locator('[data-token="card"]')).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(240, 240, 240)" : phone ? "rgb(36, 36, 38)" : "rgb(31, 31, 31)",
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

for (const mode of ["light", "dark"] as const) {
  test(`${mode}: popup families use the OpenMaus menu geometry`, async ({ page }, testInfo) => {
    await page.goto("/design-system?component=dropdown-menu");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    // Pinned styles.css: menu overrides at 2889 and Midnight phone palette at 2915.
    const phone = testInfo.project.name === "mobile";
    const surface =
      mode === "light" ? "rgb(255, 255, 255)" : phone ? "rgb(44, 44, 46)" : "rgb(31, 31, 31)";
    const rowHeight = testInfo.project.use.hasTouch ? "40px" : "30px";

    for (const component of ["dropdown-menu", "context-menu", "menubar", "select", "combobox"]) {
      await test.step(component, async () => {
        await page.goto(`/design-system?component=${component}`);
        const example = page.locator(`[data-example="${component}"]`);
        if (component === "dropdown-menu")
          await example.getByRole("button", { name: "Buka menu" }).click();
        if (component === "context-menu")
          await example.getByText("Klik kanan atau tekan lama area ini").click({ button: "right" });
        if (component === "menubar")
          await example.getByRole("menuitem", { name: "File", exact: true }).click();
        if (component === "select") await example.getByRole("combobox").click();
        if (component === "combobox") await example.getByRole("combobox").fill("T");
        const popup = page.locator(`[data-slot="${component}-content"]`);
        await expect(popup).toBeVisible();
        await expect(popup).toHaveCSS(
          "border-radius",
          mode === "light" ? "14px" : phone ? "22px" : "12px",
        );
        await expect(popup).toHaveCSS("background-color", surface);
        if (["dropdown-menu", "context-menu", "menubar"].includes(component)) {
          await expect
            .poll(() => popup.evaluate((element) => element.getBoundingClientRect().width))
            .toBeGreaterThanOrEqual(192);
        }
        const inset =
          component === "combobox" ? popup.locator('[data-slot="combobox-list"]') : popup;
        await expect(inset).toHaveCSS("padding-top", "6px");
        const row = popup.locator(`[data-slot="${component}-item"]`).first();
        await expect(row).toHaveCSS("min-height", rowHeight);
        await expect(row).toHaveCSS("border-radius", "6px");
        await page.screenshot({ path: testInfo.outputPath(`${mode}-${component}-open.png`) });
        await page.keyboard.press("Escape");
        await expect(popup).not.toBeVisible();
      });
    }
  });

  test(`${mode}: control focus, switch travel, and neutral bubbles`, async ({ page }, testInfo) => {
    await page.goto("/design-system?component=input");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    const input = page.getByRole("textbox", { name: "Email", exact: true });
    await input.focus();
    await expect(input).toHaveCSS("height", "32px");
    await expect(input).toHaveCSS("border-radius", "8px");
    await expect(input).toHaveCSS("font-size", testInfo.project.use.isMobile ? "16px" : "13px");
    await expect(input).toHaveCSS(
      "border-color",
      mode === "light" ? "rgb(201, 201, 201)" : "rgb(65, 65, 65)",
    );
    await expect(input).toHaveCSS("box-shadow", "none");
    await expect(page.locator("#demo-invalid")).toHaveCSS(
      "border-color",
      mode === "light" ? "rgb(192, 43, 58)" : "rgb(255, 86, 103)",
    );

    await page.goto("/design-system?component=button");
    const primary = page
      .locator('[data-example="button"]')
      .getByRole("button", { name: "default", exact: true });
    await expect(primary).toHaveCSS("font-size", "13px");
    await expect(primary).toHaveCSS("color", "rgb(255, 255, 255)");

    await page.goto("/design-system?component=switch");
    const control = page.getByRole("switch", { name: "Aktifkan notifikasi" });
    await expect(control).toHaveCSS("width", "36px");
    await expect(control).toHaveCSS("height", "20px");
    const thumb = control.locator('[data-slot="switch-thumb"]');
    const checkedX = (await thumb.boundingBox())?.x;
    await control.click();
    await expect(control).not.toBeChecked();
    await expect(thumb).toHaveCSS("translate", "2px");
    const uncheckedX = (await thumb.boundingBox())?.x;
    if (checkedX === undefined || uncheckedX === undefined)
      throw new Error("Switch thumb is missing");
    expect(checkedX - uncheckedX).toBeCloseTo(14);
    await page.goto("/design-system?component=bubble");
    await expect(page.locator('[data-slot="bubble-content"]').first()).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(7, 7, 7)" : "rgb(90, 90, 90)",
    );
    await expect(page.locator('[data-slot="bubble-content"]').first()).toHaveCSS(
      "border-radius",
      "20px",
    );

    if (testInfo.project.use.isMobile) {
      await page.goto("/design-system?component=sidebar");
      await page
        .locator('[data-example="sidebar"]')
        .getByRole("button", { name: "Toggle Sidebar" })
        .click();
      const sidebar = page.locator('[data-slot="sidebar"][data-mobile="true"]');
      await expect(sidebar).toBeVisible();
      await expect(sidebar).toHaveCSS("width", "390px");
      await sidebar.getByRole("button", { name: "Close", exact: true }).click();
      await expect(sidebar).not.toBeVisible();
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/design-system?component=dialog");
    await page.getByRole("button", { name: "Buka dialog", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(
      await dialog.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).animationDuration),
      ),
    ).toBeLessThan(0.001);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Buka dialog", exact: true })).toBeFocused();
  });
}
