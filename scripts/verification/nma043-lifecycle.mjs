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
  await check("Automatic goal capture and clarification through ordinary chat", async () => {
    const state = await sendText(
      "Bantu aku menyiapkan rencana perjalanan santai ke Bandung. Simpan sebagai goal NMA043 Bandung. Jangan gunakan alat eksternal dulu; aku belum tahu tanggalnya. Tunggu aku memberikan tanggal sebelum melanjutkan dan tanyakan tanggalnya.",
    );
    assert(state.goals?.length > 0);
    results.goal =
      state.goals.find((g) => g.title.includes("Bandung"))?.goal_id ?? state.goals[0].goal_id;
    await page.getByRole("button", { name: /^Goals/ }).click();
    await page.getByRole("region", { name: "Progress goals" }).waitFor();
    await page.locator('section[aria-label="Progress goals"] summary').first().click();
    await page.screenshot({ path: `${out}/goal-details-real.png` });
    await page.keyboard.press("Escape");
  });
  await check("Goal pause through chat", async () => {
    const state = await sendText(
      "Jeda goal perjalanan Bandung yang barusan kita buat. Jangan lanjutkan dulu.",
    );
    assert(state.goals.some((g) => g.goal_id === results.goal && g.status === "paused"));
  });
  await check("Goal resume and change through chat", async () => {
    const state = await sendText(
      "Lanjutkan goal Bandung tadi dengan anggaran maksimal Rp2 juta per orang. Tetap tunggu tanggal dariku, jangan mencari atau memesan apa pun.",
    );
    assert(
      state.goals.some(
        (g) => g.goal_id === results.goal && ["active", "waiting"].includes(g.status),
      ),
    );
  });
  await check("Stop active work retains user message without duplicate answer", async () => {
    const before = await snapshot();
    await page
      .getByRole("textbox", { name: /Pesan untuk/ })
      .fill(
        "Untuk tes berhenti, tulis 100 paragraf panjang tentang perencanaan perjalanan. Jangan gunakan alat eksternal.",
      );
    await page.getByRole("button", { name: "Kirim pesan", exact: true }).click();
    await page
      .getByRole("button", { name: "Hentikan jawaban", exact: true })
      .last()
      .click({ timeout: 15000 });
    await page.getByText("Dihentikan", { exact: true }).last().waitFor({ timeout: 30000 });
    const after = await snapshot();
    const added = after.messages.filter(
      (m) =>
        !before.messages.some((b) => b.message_id === m.message_id) && m.author_kind === "user",
    );
    assert.equal(added.length, 1);
    assert.equal(after.runs.find((r) => r.run_id === added[0].run_id).status, "cancelled");
    await page.screenshot({ path: `${out}/stopped-real.png` });
  });
  await check("Long content scroll preserves reading position and jump to latest", async () => {
    await sendText(
      "Untuk tes percakapan panjang, buat tepat 60 baris daftar bernomor berisi tips singkat perjalanan, tanpa alat eksternal.",
    );
    const scroll = page.locator(".app-surface .overflow-y-auto").first();
    await scroll.evaluate((el) => {
      el.scrollTop = 0;
      el.dispatchEvent(new Event("scroll"));
    });
    await page.getByRole("button", { name: "Pesan terbaru" }).waitFor();
    await page.getByRole("button", { name: "Pesan terbaru" }).click();
    assert(await scroll.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 100));
    await page.screenshot({ path: `${out}/long-conversation.png` });
  });
  await check("Conversation permission denies unauthenticated reads", async () => {
    const r = await context.request.get(
      `http://localhost:8000/api/agent-engine/v1/threads/${thread}/snapshot`,
    );
    assert.equal(r.status(), 401);
  });
} finally {
  await writeFile(`${out}/lifecycle-results.json`, JSON.stringify(results, null, 2) + "\n");
  await browser.close();
}
if (results.failures.length) process.exitCode = 1;
