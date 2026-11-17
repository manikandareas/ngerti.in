import { resolve } from "node:path";
import { expect, type Locator, test } from "@playwright/test";

const evidence = resolve(
  process.env.NGERTIIN_ACCOUNT_ENTRY_EVIDENCE ??
    "../../.dev/verification/button-gradient-2026-11-15",
);

// Measure actual computed gradient stops against the text, including alpha over the parent surface.
async function minimumContrast(button: Locator) {
  return button.evaluate((element) => {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) throw new Error("Color sampling requires Canvas2D.");
    function rgba(value: string) {
      context!.clearRect(0, 0, 1, 1);
      context!.fillStyle = value;
      context!.fillRect(0, 0, 1, 1);
      return Array.from(context!.getImageData(0, 0, 1, 1).data);
    }
    function over(front: number[], back: number[]) {
      return front
        .slice(0, 3)
        .map((value, index) => (value * front[3]) / 255 + back[index] * (1 - front[3] / 255));
    }
    function luminance(color: number[]) {
      return color
        .map((value) => {
          const srgb = value / 255;
          return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    }
    const style = getComputedStyle(element);
    let parent = element.parentElement;
    let backdrop = rgba(getComputedStyle(document.documentElement).backgroundColor);
    while (parent) {
      const color = rgba(getComputedStyle(parent).backgroundColor);
      if (color[3] === 255) {
        backdrop = color;
        break;
      }
      parent = parent.parentElement;
    }
    const base = over(rgba(style.backgroundColor), backdrop);
    const stops = style.backgroundImage.match(/(?:rgba?|color)\([^)]*\)|transparent/g) ?? [
      "transparent",
    ];
    return Math.min(
      ...stops.map((stop) => {
        const background = over(rgba(stop), base);
        const text = over(rgba(style.color), background);
        const [a, b] = [luminance(text), luminance(background)].sort((x, y) => y - x);
        return (a + 0.05) / (b + 0.05);
      }),
    );
  });
}

for (const theme of ["light", "dark"] as const) {
  test(`${theme}: shared button surfaces retain contrast, states and keyboard focus`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/design-system?component=button");
    await page
      .getByRole("radio", { name: theme === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    const preview = page.locator('[data-example="button"]');
    await expect(preview).toBeVisible();
    await preview.screenshot({ path: `${evidence}/${info.project.name}-buttons-${theme}.png` });
    for (const name of ["default", "secondary", "outline", "destructive"]) {
      const button = preview.getByRole("button", { name, exact: true });
      const bounds = await button.boundingBox();
      const normal = await button.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fill: style.backgroundColor,
          gradient: style.backgroundImage,
          shadow: style.boxShadow,
        };
      });
      expect(normal.gradient).toContain("linear-gradient");
      expect(
        await minimumContrast(button),
        `${theme}/${name} rest contrast`,
      ).toBeGreaterThanOrEqual(4.5);
      await button.hover();
      await expect
        .poll(() => button.evaluate((element) => getComputedStyle(element).backgroundColor))
        .not.toBe(normal.fill);
      expect(
        await minimumContrast(button),
        `${theme}/${name} hover contrast`,
      ).toBeGreaterThanOrEqual(4.5);
      await page.mouse.down();
      try {
        await expect
          .poll(() => button.evaluate((element) => getComputedStyle(element).backgroundImage))
          .not.toBe(normal.gradient);
        expect(
          await minimumContrast(button),
          `${theme}/${name} pressed contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      } finally {
        await page.mouse.up();
      }
      await page.mouse.move(0, 0);
      await page.keyboard.press("Tab");
      await button.focus();
      await expect(button).toBeFocused();
      expect(await button.evaluate((element) => element.matches(":focus-visible"))).toBe(true);
      expect(await button.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
        normal.shadow,
      );
      expect(await button.boundingBox()).toEqual(bounds);
    }
    for (const name of ["ghost", "link", "Disabled", "Loading"]) {
      const button = preview.getByRole("button", { name, exact: true });
      await expect(button).toHaveCSS("background-image", "none");
      if (name === "Disabled" || name === "Loading") {
        await expect(button).toBeDisabled();
        expect(
          await button.evaluate((element) => {
            const shadow = getComputedStyle(element).boxShadow;
            if (shadow === "none") return true;
            const colors = [...shadow.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)];
            return colors.length > 0 && colors.every((match) => Number(match[1]) === 0);
          }),
        ).toBe(true);
      }
    }
    expect(errors).toEqual([]);
  });
}
