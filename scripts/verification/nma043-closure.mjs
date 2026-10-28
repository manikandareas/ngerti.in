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
  await check("Steering supersedes active answer and publishes one new result", async () => {
    const before = await snapshot();
    await page
      .getByRole("textbox", { name: /Pesan untuk/ })
      .fill("Tulis 100 paragraf tentang perjalanan, tanpa alat eksternal.");
    await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
    await page.getByRole("button", { name: "Hentikan jawaban", exact: true }).last().waitFor();
    await page
      .getByRole("textbox", { name: /Pesan untuk/ })
      .fill("Ubah arahan: cukup jawab SIAP, jangan lanjutkan paragraf.");
    await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
    let state;
    const end = Date.now() + 90000;
    while (Date.now() < end) {
      state = await snapshot();
      const added = state.messages.filter(
        (m) => !before.messages.some((x) => x.message_id === m.message_id),
      );
      if (
        added.filter((m) => m.author_kind === "user").length === 2 &&
        !state.runs.some((r) => ["running", "queued", "recovering"].includes(r.status))
      )
        break;
      await page.waitForTimeout(1000);
    }
    const messages = state.messages.filter(
      (m) =>
        m.author_kind === "user" && !before.messages.some((x) => x.message_id === m.message_id),
    );
    assert.equal(messages.length, 2);
    assert.equal(state.runs.find((r) => r.run_id === messages[0].run_id).status, "cancelled");
    assert.equal(
      state.messages.filter((m) => m.author_kind === "agent" && m.run_id === messages[1].run_id)
        .length,
      1,
    );
    await page.screenshot({ path: `${out}/steering-real.png` });
  });
  const axe = await readFile("node_modules/axe-core/axe.min.js", "utf8");
  for (const theme of ["light", "dark"])
    for (const width of [1440, 390])
      await check(`Goal panel ${theme} ${width}: focus and accessibility`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        await page.getByRole("button", { name: /^Goals/ }).click();
        await page.getByRole("dialog").waitFor();
        const summaries = page.locator('section[aria-label="Progress goals"] > details > summary');
        for (let i = 0; i < (await summaries.count()); i++) await summaries.nth(i).click();
        await page.waitForTimeout(250);
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
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: `${out}/goals-${theme}-${width}.png` });
        await page.keyboard.press("Escape");
      });
} finally {
  await writeFile(`${out}/closure-results.json`, JSON.stringify(results, null, 2) + "\n");
  await browser.close();
}
if (results.failures.length) process.exitCode = 1;
