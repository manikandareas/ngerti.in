import { mkdir, writeFile } from "node:fs/promises";
import { expect, webkit } from "@playwright/test";

const origin = process.argv[2];
if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))
  throw new Error("Provide the isolated local application origin as the first argument.");
const output = process.argv[3] ?? "docs/verification/settings-screen-2026-11-11";
await mkdir(`${output}/screenshots`, { recursive: true });
const browser = await webkit.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const checks: string[] = [];
try {
  await page.goto(`${origin}/?settings=general`);
  const rail = page.getByRole("navigation", { name: "Navigasi utama", exact: true });
  const conversation = rail.getByRole("button", { name: "Percakapan", exact: true });
  const settings = rail.getByRole("button", { name: "Pengaturan", exact: true });
  await expect(page.getByRole("heading", { name: "Umum", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".settings-nav-item")).toHaveCount(9);
  await expect(rail).toHaveCSS("width", "56px");
  await expect(settings.locator("svg")).toHaveCSS("width", "20px");
  await expect(page.locator(".application-body")).toHaveCSS("border-left-width", "0px");
  await expect(page.locator(".settings-sidebar-title")).toHaveCSS("font-size", "18px");
  checks.push("Persistent compact borderless rail and Settings heading geometry in WebKit");
  await page.getByRole("link", { name: "Tampilan", exact: true }).click();
  for (const mode of ["Terang", "Gelap"]) {
    await page.getByRole("radio", { name: mode, exact: true }).check();
    await page.screenshot({
      path: `${output}/screenshots/rail-desktop-settings-${mode === "Terang" ? "light" : "dark"}.png`,
    });
  }
  await page
    .getByRole("combobox", { name: "Ukuran teks percakapan", exact: true })
    .selectOption("large");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Ukuran teks percakapan", exact: true }),
  ).toHaveValue("large");
  checks.push("Device preference survives reload at the application origin");
  for (const section of [
    "Umum",
    "Percakapan",
    "Aksesibilitas",
    "Providers",
    "Data & privasi",
    "Pintasan keyboard",
    "Tentang",
  ]) {
    await page
      .getByRole("navigation", { name: "Menu pengaturan", exact: true })
      .getByRole("link", { name: section, exact: true })
      .click();
    await expect(
      page
        .getByRole("main", { name: "Pengaturan", exact: true })
        .getByRole("heading", { name: section, exact: true }),
    ).toBeVisible();
  }
  checks.push("All eight Settings sections navigate in WebKit");
  await page.getByRole("link", { name: "Data & privasi", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "Ekspor percakapan", exact: true }).click();
  const download = await pending;
  const stream = await download.createReadStream();
  if (!stream) throw new Error("The export stream is unavailable.");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(JSON.parse(Buffer.concat(chunks).toString("utf8")).messages.length).toBeGreaterThan(0);
  checks.push("Public JSON export downloads in WebKit");
  await conversation.click();
  await expect(page.getByRole("main", { name: "Percakapan aktif", exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/screenshots/rail-desktop-conversation-dark.png` });
  const composer = page.getByRole("textbox", { name: "Pesan", exact: true });
  await composer.fill("Continue from this draft.");
  await settings.click();
  await conversation.click();
  await expect(composer).toHaveText("Continue from this draft.");
  // The reload above creates a new document; subsequent screen switches keep its rail mounted.
  const currentRail = await rail.elementHandle();
  await settings.click();
  await page.getByRole("link", { name: "Tampilan", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Ukuran teks percakapan", exact: true })
    .selectOption("default");
  checks.push("Switching screens retains the draft and rail after document reload");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rail).toHaveCSS("width", "48px");
  await page.screenshot({ path: `${output}/screenshots/rail-mobile-settings-dark.png` });
  await conversation.click();
  await conversation.click();
  await expect(
    page.getByRole("complementary", { name: "Daftar percakapan", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Percakapan", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${output}/screenshots/rail-mobile-agents-dark.png` });
  await page.locator('#workspace-navigation [data-thread-id][aria-current="page"]').click();
  await expect(composer).toHaveText("Continue from this draft.");
  await composer.fill("");
  await page.screenshot({ path: `${output}/screenshots/rail-mobile-conversation-dark.png` });
  checks.push("Inline mobile agent list retains the rail and returns to the selected chat");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await currentRail?.evaluate((element) => element.isConnected)).toBe(true);
  expect(errors).toEqual([]);
  checks.push("No mobile horizontal overflow or WebKit runtime exceptions");
  await writeFile(
    `${output}/webkit-rail.json`,
    JSON.stringify(
      {
        scope:
          "Browser WebKit over the isolated local application origin; native window automation unavailable",
        checks,
        pass: checks.length,
        fail: 0,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ pass: checks.length, fail: 0 }));
} finally {
  await browser.close();
}
