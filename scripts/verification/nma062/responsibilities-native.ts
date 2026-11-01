import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import type { Entity } from "../../../apps/server/src/contracts";
import type { Snapshot } from "../../../apps/web-client/src/types/workspace";

const proof = (await Bun.file(".dev/nma062-native/proof.json").json()) as Record<
  "codex" | "muse",
  { agent: Entity<"agent">; thread_id: string }
>;
const base = "http://127.0.0.1:4322";
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
async function snapshot(id: string): Promise<Snapshot> {
  return (await context.request.get(`${base}/v1/threads/${id}/snapshot`)).json();
}
async function waitFor(id: string, predicate: (s: Snapshot) => boolean) {
  let latest = await snapshot(id);
  for (let attempt = 0; attempt < 240; attempt++) {
    if (predicate(latest) && latest.runs.every((r) => r.status === "succeeded")) return latest;
    assert(
      !latest.runs.some((r) => ["failed", "unknown"].includes(r.status)),
      "Inspect native failure before continuing.",
    );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    latest = await snapshot(id);
  }
  throw new Error("Native responsibility timeout; inspect existing work before retry.");
}
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Buat baru", exact: true }).waitFor();
  for (const family of ["codex", "muse"] as const) {
    const lane = proof[family];
    await page
      .getByRole("navigation", { name: "Percakapan", exact: true })
      .getByRole("button", { name: `UI work ${family} 2 agent`, exact: true })
      .click();
    await page.getByRole("button", { name: `Detail UI work ${family}`, exact: true }).waitFor();
    let current = await snapshot(lane.thread_id);
    if (
      !current.goals.length &&
      !current.messages.some((m) => m.text.includes(`responsibility ${family}`))
    ) {
      await page
        .getByRole("textbox", { name: "Pesan", exact: true })
        .fill(
          `@proof062_${family} Take responsibility for maintaining a short research report for this group. Capture one goal titled "UI responsibility ${family}" from this message. Write report-${family}.txt with exactly "NMA062 ${family} report ready\\n" using Ngertiin scoped file tools, publish it as a text/plain artifact, create one associated Routine to review the report ONCE at 2035-01-01T00:00:00Z in Asia/Makassar, then report initial progress with that artifact evidence and disposition scheduled. Keep the goal active for that future schedule. Use scoped tools; do not contact apps, browser, people, or unrelated resources.`,
        );
      await page.getByRole("button", { name: "Kirim", exact: true }).click();
    }
    current = await waitFor(
      lane.thread_id,
      (s) =>
        s.goals.length === 1 &&
        s.routines.length === 1 &&
        s.goals[0]?.evidence_artifact_ids.length === 1,
    );
    const goal = current.goals[0];
    const artifact = current.artifacts.find((a) => a.id === goal?.evidence_artifact_ids[0]);
    assert(goal && artifact?.workspace_id);
    const content = await context.request.get(
      `${base}/v1/artifacts/${artifact.id}/content?workspace_id=${artifact.workspace_id}`,
    );
    assert(content.ok());
    const bytes = await content.body();
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256);
    assert.match(bytes.toString(), new RegExp(`NMA062 ${family} report ready`));
    await page.getByRole("button", { name: `Detail UI work ${family}`, exact: true }).click();
    await page.getByRole("tab", { name: "Goals", exact: true }).click();
    await page.getByRole("button", { name: goal.title, exact: true }).click();
    await page.getByRole("button", { name: `${artifact.name} →`, exact: true }).click();
    await page.getByRole("button", { name: `Buka ${artifact.name}`, exact: true }).click();
    await page.getByText(bytes.toString(), { exact: true }).waitFor();
    await page.screenshot({ path: `docs/verification/nma-062/native-${family}-file.png` });
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("tab", { name: "Routine", exact: true }).click();
    await page.getByRole("button", { name: current.routines[0]?.instruction, exact: true }).click();
    await page.getByText("Asia/Makassar", { exact: true }).waitFor();
    await page.screenshot({ path: `docs/verification/nma-062/native-${family}-routine.png` });
    if (goal.state === "active") {
      await page.getByRole("tab", { name: "Goals", exact: true }).click();
      await page.getByRole("button", { name: goal.title, exact: true }).click();
      await page.getByRole("button", { name: "Jeda goal melalui chat", exact: true }).click();
      await page.getByRole("button", { name: "Kirim", exact: true }).click();
    } else await page.getByRole("button", { name: "Tutup detail", exact: true }).click();
    current = await waitFor(
      lane.thread_id,
      (s) => s.goals[0]?.state === "paused" && s.routines[0]?.state === "paused",
    );
    await Bun.write(
      `docs/verification/nma-062/responsibility-${family}.json`,
      JSON.stringify(
        {
          goals: current.goals,
          routines: current.routines,
          artifacts: current.artifacts,
          runs: current.runs,
          verified_content_sha256: artifact.sha256,
          errors,
        },
        null,
        2,
      ),
    );
  }
  assert.deepEqual(errors, []);
} finally {
  await page
    .screenshot({ path: "docs/verification/nma-062/responsibility-last.png" })
    .catch(() => {});
  await browser.close();
}
