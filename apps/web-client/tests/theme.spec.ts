import { test as base, expect } from "@playwright/test";

const storageKey = "ngertiin-web-client-theme";

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

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

for (const mode of ["light", "dark"] as const) {
  test(`${mode}: Page 1 colors, control sizes, and fonts`, async ({ page }) => {
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    await expect(page.locator("html")).toHaveClass(mode);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(247, 247, 248)" : "rgb(17, 17, 20)",
    );
    await expect(page.locator('[data-swatch="card"]')).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(255, 255, 255)" : "rgb(27, 27, 30)",
    );
    await expect(page.locator('[data-swatch="primary"]')).toHaveCSS(
      "background-color",
      "rgb(40, 93, 245)",
    );
    await expect(page.locator("#email")).toHaveCSS("height", "36px");
    await expect(page.locator("#email")).toHaveCSS("border-radius", "5px");
    await expect(page.locator('[data-slot="card"]').first()).toHaveCSS("border-radius", "16px");
    await expect(page.locator("body")).toHaveCSS("font-family", /Inter Variable/);
    await expect(page.locator('[data-slot="code-block"]')).toHaveCSS(
      "background-color",
      "rgb(27, 27, 30)",
    );
    await expect(page.locator('[data-slot="code-block-content"]')).toHaveCSS(
      "font-family",
      /Geist Mono Variable/,
    );
    await expect(page.locator("footer")).toBeVisible();
    const widths = await page.evaluate(() => ({
      viewport: innerWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(widths.content).toBeLessThanOrEqual(widths.viewport);
    await page.screenshot({ path: test.info().outputPath(`${mode}.png`), fullPage: true });
  });
}

test("explicit theme survives reload and system changes", async ({ page }) => {
  await page.getByRole("radio", { name: "Mode gelap" }).click();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
    .toBe("dark");
  await page.reload();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass("dark");
  await page.getByRole("radio", { name: "Mode terang" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass("light");
});

test("system mode follows live OS changes", async ({ page }) => {
  await page.getByRole("radio", { name: "Mode sistem" }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass("light");
  await expect(page.getByRole("radio", { name: "Mode sistem" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("theme still works when browser storage is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
    Storage.prototype.setItem = () => {
      throw new DOMException("Storage blocked", "SecurityError");
    };
  });
  await page.reload();
  await page.getByRole("radio", { name: "Mode gelap" }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await page.getByRole("radio", { name: "Mode terang" }).click();
  await expect(page.locator("html")).toHaveClass("light");
});

test("portaled dialog and select inherit the dark theme", async ({ page }) => {
  await page.getByRole("radio", { name: "Mode gelap" }).click();
  await page.getByRole("button", { name: "Buka dialog" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("background-color", "rgb(48, 48, 54)");
  await expect(dialog).toHaveCSS("border-radius", "20px");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Buka dialog" })).toBeFocused();
  await page.getByRole("combobox", { name: "Access scope" }).click();
  await expect(page.getByRole("listbox")).toHaveCSS("background-color", "rgb(48, 48, 54)");
  await page.getByRole("option", { name: "Meeting rooms" }).click();
  await expect(page.getByRole("combobox", { name: "Access scope" })).toHaveText("Meeting rooms");
});

test("controls, tabs, and toast remain interactive", async ({ page }) => {
  const checkbox = page.getByRole("checkbox", { name: "Kirim notifikasi email" });
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();
  const control = page.getByRole("switch", { name: "Auto-renew credential" });
  await control.click();
  await expect(control).not.toBeChecked();
  await page.getByRole("radio", { name: "Guest", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Guest", exact: true })).toBeChecked();
  await expect(page.getByRole("progressbar", { name: "Provisioning" })).toHaveAttribute(
    "aria-valuenow",
    "64",
  );
  await page.getByRole("tab", { name: "Events", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toContainText("akses untuk acara");
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByText("Komponen siap digunakan.")).toBeVisible();
  await page.getByRole("button", { name: "Lihat semua komponen" }).click();
  await expect(page.locator("#library")).toContainText("sidebar");
  await expect(page.locator("#library")).toContainText("chart");
});
