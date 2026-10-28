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
  const pending = JSON.parse(await readFile(process.env.NMA043_PENDING_COMMAND, "utf8"));
  assert.equal(pending.payload.thread_id, thread);
  assert.equal(pending.type, "session.compress");
  // Restore only the exact already-submitted command from its durable receipt, no new operation.
  await page.evaluate(
    (command) =>
      sessionStorage.setItem(
        `nma-session-control:v1:${window.Clerk.user.id}:${command.payload.thread_id}`,
        JSON.stringify(command),
      ),
    pending,
  );
  await check("Resolve timed-out compression using the original command identity", async () => {
    const before = await snapshot();
    await page.getByRole("button", { name: "Opsi percakapan", exact: true }).click();
    await page.getByText("Konteks percakapan", { exact: true }).click();
    const sent = page.waitForRequest(
      (r) =>
        r.method() === "POST" &&
        r.url().endsWith("/commands") &&
        r.postDataJSON().type === "session.compress",
    );
    await page.getByRole("button", { name: "Periksa hasil ringkasan", exact: true }).click();
    assert.equal((await sent).postDataJSON().command_id, pending.command_id);
    await page.getByText(/Konteks dirangkum/).waitFor({ timeout: 30000 });
    const after = await snapshot();
    assert.deepEqual(
      after.messages.map((m) => m.message_id),
      before.messages.map((m) => m.message_id),
    );
    await page.screenshot({ path: `${out}/compression-recovered.png` });
  });
  await check("Reset preserves transcript and goal identities", async () => {
    const before = await snapshot();
    await page.getByRole("button", { name: "Mulai konteks baru", exact: true }).click();
    await page
      .getByText("Konteks baru siap. Riwayat percakapan tetap tersimpan.", { exact: true })
      .waitFor({ timeout: 45000 });
    const after = await snapshot();
    assert.deepEqual(
      after.messages.map((m) => m.message_id),
      before.messages.map((m) => m.message_id),
    );
    assert.deepEqual(
      after.goals.map((g) => g.goal_id),
      before.goals.map((g) => g.goal_id),
    );
    await page.screenshot({ path: `${out}/session-reset.png` });
  });
} finally {
  await writeFile(`${out}/session-recovery-results.json`, JSON.stringify(results, null, 2) + "\n");
  await browser.close();
}
if (results.failures.length) process.exitCode = 1;
