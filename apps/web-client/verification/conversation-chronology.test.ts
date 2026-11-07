import { expect, test } from "bun:test";
import { inputMessage, samplePart, sampleRun } from "../src/features/assistant-studio/fixtures";
import {
  type ConversationEntry,
  conversationEntries,
} from "../src/features/conversation/lib/conversation-parts";
import { conversationRows } from "../src/features/conversation/lib/conversation-rows";
import {
  conversationDay,
  conversationTime,
} from "../src/features/conversation/lib/conversation-time";
import type { NativeInteraction } from "../src/types/native-interactions";
import type { HumanRequest } from "../src/types/work";
import type { Message } from "../src/types/workspace";

const local = (day: number, hour = 12, minute = 0) =>
  new Date(2026, 10, day, hour, minute).toISOString();
function message(
  id: string,
  sequence: number,
  at: string,
  changes: Partial<Message> = {},
): Extract<ConversationEntry, { type: "message" }> {
  return {
    type: "message",
    part: {
      ...samplePart("message", sequence),
      id: `part:${id}`,
      message_id: id,
      sequence,
      created_at: at,
    },
    message: { ...inputMessage, id, created_at: at, text: id, ...changes },
  };
}
function render(
  entries: ConversationEntry[],
  changes: Partial<Parameters<typeof conversationRows>[1]> = {},
) {
  return conversationRows(entries, {
    native: { anchors: new Map(), fallback: [] },
    activity: new Map(),
    ...changes,
  });
}
function record(id: string, at: string): NativeInteraction {
  return {
    id,
    observed_at: at,
    last_observed_at: at,
    observed_state: "pending",
    submission: null,
  } as NativeInteraction;
}

test("calendar days follow the viewing zone, including UTC midnight and DST repeated hours", () => {
  expect(conversationDay("2026-11-01T15:59:00Z", "Asia/Makassar")).toBe("2026-11-01");
  expect(conversationDay("2026-11-01T16:01:00Z", "Asia/Makassar")).toBe("2026-11-02");
  expect(conversationDay("2026-11-02T00:01:00Z", "America/Los_Angeles")).toBe("2026-11-01");
  for (const at of ["2026-11-01T05:30:00Z", "2026-11-01T06:30:00Z"])
    expect(conversationDay(at, "America/New_York")).toBe("2026-11-01");
  for (const at of [undefined, "", "not a timestamp"])
    expect([conversationDay(at), conversationTime(at)]).toEqual([null, null]);
});

test("days span both authors, split at local midnight and stay stable across reloading", () => {
  const entries = [
    message("u1", 1, local(1, 23, 58)),
    message("a1", 2, local(1, 23, 59), { author: "agent" }),
    message("u2", 3, local(2, 0, 1)),
  ];
  const rows = render(entries);
  expect(rows.map((row) => row.startsDay)).toEqual([true, false, true]);
  expect(render(structuredClone(entries))).toEqual(rows);
});

test("prepending an overlapping history page produces one divider for each contiguous day", () => {
  const older = message("older", 1, local(1));
  const same = message("same", 2, local(2, 8));
  const latest = message("latest", 3, local(2, 9));
  const entries = conversationEntries(
    [older.part, same.part, same.part, latest.part],
    [older.message, same.message, latest.message],
  );
  expect(
    render(entries)
      .filter((row) => row.startsDay)
      .map((row) => conversationDay(row.at)),
  ).toEqual([conversationDay(local(1)), conversationDay(local(2))]);
});

test("queued intake time does not reorder published messages or determine the visible date", () => {
  const answer = message("answer", 1, local(2, 0, 1), { author: "agent" });
  const queued = message("queued", 2, local(2, 0, 2), { created_at: local(1, 23, 59) });
  const rows = render([answer, queued]);
  expect(rows.map((row) => row.key)).toEqual(["message:answer:0", "message:queued:0"]);
  expect(rows.map((row) => row.startsDay)).toEqual([true, false]);
  expect(rows[1].at).toBe(queued.part.created_at);
});

test("adjacent Goal milestones never fold across days and hidden handoffs create no dividers", () => {
  const parts = [
    { ...samplePart("goal_created", 1), created_at: local(1, 23, 59) },
    { ...samplePart("goal_created", 2), created_at: local(2, 0, 1) },
    { ...samplePart("handoff_requested", 3), created_at: local(3) },
  ];
  const entries = conversationEntries(parts, []);
  expect(entries).toHaveLength(3);
  expect(render(entries).map((row) => row.startsDay)).toEqual([true, true]);
});

