// OpenMausBot 0.1.137 ChatMarkdown.tsx: direction follows the first strong prose letter.
const rtlLetter =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
interface TextNode {
  type?: string;
  tagName?: string;
  value?: string;
  children?: TextNode[];
}
function blockText(node: TextNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  if (node.tagName === "code" || node.tagName === "pre") return "";
  return (node.children ?? []).map(blockText).join("");
}
export function blockDirection(node: unknown): "ltr" | "rtl" {
  const strong = /\p{Letter}/u.exec(blockText(node as TextNode));
  return strong && rtlLetter.test(strong[0]) ? "rtl" : "ltr";
}
