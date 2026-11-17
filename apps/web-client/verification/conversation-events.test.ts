import { expect, test } from "bun:test";
import { sampleSnapshot } from "../src/features/assistant-studio/fixtures";
import {
  applyConversationEvent,
  reconcileConversationSnapshot,
} from "../src/hooks/conversation-events";
import type { WorkspaceEvent } from "../src/lib/api-client";

const threadId = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";
const base = () =>
  sampleSnapshot({
    cursor: 1,
    thread: { ...sampleSnapshot().thread, id: threadId },
    messages: [],
    runs: [],
    timeline: { parts: [], messages: [], has_more: false, next_before: null },
  });
const event = (revision = 1): WorkspaceEvent => ({
  cursor: revision + 1,
  entity_kind: "message",
  entity_id: messageId,
  revision,
  data: {
    id: messageId,
    kind: "message",
    owner_id: "44444444-4444-4444-8444-444444444444",
    revision,
    thread_id: threadId,
    purpose: "conversation",
    author: "agent",
    author_agent_id: "33333333-3333-4333-8333-333333333333",
    routine_id: null,
    run_id: null,
    created_at: "2026-11-17T00:00:00Z",
    updated_at: "2026-11-17T00:00:00Z",
    text: "Answer",
    state: "complete",
  },
  conversation_part: {
    id: "message:answer",
    sequence: 2,
    source_cursor: 2,
    thread_id: threadId,
    created_at: "2026-11-17T00:00:00Z",
    kind: "message",
    message_id: messageId,
    resource_id: null,
    source_message_id: null,
    actors: [],
    name: "",
    summary: null,
  },
});
test("public message deltas append once and stale fetches cannot overwrite streamed revisions", () => {
  const first = applyConversationEvent(base(), event());
  if (!first) throw new Error("Missing public message delta");
  const newer = event(2);
  newer.data.text = "Updated answer";
  const second = applyConversationEvent(first, newer);
  if (!second) throw new Error("Missing streamed update");
  expect(second.timeline.parts).toHaveLength(1);
  expect(second.timeline.messages[0].text).toBe("Updated answer");
  const merged = reconcileConversationSnapshot(first, second);
  expect(merged.messages[0].text).toBe("Updated answer");
  expect(applyConversationEvent(second, event())?.messages[0].revision).toBe(2);
});
test("unpositioned, internal and other-thread messages require authoritative refresh", () => {
  const unpositioned = event();
  delete unpositioned.conversation_part;
  expect(applyConversationEvent(base(), unpositioned)).toBeNull();
  const internal = event();
  internal.data.purpose = "continuation";
  expect(applyConversationEvent(base(), internal)).toBeNull();
  const other = event();
  other.data.thread_id = "other";
  expect(applyConversationEvent(base(), other)).toBeNull();
});

test("invalid public payloads fall back to an authoritative snapshot", () => {
  const malformed = event();
  malformed.data.text = 42;
  expect(applyConversationEvent(base(), malformed)).toBeNull();
  expect(applyConversationEvent(base(), { ...event(), entity_kind: "run" })).toBeNull();
});
