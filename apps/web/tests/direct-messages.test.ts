import { describe, expect, test } from "bun:test";
import {
  applyEvent,
  type Event,
  type Message,
  mergeMessages,
  type Snapshot,
} from "../src/features/direct-messages/state";

const initial = (): Snapshot => ({
  thread: {
    thread_id: "dm",
    kind: "dm",
    title: "Researcher",
    dm_agent_id: "agent",
    membership_revision: "1",
    status: "open",
    agents: [],
  },
  messages: [],
  runs: [],
  through_cursor: "opaque",
  next_before_message_seq: null,
});
const event = (type: string, payload = {}): Event => ({
  type,
  payload,
  seq: "9007199254740993",
  thread_id: "dm",
  run_id: "run",
  agent_id: "agent",
});
const message = (id: string, seq: string): Message => ({
  message_id: id,
  message_seq: seq,
  run_id: "run",
  author_kind: "agent",
  author_agent_id: "agent",
  content: "Final answer",
});
describe("DM replay projection", () => {
  test("committed identity replaces a draft; repeated publication does not duplicate it", () => {
    let state = applyEvent(initial(), event("run.delta", { text: "Partial" }));
    expect(state.runs[0].text).toBe("Partial");
    const committed = event("message.created", message("reply", "2"));
    state = applyEvent(applyEvent(state, committed), committed);
    expect(state.messages).toHaveLength(1);
    expect(state.runs[0].text).toBe("");
    state = applyEvent(state, event("message.completed", { text: "Native informational copy" }));
    expect(state.messages[0].content).toBe("Final answer");
  });
  test.each(["cancelled", "failed", "indeterminate"])(
    "late delta cannot revive %s work",
    (status) => {
      let state = applyEvent(initial(), event("run.delta", { text: "Partial" }));
      state = applyEvent(state, event(`run.${status}`));
      state = applyEvent(state, event("run.delta", { text: "Stale output" }));
      expect(state.runs[0].status).toBe(status);
      expect(state.runs[0].text).toBe("");
    },
  );
  test("history merges preserve bigint order and authoritative newer content", () => {
    const messages = mergeMessages(
      [message("b", "9007199254740994"), message("a", "9007199254740993")],
      [{ ...message("b", "9007199254740994"), content: "Updated" }],
    );
    expect(messages.map((m) => m.message_id)).toEqual(["a", "b"]);
    expect(messages[1].content).toBe("Updated");
  });
  test("events from another conversation are rejected", () => {
    expect(() => applyEvent(initial(), { ...event("run.delta"), thread_id: "other" })).toThrow();
  });
});

test("goal replay updates progress without creating a run or regressing a revision", () => {
  const goal = {
    goal_id: "goal",
    title: "Fuel report",
    objective: "Calculate efficiency",
    status: "waiting",
    revision: "9007199254740994",
    generation: "2",
    progress: "Calculated",
    wake_condition: "Next readings",
    evidence: [],
  };
  const state = applyEvent(initial(), event("goal.changed", { goal }));
  expect(state.goals).toEqual([goal]);
  expect(state.runs).toEqual([]);
  expect(
    applyEvent(
      state,
      event("goal.changed", { goal: { ...goal, revision: "9007199254740993", status: "active" } }),
    ),
  ).toEqual(state);
  const completed = { ...goal, status: "completed", revision: "9007199254740995", generation: "3" };
  expect(applyEvent(state, event("goal.changed", { goal: completed })).goals).toEqual([completed]);
});
