import { expect, test } from "bun:test";
import { avatarActivity } from "../src/features/conversation/lib/avatar-activity";
import type { AgentActivity } from "../src/types/workspace";

test("activity presentation preserves waiting, stopping and unknown while separating generation from tools", () => {
  const activity: AgentActivity = {
    agent_id: "a",
    thread_id: "t",
    run_id: "r",
    status: "running",
    activity: "generating",
    waiting_for_user: false,
  };
  expect(avatarActivity(activity).state).toBe("thinking");
  expect(avatarActivity({ ...activity, activity: "tool_running" }).state).toBe("working");
  expect(avatarActivity({ ...activity, waiting_for_user: true })).toEqual({
    state: "listening",
    label: "Menunggu kamu",
  });
  expect(
    avatarActivity({ ...activity, waiting_for_user: true, status: "cancel_requested" }),
  ).toEqual({ state: "working", label: "Stop diminta" });
  expect(avatarActivity({ ...activity, status: "unknown" })).toEqual({
    state: "error",
    label: "Hasil belum diketahui",
  });
  expect(avatarActivity({ ...activity, status: "succeeded", activity: "idle" }).state).toBe("idle");
  expect(avatarActivity(undefined, true, true).state).toBe("listening");
  expect(avatarActivity(activity, false).label).toBe("Koneksi terputus");
});
