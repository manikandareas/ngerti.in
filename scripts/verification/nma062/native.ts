import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import type { Entity } from "../../../apps/server/src/contracts";
import type { Snapshot } from "../../../apps/web-client/src/types/workspace";

const stateDir = ".dev/nma062-native";
type Lane = { connection: Entity<"connection">; agent: Entity<"agent">; thread_id?: string };
const proof = (await Bun.file(`${stateDir}/proof.json`).json()) as Record<"codex" | "muse", Lane>;
const base = "http://127.0.0.1:4322";
mkdirSync(".dev/verification/nma-062", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
async function snapshot(id: string): Promise<Snapshot> {
  const response = await context.request.get(`${base}/v1/threads/${id}/snapshot`);
  assert(response.ok());
  return response.json();
}
async function waitFor(id: string, predicate: (s: Snapshot) => boolean) {
  let latest = await snapshot(id);
  for (let attempt = 0; attempt < 180; attempt++) {
    if (predicate(latest)) return latest;
    assert(
      !latest.runs.some((r) => ["failed", "unknown"].includes(r.status)),
      "Native outcome needs reconciliation.",
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    latest = await snapshot(id);
  }
  throw new Error("Native cohort timed out; inspect existing runs without replay.");
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Buat baru", exact: true }).waitFor();
  for (const family of ["codex", "muse"] as const) {
    const lane = proof[family];
    const other = proof[family === "codex" ? "muse" : "codex"];
    if (!lane.thread_id) {
      await page.getByRole("button", { name: "Buat baru", exact: true }).click();
      await page.getByRole("button", { name: "Create group", exact: true }).click();
      await page.getByLabel("Nama grup", { exact: true }).fill(`UI work ${family}`);
      await page.getByRole("checkbox", { name: lane.agent.name, exact: true }).check();
      await page.getByRole("checkbox", { name: other.agent.name, exact: true }).check();
      const result = page.waitForResponse(
        (r) => r.url().endsWith("/v1/creation/groups") && r.request().method() === "POST",
      );
      await page.getByRole("button", { name: "Buat grup", exact: true }).click();
      const creation = await (await result).json();
      lane.thread_id = creation.thread.id;
      await Bun.write(`${stateDir}/proof.json`, JSON.stringify(proof));
    } else {
      const row = page
        .getByRole("navigation", { name: "Percakapan", exact: true })
        .getByRole("button", { name: `UI work ${family} 2 agent`, exact: true });
      await row.click();
    }
    const threadId = lane.thread_id as string;
    await waitFor(
      threadId,
      (s) =>
        s.routes[0]?.state === "selected" &&
        s.runs.length > 0 &&
        s.runs.every((r) => r.status === "succeeded"),
    );
    let current = await snapshot(threadId);
    if (!current.human_requests.length) {
      await page
        .getByRole("textbox", { name: "Pesan", exact: true })
        .fill(
          `@proof062_${family} Update this group's shared instructions to exactly "Research together with clear evidence." using ngertiin.update_group at the current revision. Then call ngertiin.group_ask_user with purpose input and question exactly "Which report format?". Do not create goals, Routine, files, apps or native approval requests. Finish this turn after asking.`,
        );
      await page.getByRole("button", { name: "Kirim", exact: true }).click();
    }
    current = await waitFor(threadId, (s) =>
      s.human_requests.some((r) => r.state === "pending" || r.state === "answered"),
    );
    const question = current.human_requests[0];
    assert(question);
    if (question.state === "pending") {
      await page
        .getByRole("textbox", { name: `Jawaban untuk ${lane.agent.name}`, exact: true })
        .waitFor({ state: "visible", timeout: 5000 });
      await page
        .getByRole("textbox", { name: `Jawaban untuk ${lane.agent.name}`, exact: true })
        .fill("Use a concise Markdown report. This answers only the format question.");
      await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
    }
    current = await waitFor(
      threadId,
      (s) =>
        s.human_requests[0]?.state === "answered" &&
        s.human_requests[0]?.continuation_run_id !== null &&
        s.runs.every((r) => r.status === "succeeded"),
    );
    assert.equal(current.thread.shared_instructions, "Research together with clear evidence.");
    assert.equal(current.goals.length, 0);
    assert.equal(current.routines.length, 0);
    await page.getByRole("button", { name: `Detail UI work ${family}`, exact: true }).click();
    await page
      .getByText("Research together with clear evidence.", { exact: true })
      .waitFor({ state: "visible" });
    await page.screenshot({ path: `.dev/verification/nma-062/native-${family}-group.png` });
    await page.getByRole("button", { name: "Tutup detail", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: `Detail UI work ${family}`, exact: true }).waitFor();
    const after = await snapshot(threadId);
    assert.equal(after.runs.length, current.runs.length);
    await Bun.write(
      `.dev/verification/nma-062/native-${family}.json`,
      JSON.stringify(
        {
          billing: lane.connection.effective_billing_source,
          thread: after.thread,
          messages: after.messages,
          runs: after.runs,
          routes: after.routes,
          requests: after.human_requests,
          reload_run_count: after.runs.length,
          errors,
        },
        null,
        2,
      ),
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await page.screenshot({ path: ".dev/verification/nma-062/native-last.png" }).catch(() => {});
  await browser.close();
}
