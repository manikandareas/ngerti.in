export type MentionQuery = { start: number; end: number; query: string };

export function mentionAtCaret(text: string, start: number, end = start): MentionQuery | null {
  if (start !== end) return null;
  const match = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, start));
  if (!match) return null;
  return { start: start - match[1].length - 1, end: start, query: match[1] };
}

export function insertMention(text: string, mention: MentionQuery, handle: string) {
  // Replace the rest of a partially edited handle without losing following prose.
  const tail = text.slice(mention.end).replace(/^[\w-]*/, "");
  const prefix = `${text.slice(0, mention.start)}@${handle}`;
  const separator = tail.startsWith(" ") ? "" : " ";
  return { text: `${prefix}${separator}${tail}`, caret: prefix.length + 1 };
}
