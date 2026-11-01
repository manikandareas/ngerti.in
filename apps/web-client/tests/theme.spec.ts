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
  await page.goto("/theme-preview");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
});

for (const mode of ["light", "dark"] as const) {
  test(`${mode}: Midnight/Daylight colors, control sizes, and fonts`, async ({ page }) => {
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    await expect(page.locator("html")).toHaveClass(mode);
    await expect(page.locator("body")).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(252, 252, 252)" : "rgb(18, 18, 18)",
    );
    await expect(page.locator('[data-swatch="card"]')).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(240, 240, 240)" : "rgb(31, 31, 31)",
    );
    await expect(page.locator('[data-swatch="primary"]')).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(11, 98, 196)" : "rgb(16, 132, 254)",
    );
    await expect(page.locator("#email")).toHaveCSS("height", "32px");
    await expect(page.locator("#email")).toHaveCSS("border-radius", "8px");
    await expect(page.locator('[data-slot="card"]').first()).toHaveCSS("border-radius", "16px");
    await expect(page.locator("body")).toHaveCSS("font-family", /Geist Variable/);
    await expect(page.locator('[data-slot="code-block"]')).toHaveCSS(
      "background-color",
      "rgb(31, 31, 31)",
    );
    await expect(page.locator('[data-slot="code-block-content"]')).toHaveCSS(
      "font-family",
      /Geist Mono Variable/,
    );
    const contrast = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const probe = document.createElement("span");
      document.body.append(probe);
      function luminance(token: string) {
        probe.style.color = style.getPropertyValue(`--${token}`);
        const rgb = getComputedStyle(probe)
          .color.match(/[\d.]+/g)
          ?.slice(0, 3)
          .map(Number);
        if (rgb?.length !== 3) throw new Error(`Unresolved color ${token}`);
        const linear = rgb.map((v) => {
          const c = v / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
      }
      const pairs = [
        ["foreground", "background"],
        ["muted-foreground", "card"],
        ["text-tertiary", "panel"],
        ["primary-foreground", "primary"],
        ["destructive-foreground", "danger-action"],
        ["success-foreground", "success"],
        ["warning-foreground", "warning"],
      ];
      const ratios = pairs.map(([ink, surface]) => {
        const a = luminance(ink),
          b = luminance(surface);
        return {
          pair: `${ink}/${surface}`,
          ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        };
      });
      probe.remove();
      return ratios;
    });
    for (const pair of contrast)
      expect(pair.ratio, `${pair.pair} text contrast`).toBeGreaterThanOrEqual(4.5);
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
  await expect(dialog).toHaveCSS("background-color", "rgb(31, 31, 31)");
  await expect(dialog).toHaveCSS("border-radius", "12px");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Buka dialog" })).toBeFocused();
  await page.getByRole("combobox", { name: "Access scope" }).click();
  await expect(page.getByRole("listbox")).toHaveCSS("background-color", "rgb(31, 31, 31)");
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
