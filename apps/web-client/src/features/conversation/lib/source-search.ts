export type SourceMatch = { line: number; start: number; end: number; index: number };

export function searchSource(lines: string[], query: string): SourceMatch[] {
  if (!query) return [];
  const needle = query.toLowerCase();
  const matches: SourceMatch[] = [];
  for (const [line, text] of lines.entries()) {
    const haystack = text.toLowerCase();
    let start = haystack.indexOf(needle);
    while (start !== -1) {
      matches.push({ line, start, end: start + needle.length, index: matches.length });
      start = haystack.indexOf(needle, start + Math.max(needle.length, 1));
    }
  }
  return matches;
}
