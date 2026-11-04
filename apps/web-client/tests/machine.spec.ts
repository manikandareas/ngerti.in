import { expect, test } from "@playwright/test";

test("shared desktop supports native viewing, takeover, handback and working files", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Detail Tobi", exact: true }).click();
  await page.getByRole("tab", { name: "Computer", exact: true }).click();
  await expect(page.getByRole("button", { name: "View desktop", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "View desktop", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Shared desktop", exact: true });
  const screen = page.frameLocator('iframe[title="Agent desktop"]');
  await expect(screen.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(page.getByRole("button", { name: "Return control", exact: true })).toBeVisible();
  await expect(screen.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await screen
    .locator("canvas")
    .first()
    .click({ position: { x: 110, y: 100 } });
  await page.screenshot({
    path: `../../docs/verification/shared-machine/ui-${testInfo.project.name}.png`,
  });
  await page.getByRole("button", { name: "Return control", exact: true }).click();
  await expect(page.getByRole("button", { name: "Take control", exact: true })).toBeVisible();
  expect((await (await page.request.get("/v1/machine")).json()).lease.holder).toBe("none");
  await page.getByRole("button", { name: "Reconnect view", exact: true }).click();
  await expect(screen.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Take control", exact: true }).click();
  await expect(page.getByRole("button", { name: "Return control", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect
    .poll(async () => (await (await page.request.get("/v1/machine")).json()).lease.holder)
    .toBe("none");
  await page.getByRole("tab", { name: "Library", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Working files", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "projects", exact: true }).click();
  await page.getByRole("button", { name: "desktop-check.txt", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByText("Shared desktop working file.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Parent folder", exact: true }).click();
  const status = await (await page.request.get("/v1/machine")).json();
  expect(status.state).toBe("ready");
  expect(errors).toEqual([]);
});
