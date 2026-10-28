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
  await page.goto("http://localhost:3000/agents");
  await page.getByRole("button", { name: "Siapkan percakapan" }).waitFor();
  await check("Create a scoped two-agent conversation", async () => {
    await page.getByRole("button", { name: "Siapkan percakapan" }).click();
    await page.getByRole("combobox", { name: "Jenis" }).selectOption("group");
    await page.getByRole("checkbox").nth(0).check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page.getByLabel("Nama percakapan").fill("NMA043 Collaboration");
    await page.getByRole("button", { name: "Buat percakapan", exact: true }).click();
    await page.waitForURL("**/conversations/**");
    await page.getByRole("textbox", { name: /Pesan untuk/ }).waitFor();
    thread = page.url().split("/").at(-1);
    results.thread = thread;
    assert.equal((await snapshot()).messages.length, 0);
    await page.screenshot({ path: `${out}/group-empty.png` });
  });
  await check("Mentions and real multi-author group replies", async () => {
    const state = await snapshot();
    assert.equal(state.thread.agents.length, 2);
    const handles = state.thread.agents.map((a) => a.handle);
    await page.getByRole("button", { name: handles[0], exact: true }).click();
    assert(
      (await page.getByRole("textbox", { name: /Pesan untuk/ }).inputValue()).includes(
        "@" + handles[0],
      ),
    );
    await page
      .getByRole("textbox", { name: /Pesan untuk/ })
      .fill(
        `@${handles[0]} @${handles[1]} Masing-masing jawab satu kalimat saran perjalanan santai Bandung. Ini verifikasi percakapan grup; jangan gunakan alat eksternal dan jangan membuat goal baru.`,
      );
    await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
    const end = Date.now() + 120000;
    let current;
    while (Date.now() < end) {
      current = await snapshot();
      if (
        new Set(
          current.messages.filter((m) => m.author_kind === "agent").map((m) => m.author_agent_id),
        ).size >= 2 &&
        !current.runs.some((r) => ["queued", "running", "recovering"].includes(r.status))
      )
        break;
      await page.waitForTimeout(1000);
    }
    assert(
      new Set(
        current.messages.filter((m) => m.author_kind === "agent").map((m) => m.author_agent_id),
      ).size >= 2,
    );
    assert(!current.messages.some((m) => m.content.includes("NMA043-1793198409956")));
    results.authors = current.messages
      .filter((m) => m.author_kind === "agent")
      .map((m) => m.author_agent_id);
    await page.screenshot({ path: `${out}/group-real.png` });
  });
  for (const theme of ["light", "dark"])
    for (const width of [1440, 390])
      await check(`Group ${theme} ${width}`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
        await page.waitForTimeout(250);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: `${out}/group-${theme}-${width}.png` });
      });
} finally {
  await writeFile(`${out}/group-results.json`, JSON.stringify(results, null, 2) + "\n");
  await browser.close();
}
if (results.failures.length) process.exitCode = 1;
