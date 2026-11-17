import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const evidence = resolve(
  process.env.NGERTIIN_ACCOUNT_ENTRY_EVIDENCE ??
    "../../.dev/verification/sign-in-redesign-2026-11-15",
);
const require = createRequire(import.meta.url);
const errors = new WeakMap<object, string[]>();

// Presentation fixtures only. Real account/session journeys use the existing PostgreSQL suite.
test.beforeEach(async ({ page }) => {
  const failures: string[] = [];
  errors.set(page, failures);
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route("**/v1/**", (route) =>
    route.request().url().endsWith("/v1/auth/native")
      ? route.fulfill({ json: { audience: "https://workspace.example.test" } })
      : route.fulfill({ status: 401, json: { error: { code: "UNAUTHORIZED" } } }),
  );
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test("responsive light and dark forms remain usable and accessible", async ({ page }, info) => {
  for (const [width, height, theme] of [
    [1440, 900, "light"],
    [1440, 900, "dark"],
    [1024, 768, "light"],
    [390, 844, "light"],
    [390, 844, "dark"],
    [320, 640, "dark"],
    [768, 1024, "light"],
    [900, 500, "light"],
    [2560, 1440, "light"],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Sign in", exact: true })).toBeVisible();
    if (width >= 900) await expect(page.locator(".account-artwork video")).toBeVisible();
    else await expect(page.locator(".account-artwork")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const name of ["Email", "Password"]) {
      const bounds = await page.getByLabel(name, { exact: true }).boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(width < 900 ? 44 : 36);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    }
    await page.screenshot({
      path: `${evidence}/${info.project.name}-${theme}-${width}.png`,
      fullPage: true,
    });
    if (width === 1440 || width === 390) {
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const violations = await page.evaluate(async () => {
        const axe = (
          window as unknown as { axe: { run(): Promise<{ violations: { id: string }[] }> } }
        ).axe;
        return (await axe.run()).violations.map((item) => item.id);
      });
      expect(violations).toEqual([]);
    }
  }
});

test("registration, sign-in errors and password recovery retain their actions", async ({
  page,
}, info) => {
  async function actionGap(primary: string, secondary: string) {
    const top = await page.getByRole("button", { name: primary, exact: true }).boundingBox();
    const bottom = await page.getByRole("button", { name: secondary, exact: true }).boundingBox();
    expect(bottom!.y - top!.y - top!.height).toBe(12);
    expect(bottom!.width).toBe(top!.width);
  }
  await page.route("**/api/auth/**", (route) =>
    route.request().url().includes("/sign-in/email")
      ? route.fulfill({ status: 401, json: { error: { code: "AUTHENTICATION_FAILED" } } })
      : route.fulfill({ json: { success: true } }),
  );
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toHaveAttribute(
    "data-variant",
    "secondary",
  );
  await actionGap("Sign in", "Create account");
  await page.getByLabel("Email", { exact: true }).fill("person@example.test");
  await page.getByLabel("Password", { exact: true }).fill("Incorrect-fixture-password-12!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Check your email and password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toHaveAttribute(
    "data-variant",
    "default",
  );
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveAttribute(
    "data-variant",
    "secondary",
  );
  await actionGap("Create account", "Sign in");
  await page.screenshot({ path: `${evidence}/${info.project.name}-signup.png`, fullPage: true });
  await page.getByLabel("Name", { exact: true }).fill("Fixture Person");
  await page.getByLabel("Password", { exact: true }).fill("Fixture-new-password-948!");
  const registration = page.waitForRequest("**/api/auth/sign-up/email");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  expect((await registration).postDataJSON()).toMatchObject({
    name: "Fixture Person",
    email: "person@example.test",
  });
  await expect(page.getByRole("status")).toContainText("Check your email");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("reset link");
  await page.goto("/reset-password");
  await expect(page.getByRole("button", { name: "Save password" })).toBeDisabled();
  await page.goto("/reset-password?token=fixture-token");
  await page.getByLabel("New password").fill("Fixture-reset-password-948!");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toContainText("Password updated");
});

test("artwork pauses for reduced motion and hidden documents", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/sign-in");
  const video = page.locator(".account-artwork video");
  await expect(video).toBeVisible();
  const time = () => video.evaluate((element: HTMLVideoElement) => element.currentTime);
  const paused = () => video.evaluate((element: HTMLVideoElement) => element.paused);
  await expect.poll(paused).toBe(true);
  const still = await time();
  await page.waitForTimeout(350);
  expect(await time()).toBe(still);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(paused).toBe(false);
  await expect.poll(time).toBeGreaterThan(0.15);
  // Simulated visibility lifecycle, without moving or hiding a real user window.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(paused).toBe(true);
  const hidden = await time();
  await page.waitForTimeout(350);
  expect(await time()).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(paused).toBe(false);
  await expect.poll(time).not.toBe(hidden);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(paused).toBe(true);
});

test("desktop browser handoff keeps waiting, cancel and retry usable", async ({ page }, info) => {
  await page.addInitScript(() => {
    let cancel = () => {};
    Object.defineProperty(window, "ngertiinDesktop", {
      value: {
        remote: true,
        signIn: () =>
          new Promise<void>((_resolve, reject) => {
            cancel = () => reject(new DOMException("Cancelled", "AbortError"));
          }),
        cancelSignIn: async () => cancel(),
      },
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
  await expect(page.getByText("https://workspace.example.test", { exact: true })).toHaveCount(0);
  await expect(page.locator(".account-artwork video")).toBeVisible();
  await page.screenshot({ path: `${evidence}/${info.project.name}-desktop-handoff.png` });
  await page.getByRole("button", { name: "Sign in with browser" }).click();
  await expect(page.getByRole("button", { name: "Waiting for browser…" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Finish signing in");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in with browser" })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("sign-in and the poster remain available if the video fails", async ({ page }) => {
  await page.route("**/vignette-bloom-office.mp4", (route) => route.abort());
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.locator(".account-artwork video")).toHaveAttribute(
    "poster",
    "/images/sign-in/vignette-bloom-office.webp",
  );
  expect(
    await page
      .locator(".account-artwork")
      .evaluate((element) => getComputedStyle(element).backgroundImage),
  ).toContain("vignette-bloom-office.webp");
});
