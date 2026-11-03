import { expect, test } from "bun:test";
import { avatarActivity } from "../src/features/conversation/lib/avatar-activity";
import { runStatusLabel } from "../src/features/conversation/lib/run-status";
import { eventProjections, mergeEntity } from "../src/hooks/workspace-events";
import type { WorkspaceEvent } from "../src/lib/api-client";

const event = (kind: string, thread = "active"): WorkspaceEvent => ({
  cursor: 10,
  entity_kind: kind,
  entity_id: "id",
  revision: 2,
  data: { id: "id", kind, revision: 2, thread_id: thread, purpose: "conversation" },
});

test("streamed text invalidates its public conversation and preview without global catalog reloads", () => {
  expect([...eventProjections(event("message"), "active")].sort()).toEqual([
    "conversation",
    "previews",
  ]);
  expect([...eventProjections(event("message", "other"), "active")]).toEqual(["previews"]);
  expect([...eventProjections(event("app_effect", "other"), "active")]).toEqual([]);
  const opening = event("run");
  opening.data.input_message_id = "opener";
  expect(eventProjections(opening, "active", "opener").has("opening")).toBe(true);
  expect(eventProjections(event("run"), "active", "opener").has("opening")).toBe(false);
  for (const kind of ["agent", "connection"])
    expect(eventProjections(event(kind), "active").has("opening")).toBe(true);
  const browser = event("browser_session", "other");
  delete browser.data.thread_id;
  expect(eventProjections(browser, "active").has("conversation")).toBe(true);
  const router = event("run", "private-routing-thread");
  router.conversation_thread_id = "active";
  expect(eventProjections(router, "active").has("conversation")).toBe(true);
  expect(eventProjections(router, "unrelated").has("conversation")).toBe(false);
});

test("late global responses cannot replace newer entity configuration", () => {
  const current = [{ id: "one", revision: 3, name: "Current" }];
  expect(mergeEntity(current, { id: "one", revision: 2, name: "Stale" })).toBe(current);
  expect(mergeEntity(current, { id: "one", revision: 4, name: "Updated" })[0].name).toBe("Updated");
});

test("queue, preparation and blocked states have distinct actionable user labels", () => {
  expect(runStatusLabel({ status: "queued" })).toBe("Menunggu giliran");
  expect(
    runStatusLabel({
      status: "queued",
      preparation: { state: "preparing", attempts: 1, next_attempt_at: null },
    }),
  ).toBe("Menyiapkan agent");
  const blocked = {
    agent_id: "agent",
    thread_id: "thread",
    run_id: "run",
    status: "queued",
    activity: "idle",
    waiting_for_user: false,
    preparation: { state: "blocked" as const, attempts: 1, next_attempt_at: null },
  };
  expect(avatarActivity(blocked)).toEqual({ state: "error", label: "Agent belum siap" });
});
