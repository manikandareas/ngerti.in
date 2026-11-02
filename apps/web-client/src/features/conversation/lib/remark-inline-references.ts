import type { Agent } from "@/types/workspace";
import { plainReferenceParts, referenceUrl, type SkillOption } from "./inline-references";

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  url?: string;
}

/** Operate on Markdown text nodes so links, code and image URLs keep their original meaning. */
export function remarkInlineReferences({
  agents,
  skills,
}: {
  agents: Agent[];
  skills: SkillOption[];
}) {
  return (tree: Node) => {
    function walk(node: Node) {
      if (
        !node.children ||
        ["link", "linkReference", "code", "inlineCode", "html", "image"].includes(node.type)
      )
        return;
      node.children = node.children.flatMap((child): Node[] => {
        if (child.type !== "text" || !child.value) {
          walk(child);
          return [child];
        }
        return plainReferenceParts(child.value, agents, skills).map((part) =>
          "reference" in part
            ? {
                type: "link",
                url: referenceUrl(part.reference),
                children: [{ type: "text", value: part.reference.label }],
              }
            : { type: "text", value: part.text },
        );
      });
    }
    walk(tree);
  };
}
