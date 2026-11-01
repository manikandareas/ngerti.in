import { expect, type Locator, test } from "@playwright/test";

// Exercise mouse hover at both configured viewport sizes, including the compact layout.
test.use({ hasTouch: false, isMobile: false });

async function samplePaint(control: Locator, interact: () => Promise<void>) {
  const recording = control.evaluate(async (element) => {
    const frames = [];
    const end = performance.now() + 350;
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
  test(`${mode}: primary hover never exposes a transparent frame`, async ({ page }) => {
    await page.goto("/design-system?component=button");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    const button = page.locator('[data-example="button"]').getByRole("button", {
      name: "default",
      exact: true,
    });
    await button.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    await expect(button).toHaveCSS("background-color", "rgb(40, 93, 245)");

    for (let cycle = 0; cycle < 3; cycle++) {
      const entering = await samplePaint(button, () => button.hover());
      const leaving = await samplePaint(button, () => page.mouse.move(0, 0));
      for (const frame of [...entering, ...leaving]) {
        expect(frame.color, "The primary fill stays opaque throughout hover").toBe(
          "rgb(40, 93, 245)",
        );
        expect(frame.image, "The gradient must not disappear between hover frames").toContain(
          "linear-gradient",
        );
      }
      expect(new Set(entering.map((frame) => frame.image)).size).toBeGreaterThan(2);
      expect(new Set(leaving.map((frame) => frame.image)).size).toBeGreaterThan(2);
    }
  });

  test(`${mode}: shared primary actions preserve hover, press, and disabled states`, async ({
    page,
  }) => {
    await page.goto("/design-system?component=button");
    await page
      .getByRole("radio", { name: mode === "light" ? "Mode terang" : "Mode gelap" })
      .click();
    const example = page.locator('[data-example="button"]');
    const primary = example.getByRole("button", { name: "default", exact: true });
    await primary.hover();
    await expect(primary).toHaveCSS("--tw-gradient-from", "rgb(40, 90, 232)");
    await expect(primary).toHaveCSS("--tw-gradient-to", "rgb(40, 90, 232)");
    await page.mouse.down();
    await expect(primary).toHaveCSS("--tw-gradient-from", "rgb(38, 88, 233)");
    await expect(primary).toHaveCSS("--tw-gradient-to", "rgb(38, 88, 233)");
    await page.mouse.up();
    const disabled = example.getByRole("button", { name: "Disabled", exact: true });
    await expect(disabled).toBeDisabled();
    await expect(disabled).toHaveCSS("background-image", "none");
    await expect(disabled).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(238, 238, 240)" : "rgb(48, 48, 54)",
    );

    for (const component of ["button-group", "dialog", "questionnaire"] as const) {
      await page.goto(`/design-system?component=${component}`);
      const action = page.locator(`[data-example="${component}"] [data-variant="default"]`).first();
      await action.scrollIntoViewIfNeeded();
      const frames = await samplePaint(action, () => action.hover());
      expect(frames.every((frame) => frame.color === "rgb(40, 93, 245)")).toBe(true);
      expect(frames.every((frame) => frame.image.includes("linear-gradient"))).toBe(true);
    }
  });
}
