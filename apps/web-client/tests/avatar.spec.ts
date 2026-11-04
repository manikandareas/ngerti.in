import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/avatar-studio");
  await expect(page.getByRole("button", { name: "Sapa avatar" }).locator("svg")).toBeVisible();
});

test("edits recognizable shapes, colors and expressions with keyboard support", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.getByRole("radio")).toHaveCount(22);
  await expect(page.locator('input[name="avatar-shape"]')).toHaveCount(8);
  const oval = page.getByRole("radio", { name: "Oval", exact: true });
  await oval.check();
  await expect(page.locator(".studio-stage-caption")).toContainText("Oval");
  await oval.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Square", exact: true })).toBeChecked();
  await page.getByRole("radio", { name: "Orchid", exact: true }).check();
  await expect(page.locator(".studio-stage-caption")).toContainText("Orchid");
  await page.getByRole("button", { name: "Ekspresi", exact: true }).click();
  await page.getByRole("radio", { name: "Surprised", exact: true }).check();
  await page.reload();
  await expect(page.getByRole("radio", { name: "Square", exact: true })).toBeChecked();
  await expect(page.getByRole("radio", { name: "Orchid", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Ekspresi", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Surprised", exact: true })).toBeChecked();
  expect(errors).toEqual([]);
});

test("state, pointer setting and temporary reactions preserve identity", async ({ page }) => {
  const hero = page.locator(".studio-character .ngertiin-avatar");
  await page.getByLabel("State agent").selectOption("thinking");
  await expect(hero).toHaveAttribute("data-avatar-state", "thinking");
  await page.getByRole("checkbox", { name: "Ikuti kursor" }).uncheck();
  await expect(hero).toHaveAttribute("data-avatar-state", "thinking");
  await expect(page.locator(".studio-stage-caption")).toContainText("Circle");
  await page.getByRole("button", { name: "Sapa avatar" }).click();
  await expect(hero).toHaveAttribute("data-avatar-action", "boop");
  await expect(hero).not.toHaveAttribute("data-avatar-action", "boop", { timeout: 2500 });
  await page.getByRole("button", { name: "Gerak", exact: true }).click();
  for (const [label, action] of [
    ["Menyapa", "wave"],
    ["Melompat", "hop"],
    ["Bergoyang", "wiggle"],
    ["Berputar", "spin"],
    ["Mengedip", "wink"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(hero).toHaveAttribute("data-avatar-action", action);
  }
  await page.getByRole("button", { name: "Sapa avatar" }).scrollIntoViewIfNeeded();
  await expect(hero).not.toHaveAttribute("data-avatar-action", "wink", { timeout: 2500 });
});

test("gaze follows a fine pointer and returns to small idle glances when disabled", async ({
  page,
}) => {
  const avatar = page.getByRole("button", { name: "Sapa avatar" });
  await avatar.scrollIntoViewIfNeeded();
  const gaze = avatar.locator("[data-avatar-gaze]");
  const initial = await gaze.getAttribute("transform");
  await page.mouse.move(5, 5);
  if (await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)) {
    await expect.poll(() => gaze.getAttribute("transform")).not.toBe(initial);
  } else {
    expect(
      await gaze.evaluate((element) =>
        Math.abs((element as SVGGElement).transform.baseVal.consolidate()?.matrix.e ?? 0),
      ),
    ).toBeLessThanOrEqual(4.5);
  }
  await page.getByRole("checkbox", { name: "Ikuti kursor" }).uncheck();
  await avatar.scrollIntoViewIfNeeded();
  await page.mouse.move(100, 100);
  await expect
    .poll(() =>
      gaze.evaluate((element) =>
        Math.abs((element as SVGGElement).transform.baseVal.consolidate()?.matrix.e ?? 0),
      ),
    )
    .toBeLessThanOrEqual(4.5);
});

test("PNG/SVG exports are transparent 512px portraits and recipes round trip", async ({ page }) => {
  const svgDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "SVG", exact: true }).click();
  const svgPath = await (await svgDownload).path();
  if (!svgPath) throw new Error("SVG download missing.");
  const svg = await readFile(svgPath, "utf8");
  expect(svg).toContain('width="512" height="512"');
  expect(svg).not.toContain("data-avatar-shadow");
  expect(svg).not.toContain("-blush");
  expect(svg).toContain("-sheen");
  expect(svg).toContain('href="data:image/png;base64,');
  expect(svg).toContain("data-avatar-eye");
  const pngDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Unduh PNG", exact: true }).click();
  const pngPath = await (await pngDownload).path();
  if (!pngPath) throw new Error("PNG download missing.");
  const png = await readFile(pngPath);
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  const image = await page.evaluate(async (data) => {
    const bitmap = new Image();
    bitmap.src = `data:image/png;base64,${data}`;
    await bitmap.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas missing.");
    context.drawImage(bitmap, 0, 0);
    return {
      width: bitmap.width,
      height: bitmap.height,
      corner: context.getImageData(0, 0, 1, 1).data[3],
      center: context.getImageData(256, 256, 1, 1).data[3],
    };
  }, png.toString("base64"));
  expect(image).toEqual({ width: 512, height: 512, corner: 0, center: 255 });
  const recipeDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Simpan resep", exact: true }).click();
  const recipePath = await (await recipeDownload).path();
  if (!recipePath) throw new Error("Recipe download missing.");
  const recipe = await readFile(recipePath);
  await page.getByRole("button", { name: "Acak karakter", exact: true }).click();
  await page
    .getByLabel("File resep karakter")
    .setInputFiles({ name: "avatar.json", mimeType: "application/json", buffer: recipe });
  await expect(page.locator(".studio-stage-caption")).toHaveText("Circle·Lilac");
  await page.getByLabel("File resep karakter").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(
    page.getByText("File karakter tidak valid. Gunakan resep avatar versi 1."),
  ).toBeVisible();
  await expect(page.locator(".studio-stage-caption")).toHaveText("Circle·Lilac");
});

