import { expect, test } from "bun:test";
import { MuseInteractions } from "../src/harness/muse/interactions";

test("pending native approval preserves the action and human-readable choice", () => {
  const interactions = new MuseInteractions();
  const request = {
    approvalId: "approval",
    currentRequirementId: { approvalId: "approval", sourceIndex: 0 },
    toolName: "mcp__ngertiin__ngertiin.update_agent",
    rawArgs: '{"name":"Example"}',
    subject: { kind: "tool", toolName: "mcp__ngertiin__ngertiin.update_agent" },
    availableChoices: [
      { choiceId: "native-choice", decision: "approved", scope: "once", label: "Allow once" },
    ],
  };
  interactions.replacePending({ approvals: [request], userInputs: [] });
  expect(interactions.snapshot().approvals[0]).toEqual(request);
});
