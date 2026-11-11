import { expect, type Locator, test } from "@playwright/test";

function metrics(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    let surface: Element | null = element;
    let background = "rgba(0, 0, 0, 0)";
    while (surface && background === "rgba(0, 0, 0, 0)") {
      background = getComputedStyle(surface).backgroundColor;
      surface = surface.parentElement;
    }
    return {
      background,
      color: style.color,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
      borderRadius: style.borderRadius,
      gap: style.gap,
      padding: style.padding,
      minHeight: style.minHeight,
      width: style.width,
    };
  });
}

test("Marketplace sidebar matches Settings and agent navigation across themes", async ({
  page,
}, info) => {
  const names = Array.from(
    { length: 14 },
    (_, index) => `Installed plugin ${index + 1} with a long descriptive name`,
  );
  await page.route("**/v1/apps/catalog*", (route) =>
    route.fulfill({
      json: {
        items: names.map((name, index) => ({ slug: `plugin-${index}`, name, connected: true })),
      },
    }),
  );
  await page.route("**/v1/apps/connections", (route) =>
    route.fulfill({
      json: names.map((_, index) => ({
        id: `connection-${index}`,
        toolkit: `plugin-${index}`,
        state: "active",
        grants: [],
      })),
    }),
  );
  const viewport =
    info.project.name === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 1000 };
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Detail Tobi", exact: true })).toBeVisible();
    const rail = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
    await rail.getByRole("button", { name: "Percakapan", exact: true }).click();
    const agents = page.getByRole("complementary", { name: "Daftar percakapan", exact: true });
    await expect(agents.locator('[data-thread-id][aria-current="page"]')).toBeVisible();
    const agentSurface = await metrics(agents);
    const agentSelected = await metrics(agents.locator('[data-thread-id][aria-current="page"]'));
    await page.mouse.move(0, 0);
    await page.screenshot({ path: info.outputPath(`agents-${theme}.png`), animations: "disabled" });

    await rail.getByRole("button", { name: "Pengaturan", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Umum", exact: true })).toBeVisible();
    const settings = page.locator(".settings-sidebar");
    const settingsSurface = await metrics(settings);
    const settingsRow = await metrics(settings.locator('[aria-current="page"]'));
    const settingsTitle = await metrics(settings.locator(".settings-sidebar-title"));
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: info.outputPath(`settings-${theme}.png`),
      animations: "disabled",
    });

    await rail.getByRole("button", { name: "Marketplace", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Plugins", exact: true })).toBeVisible();
    const sidebar = page.getByRole("complementary", { name: "Marketplace menu", exact: true });
    const navigation = sidebar.getByRole("navigation", {
      name: "Marketplace navigation",
      exact: true,
    });
    const marketplaceSurface = await metrics(sidebar);
    expect(marketplaceSurface.background).toBe(settingsSurface.background);
    expect(marketplaceSurface.background).toBe(agentSurface.background);
    if (info.project.name === "desktop") {
      const row = navigation.getByRole("button", { name: "Plugins", exact: true });
      const marketplaceRow = await metrics(row);
      expect(marketplaceSurface.width).toBe(settingsSurface.width);
      expect(marketplaceSurface.width).toBe(agentSurface.width);
      expect(marketplaceSurface.padding).toBe(settingsSurface.padding);
      expect(marketplaceSurface.gap).toBe(settingsSurface.gap);
      for (const key of [
        "background",
        "color",
        "fontSize",
        "lineHeight",
        "fontWeight",
        "borderRadius",
        "padding",
        "minHeight",
        "gap",
      ] as const)
        expect(marketplaceRow[key], key).toBe(settingsRow[key]);
      expect(marketplaceRow.background).toBe(agentSelected.background);
      const marketplaceTitle = await metrics(sidebar.locator(".marketplace-sidebar-heading"));
      for (const key of ["fontSize", "lineHeight", "fontWeight", "padding"] as const)
        expect(marketplaceTitle[key], key).toBe(settingsTitle[key]);
      const installed = sidebar.getByRole("navigation", { name: "Installed plugins", exact: true });
      await expect(installed.getByRole("button")).toHaveCount(names.length);
      await expect(installed.getByRole("button").last()).toHaveAttribute(
        "title",
        names.at(-1) ?? "",
      );
      await page.setViewportSize({ width: 1440, height: 460 });
      const headerTop = await navigation.evaluate((element) => element.getBoundingClientRect().top);
      await navigation.getByRole("button", { name: "Skills", exact: true }).focus();
      for (let index = 0; index < names.length; index++) await page.keyboard.press("Tab");
      await expect(installed.getByRole("button").last()).toBeFocused();
      expect(
        await installed.evaluate((element) => {
          const focused = element.querySelector<HTMLElement>(":focus-visible");
          if (!focused) return false;
          const viewport = element.getBoundingClientRect();
          const bounds = focused.getBoundingClientRect();
          const style = getComputedStyle(focused);
          const ring =
            Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
          return bounds.left - ring >= viewport.left && bounds.right + ring <= viewport.right;
        }),
      ).toBe(true);
      expect(await installed.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect(await navigation.evaluate((element) => element.getBoundingClientRect().top)).toBe(
        headerTop,
      );
      expect(
        await installed.evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      await page.setViewportSize(viewport);
    } else {
      await expect(sidebar.locator(".marketplace-sidebar-header")).toBeHidden();
      await expect(sidebar.locator(".marketplace-sidebar-available")).toBeHidden();
      for (const button of await navigation.getByRole("button").all())
        await expect(button).toHaveCSS("min-height", "44px");
    }
    await page.mouse.move(0, 0);
    await page.screenshot({
      path: info.outputPath(`marketplace-${theme}.png`),
      animations: "disabled",
    });
    await navigation.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Skills", exact: true })).toBeVisible();
    await expect(navigation.getByRole("button", { name: "Skills", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});
