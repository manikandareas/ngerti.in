import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";

const parser = unified().use(remarkParse).use(remarkGfm);
interface MarkdownNode {
  type: string;
  children?: MarkdownNode[];
}
function hasReference(node: MarkdownNode): boolean {
  return (
    ["definition", "linkReference", "imageReference"].includes(node.type) ||
    (node.children?.some(hasReference) ?? false)
  );
}

/** Never reparse a partial fence, table, paragraph, list or cross-block reference as a new reply. */
export function nativeMarkdownBoundaries(text: string) {
  const root = parser.parse(text);
  const references = hasReference(root);
  return (offset: number) => {
    if (offset === 0 || offset === text.length) return true;
    if (references) return false;
    return !root.children.some((block) => {
      const start = block.position?.start.offset;
      const end = block.position?.end.offset;
      return start === undefined || end === undefined || (start < offset && offset < end);
    });
  };
}
