import { expect, test } from "bun:test";
import type { RoutingPacket } from "../src/groups/router";
import { memberKey } from "../src/groups/routing-context";
import {
  routingEvidence,
  routingInputHash,
  routingReferences,
  routingState,
} from "../src/groups/routing-policy";

function packet(): RoutingPacket {
  return {
    group: { name: "Group", shared_instructions: "" },
    request: "skinny suruh tobi say hi ke aku",
    request_message_id: crypto.randomUUID(),
    attachments: [],
    history: [],
    members: [
      { agent_id: "one", name: "Skinny Vicuna", handle: "skinny", soul: "", instructions: "" },
      { agent_id: "two", name: "Tobi", handle: "tobi", soul: "A generalist", instructions: "" },
    ],
  };
}
test("unique shortened references retain names while colliding nicknames are not invented", () => {
  const input = packet();
  expect(routingReferences(input)[0]).toContain("skinny");
  input.members.push({ ...input.members[0], agent_id: "three", name: "Skinny Cat", handle: "cat" });
  expect(routingReferences(input)[0]).not.toContain("skinny");
  expect(routingReferences(input)[2]).not.toContain("skinny");
  expect(routingReferences(input)[0]).toContain("skinny vicuna");
});
test("routing state bounds shared evidence, retains every candidate and excludes opaque IDs", () => {
  const input = packet();
  input.members = Array.from({ length: 100 }, (_, i) => ({
    ...input.members[0],
    agent_id: `private-id-${i}`,
    name: `Member ${i}`,
    soul: "x".repeat(10_000),
  }));
  input.history = Array.from({ length: 20 }, (_, i) => ({
    id: `history-${i}`,
    author: "user",
    agent_id: null,
    text: `entry-${i} ${"x".repeat(2000)}`,
  }));
  const state = routingState(input, "shared");
  expect(Object.keys(state.members)).toHaveLength(100);
  expect(state.recent_history).toHaveLength(8);
  expect(state.recent_history[0].text).toStartWith("entry-12");
  expect(
    state.members[memberKey(input.members[99].agent_id)].responsibility.length,
  ).toBeLessThanOrEqual(240);
  expect(JSON.stringify(state)).not.toContain("private-id-");
  expect(routingInputHash(state)).toBe(routingInputHash(routingState(input, "shared")));
  input.request = "A different request";
  expect(routingInputHash(routingState(input, "shared"))).not.toBe(routingInputHash(state));
});
test("acceptance distinguishes confidence, candidate separation and resolvability", () => {
  const decision = {
    agent_id: "one",
    model: "jev-1.14.0",
    confidence: 0.7,
    probabilities: { member_0: 0.8, member_1: 0.15, unresolved: 0.05 },
    input_tokens: 100,
  };
  expect(routingEvidence(decision).reason).toBe("accepted");
  expect(routingEvidence({ ...decision, confidence: 0.16 }).reason).toBe("confidence");
  expect(routingEvidence({ ...decision, recipient_probability: 0.2 }).reason).toBe("recipient");
  expect(routingEvidence({ ...decision, agent_id: null }).reason).toBe("unresolved");
});
