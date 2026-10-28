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

async function sendText(text) {
  const before = (await snapshot()).messages;
  await page.getByRole("textbox", { name: /Pesan untuk/ }).fill(text);
  await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
  const until = Date.now() + 90000;
  let state;
  while (Date.now() < until) {
    state = await snapshot();
    const sent = state.messages.find(
      (m) => m.author_kind === "user" && !before.some((b) => b.message_id === m.message_id),
    );
    const run = sent && state.runs.find((r) => r.run_id === sent.run_id);
    if (run && !["queued", "running", "recovering"].includes(run.status)) {
      assert.equal(run.status, "succeeded", JSON.stringify(run));
      return state;
    }
    await page.waitForTimeout(1000);
  }
  throw Error("Provider did not settle");
}

try {
  await page.goto("http://localhost:3000");
  await page.waitForURL("**/conversations/**");
  await page.getByRole("textbox", { name: /Pesan untuk/ }).waitFor();
  thread = page.url().split("/").at(-1);
  await check("Create schedule through chat with explicit timezone", async () => {
    const state = await sendText(
      "Buat goal pengingat NMA043 Jadwal: ingatkan aku memeriksa itinerary pada 1 Januari 2099 pukul 08:00 Asia/Makassar, hanya sekali. Jangan kerjakan sekarang dan jangan gunakan aplikasi eksternal. Simpan jadwal otomatis untuk goal ini.",
    );
    const goal = state.goals.find((g) => g.wake?.configuration.timezone === "Asia/Makassar");
    assert(goal);
    results.schedule = goal.goal_id;
    await page.getByRole("button", { name: /^Goals/ }).click();
    const section = page.getByRole("region", { name: "Progress goals" });
    await section.locator("summary").filter({ hasText: goal.title }).click();
    await page.getByText("Jadwal pekerjaan", { exact: true }).waitFor();
    await page.screenshot({ path: `${out}/schedule-real.png` });
    await page.keyboard.press("Escape");
  });
  await check("Pause future schedule through chat", async () => {
    const state = await sendText("Jeda goal NMA043 Jadwal pengingat tahun 2099 yang baru dibuat.");
    assert(state.goals.some((g) => g.goal_id === results.schedule && g.status === "paused"));
  });
  await check("Compress and reset preserve product transcript", async () => {
    const before = await snapshot();
    await page.getByRole("button", { name: "Opsi percakapan", exact: true }).click();
    await page.getByText("Konteks percakapan", { exact: true }).click();
    await page.getByRole("button", { name: "Ringkas konteks", exact: true }).click();
    await page.getByText(/Konteks masih ringkas|Konteks dirangkum/).waitFor({ timeout: 90000 });
    await page.getByRole("button", { name: "Mulai konteks baru", exact: true }).click();
    await page
      .getByText("Konteks baru siap. Riwayat percakapan tetap tersimpan.", { exact: true })
      .waitFor({ timeout: 45000 });
    const after = await snapshot();
    assert.deepEqual(
      after.messages.map((m) => m.message_id),
      before.messages.map((m) => m.message_id),
    );
    await page.screenshot({ path: `${out}/session-reset.png` });
    await page.keyboard.press("Escape");
  });
} finally {
  await writeFile(`${out}/schedule-results.json`, JSON.stringify(results, null, 2) + "\n");
  await browser.close();
}
if (results.failures.length) process.exitCode = 1;