test("reduced motion freezes poses but keeps state and editor functional", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByLabel("State agent").selectOption("celebrating");
  const body = page.locator(".studio-character [data-avatar-body]");
  const pose = await body.getAttribute("transform");
  await page.getByRole("button", { name: "Sapa avatar" }).click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  expect(await body.getAttribute("transform")).toBe(pose);
  await expect(page.locator(".studio-character .ngertiin-avatar")).not.toHaveAttribute(
    "data-avatar-action",
  );
  await page.getByRole("radio", { name: "Hexagon", exact: true }).check();
  await expect(page.locator(".studio-stage-caption")).toContainText("Hexagon");
});

test("animation suspends offscreen and resumes when the avatar returns", async ({ page }) => {
  await page.setViewportSize({ width: page.viewportSize()?.width ?? 1440, height: 400 });
  const body = page.locator(".studio-character [data-avatar-body]");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const paused = await body.getAttribute("transform");
  await page.waitForTimeout(250);
  expect(await body.getAttribute("transform")).toBe(paused);
  await page.getByRole("button", { name: "Sapa avatar" }).scrollIntoViewIfNeeded();
  await expect.poll(() => body.getAttribute("transform")).not.toBe(paused);
});

test("responsive light/dark layouts have no overflow or accessibility violations", async ({
  page,
}, info) => {
  const axe = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
  await page.addScriptTag({ path: axe });
  for (const theme of ["light", "dark"] as const) {
    if (theme === "dark") await page.getByRole("button", { name: "Gunakan tema gelap" }).click();
    const violations = await page.evaluate(async () => {
      const engine = (
        window as unknown as {
          axe: {
            run(context: string): Promise<{ violations: Array<{ id: string; nodes: unknown[] }> }>;
          };
        }
      ).axe;
      return (await engine.run(".avatar-studio")).violations.map((item) => ({
        id: item.id,
        count: item.nodes.length,
      }));
    });
    expect(violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`${theme}.png`), fullPage: true });
  }
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const swatches = page.locator(".studio-swatches");
    expect(await swatches.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
  }
});

test("fur expressions stay distinct and reuse the body texture", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const hero = page.locator(".studio-character");
  const texture = hero.locator("[data-avatar-surface] image");
  await expect(texture).toHaveAttribute("href", /^data:image\/png/);
  const original = await texture.getAttribute("href");
  await page.getByRole("button", { name: "Ekspresi", exact: true }).click();
  const expressions = new Set<string>();
  for (const face of [
    "Happy",
    "Curious",
    "Calm",
    "Excited",
    "Shy",
    "Surprised",
    "Sleepy",
    "Focused",
  ]) {
    await page.getByRole("radio", { name: face, exact: true }).check();
    expressions.add(await hero.locator("[data-avatar-gaze]").innerHTML());
    expect(await texture.getAttribute("href")).toBe(original);
    expect(await hero.locator("path").count()).toBeLessThan(12);
  }
  expect(expressions.size).toBe(8);
  await page.getByLabel("State agent").selectOption("sleeping");
  expect(await texture.getAttribute("href")).toBe(original);
  await page.getByRole("radio", { name: "Mint", exact: true }).check();
  await page.getByRole("radio", { name: "Sky", exact: true }).check();
  await expect.poll(() => texture.getAttribute("href")).not.toBe(original);
});

test("active fur animation updates on each display frame", async ({ page }) => {
  // Continuous motion must stay display-synchronized; identical idle poses need no DOM writes.
  await page.getByLabel("State agent").selectOption("working");
  const hero = page.locator(".studio-character");
  await hero.scrollIntoViewIfNeeded();
  await expect(hero.locator("[data-avatar-surface] image")).toBeVisible();
  const ratio = await hero.evaluate(
    (element) =>
      new Promise<number>((resolve) => {
        let changes = 0;
        let frames = 0;
        const observer = new MutationObserver((records) => {
          changes += records.filter((record) =>
            (record.target as Element).hasAttribute("data-avatar-body"),
          ).length;
        });
        observer.observe(element, {
          subtree: true,
          attributes: true,
          attributeFilter: ["transform"],
        });
        function frame() {
          if (++frames < 40) {
            requestAnimationFrame(frame);
          } else {
            observer.disconnect();
            resolve(changes / frames);
          }
        }
        requestAnimationFrame(frame);
      }),
  );
  expect(ratio).toBeGreaterThan(0.85);
});
