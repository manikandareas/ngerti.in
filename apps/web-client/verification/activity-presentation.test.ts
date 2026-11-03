import { expect, test } from "bun:test";
import { activityPresentation } from "../src/features/conversation/lib/activity-presentation";
import { conversationActivity } from "../src/features/conversation/lib/conversation-activity";
import type { ConversationEntry } from "../src/features/conversation/lib/conversation-parts";
import type { Run, Snapshot } from "../src/types/workspace";

test("friendly activity uses observed categories and preserves stop, waiting and unknown precedence", () => {
  const source = { status: "running", activity: "generating" };
  expect(activityPresentation(source)).toMatchObject({
    label: "Thinking it through…",
    isLoading: true,
  });
  for (const [kind, label] of [
    ["searching", "Searching the web…"],
    ["reading", "Reading your file…"],
    ["updating", "Updating your file…"],
    ["working", "Working on it…"],
  ]) {
    expect(
      activityPresentation({
        ...source,
        active_tools: [{ call_id: "one", kind, target_agent_id: null }],
      }),
    ).toMatchObject({ label, isLoading: true });
  }
  expect(
    activityPresentation(
      {
        ...source,
        active_tools: [{ call_id: "one", kind: "asking_agent", target_agent_id: "peer" }],
      },
      { targetName: "Tobi" },
    ).label,
  ).toBe("Asking @Tobi for help…");
  expect(activityPresentation(source, { waitingForUser: true })).toMatchObject({
    isLoading: false,
    label: "Waiting for your reply…",
  });
  expect(
    activityPresentation({ ...source, status: "cancel_requested" }, { waitingForUser: true }),
  ).toMatchObject({ isLoading: true, label: "Stopping…" });
  expect(
    activityPresentation({ ...source, status: "unknown" }, { waitingForUser: true }),
  ).toMatchObject({ isLoading: false, label: "The result needs a check." });
  expect(activityPresentation(source, { online: false })).toMatchObject({
    isLoading: false,
    label: "Reconnecting…",
  });
  expect(activityPresentation({ ...source, status: "cancelled" }).isLoading).toBe(false);
  expect(activityPresentation({ ...source, status: "failed" }).isLoading).toBe(false);
  expect(activityPresentation({ ...source, status: "failed" }, { online: false }).label).toBe(
    "I couldn’t finish this.",
  );
});

function run(id: string, input: string, overrides: Partial<Run> = {}): Run {
  return {
    id,
    input_message_id: input,
    agent_id: "agent",
    status: "running",
    publication: "immediate",
    native_interactions: [],
    ...overrides,
  } as Run;
}
function entry(id: string, runId: string | null = null): ConversationEntry {
  return {
    type: "message",
    part: { id: `part:${id}` },
    message: { id, author: runId ? "agent" : "user", run_id: runId },
  } as ConversationEntry;
}
function snapshot(runs: Run[], extra: Partial<Snapshot> = {}): Snapshot {
  return {
    runs,
    thread: { member_agent_ids: ["agent", "peer"] },
    tasks: [],
    human_requests: [],
    ...extra,
  } as unknown as Snapshot;
}

test("activity follows its own latest output, keeps peers separate and never borrows another input", () => {
  const first = run("first", "input");
  const peer = run("peer-run", "peer-input", { agent_id: "peer" });
  const hidden = run("hidden", "private-input");
  const entries = [
    entry("input"),
    entry("peer-input"),
    entry("output", first.id),
    entry("unrelated"),
  ];
  const mapped = conversationActivity(snapshot([first, peer, hidden]), entries);
  expect(mapped.get("part:output")).toEqual([first]);
  expect(mapped.get("part:peer-input")).toEqual([peer]);
  expect(mapped.has("part:unrelated")).toBe(false);
});

test("queued work, quiet continuations and superseded failures do not create ghost activity", () => {
  const failed = run("failed", "input", { status: "failed" });
  const complete = run("complete", "input", { status: "succeeded" });
  const quiet = run("quiet", "quiet-input", { publication: "quiet" });
  const queued = run("queued", "queued-input", { status: "queued" });
  const entries = [entry("input"), entry("quiet-input"), entry("queued-input")];
  expect(conversationActivity(snapshot([failed, complete, quiet, queued]), entries).size).toBe(0);
  expect(
    conversationActivity(
      snapshot([complete], {
        human_requests: [
          { source_run_id: complete.id, state: "pending" },
        ] as Snapshot["human_requests"],
      }),
      entries,
    ).get("part:input"),
  ).toEqual([complete]);
});

test("an interactive group continuation anchors to the user's reply while unrelated deferred work stays quiet", () => {
  const resumed = run("resumed", "private-continuation", { publication: "deferred" });
  const background = run("background", "original-input", { publication: "deferred" });
  const state = snapshot([resumed, background], {
    human_requests: [
      { state: "answered", continuation_run_id: resumed.id, response_message_id: "human-reply" },
    ] as Snapshot["human_requests"],
  });
  const entries = [entry("original-input"), entry("human-reply")];
  expect(conversationActivity(state, entries).get("part:human-reply")).toEqual([resumed]);
  expect(conversationActivity(state, entries).has("part:original-input")).toBe(false);
});

test("handoff keeps the queued recipient visible while the parent yields", () => {
  const parent = run("parent", "input");
  const peer = run("peer", "internal-handoff", { agent_id: "peer", status: "queued" });
  const state = snapshot([parent, peer], {
    tasks: [
      { current_run_id: parent.id, request_message_id: "input", state: "waiting_peer" },
      { current_run_id: peer.id, request_message_id: "internal-handoff", state: "queued" },
    ] as Snapshot["tasks"],
  });
  const entries = [
    entry("input"),
    {
      type: "activity",
      parts: [{ id: "handoff", kind: "handoff_requested", message_id: "internal-handoff" }],
    },
  ] as ConversationEntry[];
  const activity = conversationActivity(state, entries);
  expect(activity.get("handoff")).toEqual([peer]);
  expect(activity.has("part:input")).toBe(false);
});

test("thinking copy varies across runs and stays stable for the same run", () => {
  const labels = new Set<string>();
  for (let index = 0; index < 30; index++) {
    const source = {
      id: `run-${index}`,
      status: "running",
      activity: "generating",
      preparation: undefined,
    };
    const first = activityPresentation(source).label;
    expect(activityPresentation({ ...source }).label).toBe(first);
    labels.add(first);
  }
  expect(labels.size).toBe(5);
});

test("routing copy varies by route and stays stable across repeated reads", async () => {
  const { routingLabel, routingLabels } = await import(
    "../src/features/conversation/lib/activity-presentation"
  );
  const observed = new Set<string>();
  for (let index = 0; index < 40; index++) {
    const id = `route-${index}`;
    const label = routingLabel(id);
    expect(routingLabels).toContain(label);
    expect(routingLabel(id)).toBe(label);
    observed.add(label);
  }
  expect(observed.size).toBe(routingLabels.length);
});
