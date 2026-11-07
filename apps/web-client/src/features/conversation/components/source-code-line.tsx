import { type CSSProperties, Fragment, memo, type ReactNode } from "react";
import type { ThemedToken } from "shiki/core";
import type { SourceMatch } from "../lib/source-search";

export const SourceCodeLine = memo(function SourceCodeLine({
  text,
  tokens,
  matches,
  active,
}: {
  text: string;
  tokens?: ThemedToken[];
  matches?: SourceMatch[];
  active: number;
}) {
  const parts: ReactNode[] = [];
  let offset = 0;
  for (const [index, token] of (tokens ?? [{ content: text }]).entries()) {
    const content: ReactNode[] = [];
    const end = offset + token.content.length;
    let cursor = offset;
    for (const match of matches ?? []) {
      const start = Math.max(match.start, offset);
      const stop = Math.min(match.end, end);
      if (start >= stop) continue;
      if (start > cursor) content.push(token.content.slice(cursor - offset, start - offset));
      content.push(
        <mark key={`${match.index}:${start}`} data-active={match.index === active}>
          {token.content.slice(start - offset, stop - offset)}
        </mark>,
      );
      cursor = stop;
    }
    if (cursor < end) content.push(token.content.slice(cursor - offset));
    if ("htmlStyle" in token)
      parts.push(
        <span
          key={index}
          style={token.htmlStyle as CSSProperties}
          className="text-(--shiki-light) dark:text-(--shiki-dark)"
        >
          {content}
        </span>,
      );
    else parts.push(<Fragment key={index}>{content}</Fragment>);
    offset = end;
  }
  return <>{parts.length ? parts : "\u200b"}</>;
});
