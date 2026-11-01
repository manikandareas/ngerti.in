import { expect, type Locator, test } from "@playwright/test";

test.use({ hasTouch: false, isMobile: false });

async function samplePaint(control: Locator, interact: () => Promise<void>) {
  const recording = control.evaluate(async (element) => {
    const frames = [];
    const end = performance.now() + 300;
    do {
      await new Promise(requestAnimationFrame);
      const style = getComputedStyle(element);
      frames.push({ image: style.backgroundImage, color: style.backgroundColor });
    } while (performance.now() < end);
    return frames;
  });
  await interact();
  return recording;
}

for (const mode of ["light", "dark"] as const) {
  const fill = mode === "light" ? "rgb(11, 98, 196)" : "rgb(16, 132, 254)";
  const hover = mode === "light" ? "rgb(9, 87, 175)" : "rgb(55, 153, 255)";
  const pressed = mode === "light" ? "rgb(8, 75, 152)" : "rgb(101, 177, 255)";

  test(`${mode}: solid primary stays opaque throughout hover transitions`, async ({ page }) => {
    await page.goto("/design-system?component=button");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    const button = page
      .locator('[data-example="button"]')
      .getByRole("button", { name: "default", exact: true });
    await button.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(button).toHaveCSS("background-color", fill);
    for (let cycle = 0; cycle < 2; cycle++) {
      const entering = await samplePaint(button, () => button.hover());
      await expect(button).toHaveCSS("background-color", hover);
      const leaving = await samplePaint(button, () => page.mouse.move(0, 0));
      await expect(button).toHaveCSS("background-color", fill);
      for (const frame of [...entering, ...leaving]) {
        expect(frame.color, "Primary fill stays opaque").toMatch(/^rgb\(/);
        expect(frame.image, "Primary uses a solid fill").toBe("none");
      }
    }
  });

  test(`${mode}: shared primary preserves press and disabled states`, async ({ page }) => {
    await page.goto("/design-system?component=button");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    const example = page.locator('[data-example="button"]');
    const primary = example.getByRole("button", { name: "default", exact: true });
    await primary.hover();
    await expect(primary).toHaveCSS("background-color", hover);
    await page.mouse.down();
    await expect(primary).toHaveCSS("background-color", pressed);
    await page.mouse.up();
    const disabled = example.getByRole("button", { name: "Disabled", exact: true });
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveCSS("background-image", "none");
    await expect(disabled).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(235, 235, 235)" : "rgb(40, 40, 40)",
    );
    for (const component of ["button-group", "dialog", "questionnaire"] as const) {
      await page.goto(`/design-system?component=${component}`);
      const action = page.locator(`[data-example="${component}"] [data-variant="default"]`).first();
      await action.scrollIntoViewIfNeeded();
      const frames = await samplePaint(action, () => action.hover());
      expect(
        frames.every((frame) => frame.color.startsWith("rgb(") && frame.image === "none"),
      ).toBe(true);
    }
  });
}
