import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("real private Cua media, human control and logout work through the web client", async ({
  page,
  request,
}, info) => {
  const control = "http://127.0.0.1:8320";
  await request.post(`${control}/reset`, { timeout: 60_000 });
  const warmed = await request.post(`${control}/warm-computer`, { timeout: 120_000 });
  expect(warmed.ok(), await warmed.text()).toBe(true);
  expect((await warmed.json()).ready).toBe(true);
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("alice@example.test");
  await page.getByLabel("Password", { exact: true }).fill("A-long-fixture-password-948!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Detail / }).click();
  await page.getByRole("tab", { name: "Computer", exact: true }).click();
  await expect(page.locator('[data-computer-live="true"]').first()).toBeVisible({
    timeout: 45_000,
  });
  await page.getByRole("button", { name: "View desktop", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Computer", exact: true });
  await dialog.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Return control", exact: true })).toBeVisible();
  await expect(dialog.locator('[data-computer-live="true"]')).toBeVisible({ timeout: 45_000 });
  const directory = resolve(
    process.env.NGERTIIN_ACCOUNT_SCREENSHOTS ?? "../../.dev/accounts-browser-screenshots",
  );
  mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, `${info.project.name}-native-computer.png`) });
  await dialog.getByRole("button", { name: "Return control", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Take control", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toBeHidden();
  const closePanel = page.locator("[data-panel-close]:visible");
  if (await closePanel.isVisible()) await closePanel.click();
  await page.getByRole("button", { name: "Pengaturan", exact: true }).click();
  await expect(page.getByRole("main", { name: "Pengaturan", exact: true })).toBeVisible();
  const mobile = page.getByRole("combobox", { name: "Menu pengaturan", exact: true });
  if (await mobile.isVisible()) await mobile.selectOption("account");
  else await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).first().click();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByTitle("Agent desktop", { exact: true })).toHaveCount(0);
});
