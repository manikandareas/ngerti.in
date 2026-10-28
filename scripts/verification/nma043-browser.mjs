// Authenticated local walkthrough. No API mocks; requires an isolated test account.
import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const out = "docs/verification/nma-043";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.NMA043_BROWSER,
});
const context = await browser.newContext({
  storageState: process.env.NMA043_STORAGE_STATE,
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const results = {
  checks: [],
  failures: [],
  limits: [
    "Local development, real authenticated API/provider. No production deployment or manual screen reader audit.",
  ],
};
async function check(name, fn) {
  try {
    await fn();
    results.checks.push(name);
    console.log("PASS", name);
  } catch (e) {
    results.failures.push({ name, error: String(e) });
    console.log("FAIL", name, String(e));
    await page.screenshot({ path: `${out}/failure-${results.failures.length}.png` });
  }
}
async function api(path, body) {
  return page.evaluate(
    async ({ path, body }) => {
      const token = await window.Clerk.session.getToken();
      const r = await fetch(`http://localhost:8000/api/agent-engine/v1${path}`, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: r.status, body: await r.json() };
    },
    { path, body },
  );
}
const snapshot = async () => {
  const r = await api(`/threads/${thread}/snapshot`);
  assert.equal(r.status, 200);
  return r.body;
};
let thread;
try {
  await page.goto("http://localhost:3000");
  await page.waitForURL("**/conversations/**");
  await page.getByRole("textbox", { name: /Pesan untuk/ }).waitFor();
  thread = page.url().split("/").at(-1);
  await check("Goals empty state, keyboard trap and focus return", async () => {
    const trigger = page.getByRole("button", { name: /^Goals/ });
    await trigger.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      assert(await dialog.evaluate((e) => e.contains(document.activeElement)));
    }
    await page.screenshot({ path: `${out}/goals-empty.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    assert(await trigger.evaluate((e) => e === document.activeElement));
  });
  await check("Existing options remain discoverable", async () => {
    await page.getByRole("button", { name: "Opsi percakapan", exact: true }).click();
    await page.getByText("Konteks percakapan", { exact: true }).click();
    await page.getByRole("button", { name: "Periksa konteks" }).waitFor();
    await page.getByRole("button", { name: "Ringkas konteks", exact: true }).waitFor();
    await page.getByRole("button", { name: "Mulai konteks baru", exact: true }).waitFor();
    await page.screenshot({ path: `${out}/session-options.png` });
    await page.keyboard.press("Escape");
  });
  const marker = `NMA043-${Date.now()}`;
  results.marker = marker;
  await check("Real provider send and two-tab durable transcript", async () => {
    const second = await context.newPage();
    await second.goto(page.url());
    await second.getByRole("textbox", { name: /Pesan untuk/ }).waitFor();
    await page
      .getByRole("textbox", { name: /Pesan untuk/ })
      .fill(
        `${marker}: Untuk verifikasi UI, jawab singkat dengan markdown: satu judul, dua bullet, dan satu code block Python print("hello"). Jangan gunakan alat eksternal.`,
      );
    await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
    await page.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("pre")).some((x) => x.textContent.includes("hello")),
      {},
      { timeout: 90000 },
    );
    await second.waitForFunction(
      () =>
        Array.from(document.querySelectorAll("pre")).some((x) => x.textContent.includes("hello")),
      {},
      { timeout: 45000 },
    );
    const state = await snapshot();
    const user = state.messages.filter(
      (m) => m.author_kind === "user" && m.content.includes(marker),
    );
    assert.equal(user.length, 1);
    assert.equal(
      state.messages.filter((m) => m.author_kind === "agent" && m.run_id === user[0].run_id).length,
      1,
    );
    results.replyRun = user[0].run_id;
    await second.close();
    await page.screenshot({ path: `${out}/conversation-real.png` });
  });
  await check("Offline reconnect and refresh do not duplicate publication", async () => {
    const before = await snapshot();
    await context.setOffline(true);
    await page.evaluate(() => dispatchEvent(new Event("offline")));
    await page
      .getByText(/Menyambungkan kembali/)
      .first()
      .waitFor();
    assert(await page.getByRole("button", { name: "Kirim pesan", exact: true }).isDisabled());
    await page.screenshot({ path: `${out}/offline.png` });
    await context.setOffline(false);
    await page.evaluate(() => dispatchEvent(new Event("online")));
    await page.getByText("Tersambung · Riwayat tersimpan", { exact: true }).waitFor();
    await page.reload();
    await page.getByRole("textbox", { name: /Pesan untuk/ }).waitFor();
    const after = await snapshot();
    assert.deepEqual(
      after.messages.map((m) => m.message_id),
      before.messages.map((m) => m.message_id),
    );
    assert.equal(new Set(after.messages.map((m) => m.message_id)).size, after.messages.length);
  });
  await check("Read watermark persists across reload", async () => {
    await page.waitForTimeout(1000);
    const response = await api("/conversations");
    assert.equal(response.status, 200);
    const row = response.body.items.find((x) => x.thread_id === thread);
    assert.equal(row.unread_count, "0");
    results.readSequence = row.last_read_sequence;
  });
  const axe = await readFile("node_modules/axe-core/axe.min.js", "utf8");
  for (const theme of ["light", "dark"])
    for (const width of [1440, 390, 320, 768])
      await check(`Conversation ${theme} ${width}: overflow and axe`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((theme) => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem("ngertiin-theme", theme);
        }, theme);
        await page.waitForTimeout(300);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.addScriptTag({ content: axe });
        const a = await page.evaluate(async () =>
          window.axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
        );
        assert.deepEqual(
          a.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          [],
        );
        await page.screenshot({ path: `${out}/conversation-${theme}-${width}.png` });
      });
  await check("Session inspect uses durable native context", async () => {
    await page.getByRole("button", { name: "Opsi percakapan", exact: true }).click();
    await page.getByText("Konteks percakapan", { exact: true }).click();
    await page.getByRole("button", { name: "Periksa konteks", exact: true }).click();
    await page.getByText(/Versi konteks:/).waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${out}/session-inspect.png` });
    await page.keyboard.press("Escape");
  });
} finally {
  await context.setOffline(false);
  await writeFile(`${out}/browser-results.json`, JSON.stringify(results, null, 2) + "\n");
  await browser.close();
}
if (results.failures.length) process.exitCode = 1;
