import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { GoalDetail } from "../types";
import { goalActivity } from "./activity";

describe("goal activity", () => {
  test("merges evidence chronologically without duplicating its revision or claiming completion", () => {
    const spec = {
      title: "Portfolio",
      target: "Finish portfolio",
      criteria: ["Publish"],
      horizon: "",
      next_action: "Review draft",
      budget_cap: 100,
    };
    const goal: Pick<GoalDetail, "history" | "evidence_history"> = {
      history: [
        {
          revision: 2,
          plan_revision: 1,
          state: "active",
          spec,
          operation: "evidence",
          created_at: "2026-10-20T10:00:00Z",
        },
        {
          revision: 1,
          plan_revision: 1,
          state: "active",
          spec,
          operation: "create",
          created_at: "2026-10-19T10:00:00Z",
        },
      ],
      evidence_history: [
        {
          id: "evidence-1",
          created_at: "2026-10-20T10:00:00Z",
          plan_revision: 1,
          criterion: 0,
          state: "in_progress",
          note: "Draft ready for review",
          source: { kind: "user_report" },
          available: true,
        },
      ],
    };
    const events = goalActivity(goal);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.description, "Draft ready for review");
    assert.equal(events[0]?.title, "Bukti dicatat · Dalam proses");
    assert.equal(events[1]?.title, "Added Portfolio");
  });
  test("keeps an empty history empty", () => {
    assert.deepEqual(goalActivity({ history: [], evidence_history: [] }), []);
  });
});
