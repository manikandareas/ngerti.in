import assert from "node:assert/strict";
import { chromium } from "playwright";
import type { Snapshot } from "../../../apps/web-client/src/types/workspace";

const proof = await Bun.file(".dev/nma062-native/proof.json").json();
const base = "http://127.0.0.1:4322";
const allowed = new Set([
  "capture_goal",
  "create_file",
  "publish_artifact",
  "write_routine",
  "report_goal",
  "control_goal",
  "list_goals",
  "group_read_task",
  "read_run_context",
]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const decisions: { tool: string; request_id: string; scope: string }[] = [];
try {
  await page.goto(base);
  await page.getByRole("button", { name: "Buat baru", exact: true }).waitFor();
  await page
    .getByRole("navigation", { name: "Percakapan", exact: true })
    .getByRole("button", { name: "UI work muse 2 agent", exact: true })
    .click();
  for (let attempt = 0; attempt < 240; attempt++) {
    const snapshot = (await (
      await page.request.get(`${base}/v1/threads/${proof.muse.thread_id}/snapshot`)
    ).json()) as Snapshot;
    const run = snapshot.runs.find((r) => r.status === "running");
    if (!run && snapshot.goals.length && snapshot.routines.length) break;
    if (run) {
      const pending = await (
        await page.request.get(`${base}/v1/runs/${run.id}/interactions`)
      ).json();
      for (const approval of pending.approvals ?? []) {
        const tool = String(approval.toolName ?? approval.subject.toolName).replace(
          /^mcp__ngertiin__ngertiin_/,
          "",
        );
        assert(allowed.has(tool), `Inspect unplanned permission request: ${tool}`);
        assert(
          approval.availableChoices.some(
            (c: { choiceId: string; scope: string }) =>
              c.choiceId === "allow_once" && c.scope === "once",
          ),
        );
        await page.getByRole("button", { name: "Allow once", exact: true }).waitFor();
        await page.screenshot({ path: `docs/verification/nma-062/native-permission-${tool}.png` });
        await page.getByRole("button", { name: "Allow once", exact: true }).click();
        decisions.push({ tool, request_id: approval.approvalId, scope: "once" });
        await Bun.write(
          "docs/verification/nma-062/native-permissions.json",
          JSON.stringify(
            {
              decisions,
              boundary:
                "Explicit requested scoped Ngertiin tools only; no shell, filesystem-native, persistent policy, or other external action.",
            },
            null,
            2,
          ),
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
} finally {
  await browser.close();
}
