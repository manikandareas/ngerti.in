import { describe, expect, test } from "bun:test";
import {
  plainReferenceParts,
  referenceFromUrl,
  referenceParts,
  referenceTarget,
  referenceText,
} from "../src/features/conversation/lib/inline-references";
import { remarkInlineReferences } from "../src/features/conversation/lib/remark-inline-references";
import type { Agent } from "../src/types/workspace";

const agent = { id: "agent-one", name: "Nara", handle: "nara" } as Agent;
const skill = {
  kind: "skill",
  id: "native:/a (b)/skill.md",
  label: "/research",
  agentId: agent.id,
  source: "native",
} as const;
const skills = [{ agent, description: "Research", reference: skill }];

describe("durable inline references", () => {
  test("round trips escaped labels, qualified native keys and pinned application versions", () => {
    for (const reference of [
      skill,
      { kind: "agent", id: agent.id, label: "@Nara [work]" } as const,
      { ...skill, source: "application", version: 3 } as const,
    ]) {
      const parts = referenceParts(`Use ${referenceText(reference)} next.`);
      expect(parts).toHaveLength(3);
      expect("reference" in parts[1] && parts[1].reference).toEqual(reference);
      expect(parts[2].text).toBe(" next.");
    }
    expect(referenceFromUrl("javascript:alert(1)", "unsafe")).toBeNull();
    expect(
      referenceFromUrl("ngertiin://skill/native/x?agent=agent-one&version=-1", "/x"),
    ).toBeNull();
  });
  test("a mention takes routing precedence over a skill owner and survives a renamed label", () => {
    const mention = { kind: "agent", id: "agent-two", label: "@old-name" } as const;
    expect(referenceTarget(`${referenceText(skill)} ${referenceText(mention)}`)).toBe("agent-two");
    expect(referenceTarget(referenceText(skill))).toBe(agent.id);
    expect(referenceTarget("ordinary text")).toBeNull();
    expect(referenceTarget(`\`${referenceText(mention)}\``)).toBeNull();
    expect(referenceTarget(`\`\`\`text\n${referenceText(mention)}\n\`\`\``)).toBeNull();
  });
  test("known plain names are styled without converting paths, URLs or code", () => {
    const text =
      "@nara use /research. `@nara /research` https://example.com/research /research/file /unknown mail@nara.com";
    const parts = plainReferenceParts(text, [agent], skills);
    expect(parts.filter((part) => "reference" in part)).toHaveLength(2);
    expect(parts.map((part) => part.text).join("")).toBe(text);
  });
  test("Markdown keeps inline code, fenced code, existing links and image content intact", () => {
    const protectedNodes = [
      { type: "inlineCode", value: "@nara /research" },
      { type: "code", value: "@nara /research" },
      { type: "link", url: "https://example.com", children: [{ type: "text", value: "@nara" }] },
      { type: "image", url: "https://example.com/a.png", value: "/research" },
    ];
    const before = JSON.stringify(protectedNodes);
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "Ask @nara for /research." }, ...protectedNodes],
        },
      ],
    };
    remarkInlineReferences({ agents: [agent], skills })(tree);
    expect(JSON.stringify(protectedNodes)).toBe(before);
    expect(JSON.stringify(tree)).toContain("ngertiin://agent/agent-one");
    expect(JSON.stringify(tree)).toContain("ngertiin://skill/native/");
  });
});
