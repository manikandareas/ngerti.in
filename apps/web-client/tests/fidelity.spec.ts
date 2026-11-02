import { expect, test } from "@playwright/test";

// Reference dimensions are from OpenMausBot 0.1.137 / 7124ebc4, not a snapshot of
// Ngertiin: ChatHeadPill, SidebarTiles, composer-simple, chat-bubble, bot-panel/rows.
for (const mode of ["light", "dark"] as const) {
  test(`${mode}: source messenger geometry, nested navigation and responsive surfaces`, async ({
    page,
  }, info) => {
    const mobile = info.project.name === "mobile";
    const errors: string[] = [];
    const settled = () =>
      page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished.catch(() => undefined)),
        ),
      );
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      ({ mode }) => localStorage.setItem("ngertiin-web-client-theme", mode),
      { mode },
    );
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
    await expect(page.locator(".chat-agent-bubble").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".header-identity")).toHaveCSS("height", "39px");
    await expect(page.locator(".header-identity")).toHaveCSS("border-radius", "999px");
    await expect(page.locator(".header-identity")).toHaveCSS("font-size", "14px");
    if (mobile) {
      for (const width of [320, 390, 767]) {
        await page.setViewportSize({ width, height: 844 });
        await expect
          .poll(async () => {
            const identity = await page.locator(".header-identity").boundingBox();
            return identity ? Math.abs(identity.x + identity.width / 2 - width / 2) : Infinity;
          })
          .toBeLessThanOrEqual(0.5);
        const navigation = await page
          .getByRole("button", { name: "Buka percakapan", exact: true })
          .boundingBox();
        const identity = await page.locator(".header-identity").boundingBox();
        const model = await page
          .getByRole("button", { name: "Pilih model", exact: true })
          .boundingBox();
        expect(
          navigation && identity && navigation.x + navigation.width <= identity.x,
        ).toBeTruthy();
        expect(model && identity && identity.x + identity.width <= model.x).toBeTruthy();
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    await expect(page.locator(".conversation-composer")).toHaveCSS("height", "44px");
    const bubble = page.locator('.chat-agent-bubble > [data-slot="bubble-content"]').first();
    await expect(bubble).toHaveCSS("font-size", "15px");
    await expect(bubble).toHaveCSS("line-height", "22px");
    await expect(bubble).toHaveCSS("border-radius", "18px");
    await expect(bubble).toHaveCSS("padding", "7px 12px");
    if (!mobile) {
      await expect(page.locator(".workspace-sidebar")).toHaveCSS("width", "280px");
      await expect(page.locator(".contact-row").first()).toHaveCSS("min-height", "60px");
      await expect(page.locator(".contact-row > .agent-avatar").first()).toHaveCSS("width", "44px");
    }
    await expect(page.locator(".workspace-main")).toHaveCSS(
      "background-color",
      mode === "light" ? "rgb(252, 252, 252)" : mobile ? "rgb(20, 20, 20)" : "rgb(18, 18, 18)",
    );
    await settled();
    await page.screenshot({ path: info.outputPath("conversation.png") });
    if (mobile) {
      await page.getByRole("button", { name: "Buka percakapan", exact: true }).click();
      await expect(page.locator(".contact-row > .agent-avatar").first()).toHaveCSS("width", "44px");
    }
    await expect(page.locator(".primary-contact")).toHaveCount(0);
    await page.getByRole("button", { name: "Buat baru", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create agent", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("button", { name: "Create group", exact: true })).toBeFocused();
    await settled();
    await page.screenshot({ path: info.outputPath("create-menu.png") });
    await page.keyboard.press("Escape");
    if (mobile)
      await page
        .getByRole("dialog", { name: "Percakapan", exact: true })
        .getByRole("button", { name: "Close", exact: true })
        .click();
    await page
      .getByRole("textbox", { name: "Pesan", exact: true })
      .fill("A first line\nA second line");
    await expect(page.locator(".conversation-composer")).toHaveAttribute("data-multiline", "true");
    if (!mobile)
      await expect(page.locator(".conversation-composer")).toHaveCSS("border-radius", "18px");
    await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("");
    await page.getByRole("button", { name: "Pilih model", exact: true }).click();
    await expect(page.locator("[data-model-picker-content]")).toHaveCSS(
      "border-radius",
      mode === "dark" ? (mobile ? "22px" : "12px") : "14px",
    );
    await settled();
    await page.screenshot({ path: info.outputPath("model-menu.png") });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Detail Tobi", exact: true }).click();
    await expect(page.locator(".context-hero h2")).toHaveCSS("font-size", "17px");
    await expect(page.locator(".context-hero > .agent-avatar")).toHaveCSS("width", "80px");
    await expect(page.locator('[data-panel-nav="Memory"]')).toHaveCSS(
      "height",
      // The first row includes the source Card's1px divider as well as icon+padding.
      mobile ? "55px" : "51px",
    );
    await settled();
    await page.screenshot({ path: info.outputPath("agent-panel.png") });
    await page.getByRole("button", { name: "Memory", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Memory", exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Detail", exact: true })).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: "Detail", exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBeTruthy();
    expect(errors).toEqual([]);
  });
}

test("source responsive roster and context transitions release modal focus at desktop width", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Buka percakapan", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Percakapan", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.getByRole("dialog", { name: "Percakapan", exact: true })).toBeHidden();
  await expect(page.locator(".workspace-sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Buka percakapan", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Detail Tobi", exact: true }).click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator(".workspace-sidebar")).toBeHidden();
  await expect(page.locator(".workspace-details")).toHaveCSS("width", "320px");
  await page.getByRole("button", { name: "Buka percakapan", exact: true }).click();
  const roster = page.getByRole("dialog", { name: "Percakapan", exact: true });
  await expect(roster).toHaveCSS("width", "280px");
  await roster.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tutup detail", exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
});
