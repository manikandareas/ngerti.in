import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { webkit } from "playwright";
import { expect } from "../../../../apps/web-client/node_modules/@playwright/test";
import { ComposioHost } from "../../../../apps/server/src/integrations/host";
import { developmentConfig } from "../../../../apps/server/src/config";

// Public live catalog metadata and URL logos; account state is fixture-controlled. No OAuth/inference.
const output = new URL("./", import.meta.url).pathname;
const host = new ComposioHost();
const owner = developmentConfig().owner_id;
const first = await host.catalog(owner, "");
const second = first.cursor ? await host.catalog(owner, "", first.cursor) : { items: [] };
const catalog = { items: [...first.items, ...second.items] };
const category = catalog.items.find((item) => item.categories?.length)?.categories?.[0].slug;
if (!category) throw new Error("Provider sample needs category metadata");
const state = mkdtempSync(join(tmpdir(), "ngertiin-marketplace-cache-"));
const env = { ...process.env, NGERTIIN_STATE_DIR: state, NGERTIIN_PORT: "8316", NGERTIIN_API_URL: "http://127.0.0.1:8316" };
const api = Bun.spawn(["bun", "scripts/verification/nma062/api-server.ts"], { env, stdout: "ignore", stderr: "ignore" });
const ui = Bun.spawn(["bun", "run", "preview", "--host", "127.0.0.1", "--port", "4316", "--strictPort"], { cwd: "apps/web-client", env, stdout: "ignore", stderr: "ignore" });
let browser: Awaited<ReturnType<typeof webkit.launch>> | undefined;
const report: unknown[] = [];
try {
  for (const url of ["http://127.0.0.1:8316/health/live", "http://127.0.0.1:4316"]) {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (await fetch(url).then((response) => response.ok).catch(() => false)) { ready = true; break; }
      await Bun.sleep(100);
    }
    if (!ready) throw new Error("Capture fixture did not start");
  }
  browser = await webkit.launch();
  for (const theme of ["light", "dark"] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: theme });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let reads = 0;
    let installed = false;
    await page.route("**/v1/apps/catalog*", (route) => { reads++; return route.fulfill({ json: catalog }); });
    await page.route("**/v1/apps/connections", (route) => route.fulfill({ json: installed ? [{ id: "visual-fixture", toolkit: catalog.items[0].slug, state: "active", grants: [] }] : [] }));
    await page.goto("http://127.0.0.1:4316/?marketplace=plugins");
    await expect(page.locator(".marketplace-entry").first()).toBeVisible();
    // Wait for the durable write, then prove fresh cache survives a new document without discovery.
    await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
      const opening = indexedDB.open("ngertiin-marketplace", 1);
      opening.onsuccess = () => {
        const db = opening.result;
        const read = db.transaction("catalog").objectStore("catalog").get("metadata-v1");
        read.onsuccess = () => { resolve(Boolean(read.result)); db.close(); };
      };
    }))).toBe(true);
    installed = true;
    await page.reload();
    await expect(page.locator(".marketplace-entry").filter({ hasText: catalog.items[0].name }).first()).toContainText("Installed");
    expect(reads).toBe(1);
    for (const screen of ["overview", "category"] as const) {
      if (screen === "category") {
        await page.goto(`http://127.0.0.1:4316/?marketplace=plugins&category=${encodeURIComponent(category)}`);
        await expect(page.locator(".marketplace-category-list .marketplace-entry").first()).toBeVisible();
      }
      for (const [viewport, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]] as const) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await expect.poll(() => page.locator(".marketplace-logo-skeleton").evaluateAll((icons) => icons.filter((icon) => {
          const box = icon.getBoundingClientRect();
          return box.top < innerHeight && box.bottom > 0;
        }).length), { timeout: 15_000 }).toBe(0);
        // Only above-fold images matter for this capture; offscreen groups stay deferred.
        await expect.poll(() => page.locator(".marketplace-entry img").evaluateAll((images) => images.filter((image) => {
          const box = image.getBoundingClientRect();
          return box.top < innerHeight && box.bottom > 0 && !(image as HTMLImageElement).complete;
        }).length), { timeout: 10_000 }).toBe(0);
        await page.screenshot({ path: `${output}/screenshots/webkit-${theme}-${viewport}-${screen}.png`, animations: "disabled" });
        const overflow = await page.locator(".marketplace-pane").evaluate((element) => element.scrollWidth > element.clientWidth);
        expect(overflow).toBe(false);
        report.push({ engine: "WebKit", theme, viewport, screen, provider_items: catalog.items.length, rendered_rows: await page.locator(".marketplace-entry").count(), catalog_reads_after_reload: reads, no_horizontal_overflow: !overflow, page_errors: [...errors] });
      }
    }
    expect(errors).toEqual([]);
    await context.close();
  }
} finally {
  await browser?.close();
  api.kill(); ui.kill();
  await Promise.all([api.exited, ui.exited]);
  rmSync(state, { recursive: true, force: true });
}
await Bun.write(`${output}/visual.json`, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report));
