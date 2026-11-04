import type { Artifact } from "@/types/work";
import {
  plainReferenceParts,
  type ReferenceAlias,
  type ReferenceSkill,
  referenceUrl,
} from "./inline-references";

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  url?: string;
}

export interface MarkdownReferenceOptions {
  agents: ReferenceAlias[];
  skills: ReferenceSkill[];
  files?: Pick<Artifact, "id" | "name">[];
}

function fileLink(file: Pick<Artifact, "id" | "name">): Node {
  return {
    type: "link",
    url: `ngertiin://file/${file.id}`,
    children: [{ type: "text", value: file.name }],
  };
}

/** Operate on Markdown text nodes so links, code and image URLs keep their original meaning. */
export function remarkInlineReferences({ agents, skills, files = [] }: MarkdownReferenceOptions) {
  return (tree: Node) => {
    function walk(node: Node) {
      if (
        !node.children ||
        ["link", "linkReference", "code", "inlineCode", "html", "image"].includes(node.type)
      )
        return;
      node.children = node.children.flatMap((child): Node[] => {
        // Legacy artifact receipts can become readable links without rewriting raw history.
        const file = child.value && files.find((file) => file.id === child.value);
        if (file && ["text", "inlineCode"].includes(child.type)) return [fileLink(file)];
        if (child.type !== "text" || !child.value) {
          walk(child);
          return [child];
        }
        const chunks = child.value.split(
          /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
        );
        return chunks.flatMap((chunk) => {
          const file = files.find((file) => file.id === chunk);
          if (file) return [fileLink(file)];
          return plainReferenceParts(chunk, agents, skills).map((part) =>
            "reference" in part
              ? {
                  type: "link",
                  url: referenceUrl(part.reference),
                  children: [{ type: "text", value: part.reference.label }],
                }
              : { type: "text", value: part.text },
          );
        });
      });
    }
    walk(tree);
  };
}