test("retry suppression happens before date groups so a replaced answer leaves no empty day", () => {
  const old = message("failed", 1, local(1), { author: "agent", run_id: "failed-run" });
  const fresh = message("fresh", 2, local(2), { author: "agent" });
  const rows = render([old, fresh], {
    runs: [sampleRun({ id: "failed-run", retried_by_run_id: "new-run" })],
  });
  expect(rows.map((row) => row.key)).toEqual(["message:fresh:0"]);
  expect(rows[0].startsDay).toBe(true);
});

test("native cards keep verified text boundaries and introduce their own day after midnight", () => {
  const entry = message("answer", 1, local(1, 23, 59), { author: "agent", text: "Before.After." });
  const run = sampleRun({ native_interactions: [record("question", local(2, 0, 1))] });
  const fragment = { key: "fragment", run, recordIds: ["question"] };
  const rows = render([entry], {
    native: {
      anchors: new Map([[entry.message.id, [{ offset: 7, fragments: [fragment] }]]]),
      fallback: [],
    },
  });
  expect(rows.map((row) => row.type)).toEqual(["message", "native", "message"]);
  expect(rows.map((row) => row.startsDay)).toEqual([true, true, false]);
  expect(rows.filter((row) => row.type === "message").map((row) => row.text)).toEqual([
    "Before.",
    "After.",
  ]);
  expect(rows[2].at).toBe(run.native_interactions[0].observed_at);
});

test("fallback native records share a row within a day and split across a midnight boundary", () => {
  const entry = message("input", 1, local(1, 23, 57));
  const run = sampleRun({
    input_message_id: entry.message.id,
    native_interactions: [
      record("one", local(1, 23, 58)),
      record("two", local(1, 23, 59)),
      record("three", local(2, 0, 1)),
    ],
  });
  const rows = render([entry], {
    native: {
      anchors: new Map(),
      fallback: [{ key: "legacy", run, recordIds: ["one", "two", "three"] }],
    },
  });
  expect(rows.filter((row) => row.type === "native").map((row) => row.fragment.recordIds)).toEqual([
    ["one", "two"],
    ["three"],
  ]);
  expect(rows.map((row) => row.startsDay)).toEqual([true, false, true]);
});

test("Computer stays on its start day before the next-day answer, including after completion", () => {
  const input = message("input", 1, local(1, 23, 58));
  const answer = message("answer", 2, local(2, 0, 2), { author: "agent" });
  const run = sampleRun({
    input_message_id: input.message.id,
    created_at: input.part.created_at,
    computer_activity: {
      machine_id: "machine",
      generation: 1,
      phase: "active",
      started_at: local(1, 23, 59),
    },
  });
  const options = { activity: new Map([[answer.part.id, [run]]]) };
  const rows = render([input, answer], options);
  expect(rows.map((row) => row.type)).toEqual(["message", "run", "message"]);
  expect(rows.map((row) => row.startsDay)).toEqual([true, false, true]);
  run.status = "succeeded";
  expect(render([input, answer], options).map((row) => row.at)).toEqual(rows.map((row) => row.at));
});

test("non-Computer activity remains after the latest public answer on that answer's day", () => {
  const input = message("input", 1, local(1, 23, 58));
  const answer = message("answer", 2, local(2, 0, 2), { author: "agent" });
  const run = sampleRun({ input_message_id: input.message.id, created_at: input.part.created_at });
  const rows = render([input, answer], { activity: new Map([[answer.part.id, [run]]]) });
  expect(rows.map((row) => row.type)).toEqual(["message", "message", "run"]);
  expect(rows.map((row) => row.startsDay)).toEqual([true, true, false]);
});

test("a product card retains its request date when the decision changes or the parent predates it", () => {
  const entry = message("question", 1, local(1, 23, 59), { author: "agent" });
  const request = {
    message_id: entry.message.id,
    purpose: "approval",
    state: "pending",
    created_at: local(2, 0, 1),
  } as HumanRequest;
  const pending = render([entry], { requests: [request] });
  request.state = "answered";
  expect(render([entry], { requests: [request] })).toEqual(pending);
  expect(pending[0].at).toBe(request.created_at);
});
