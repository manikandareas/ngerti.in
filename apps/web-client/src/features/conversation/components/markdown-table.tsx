import { Children, isValidElement, type ReactElement, type ReactNode, useMemo } from "react";
import { RichTable } from "@/features/conversation/components/rich-table";
import type { TableCell, TableColumn } from "@/features/conversation/components/table-viewport";

type Element = ReactElement<{ children?: ReactNode; align?: string; alt?: string }>;
const elements = (children: ReactNode): Element[] =>
  Children.toArray(children).filter(isValidElement) as Element[];
export function plainMarkdown(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainMarkdown).join("");
  if (!isValidElement(node)) return "";
  const element = node as Element;
  if (element.type === "br") return "\n";
  return plainMarkdown(element.props.children) || element.props.alt || "";
}

// OpenMausBot MarkdownTable.tsx: preserve react-markdown's sanitized cell children.
export function MarkdownTable({
  children,
  direction,
}: {
  children?: ReactNode;
  direction?: "ltr" | "rtl";
}) {
  const data = useMemo(() => {
    const sections = elements(children);
    const head = sections.find((section) => section.type === "thead");
    const body = sections.find((section) => section.type === "tbody");
    const cell = (element: Element): TableCell => ({
      text: plainMarkdown(element.props.children),
      content: element.props.children,
    });
    const columns: TableColumn[] = elements(elements(head?.props.children)[0]?.props.children).map(
      (element, index) => ({
        id: `column-${index}`,
        ...cell(element),
        align:
          element.props.align === "left" ||
          element.props.align === "right" ||
          element.props.align === "center"
            ? element.props.align
            : undefined,
      }),
    );
    const rows = elements(body?.props.children).map((row) =>
      elements(row.props.children).map(cell),
    );
    return { columns, rows };
  }, [children]);
  return <RichTable {...data} direction={direction} />;
}
