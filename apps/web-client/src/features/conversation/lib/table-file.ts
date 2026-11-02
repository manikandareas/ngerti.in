import Papa from "papaparse";

export interface TextTable {
  headers: string[];
  rows: string[][];
}
export const FILE_PREVIEW_MAX_BYTES = 128_000;
const MAX_ROWS = 100_000;
const MAX_COLUMNS = 200;
const MAX_CELLS = 500_000;

export function tableDelimiter(name: string): "," | "\t" | null {
  return /\.csv$/i.test(name) ? "," : /\.tsv$/i.test(name) ? "\t" : null;
}

// OpenMausBot 7124ebc4 table-data.ts. Keep strings, quoted delimiters and long IDs intact.
export function parseTableFile(text: string, delimiter: "," | "\t"): TextTable {
  if (text.includes("\0")) throw new Error("format");
  const parsed = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    delimiter,
    skipEmptyLines: true,
    preview: MAX_ROWS + 2,
  });
  if (parsed.errors.length) throw new Error("format");
  const [headers = [], ...rows] = parsed.data;
  const columns = Math.max(headers.length, ...rows.slice(0, 1).map((row) => row.length));
  if (rows.length > MAX_ROWS || parsed.meta.truncated || columns > MAX_COLUMNS)
    throw new Error("size");
  let cells = headers.length;
  for (const row of rows) {
    cells += row.length;
    if (cells > MAX_CELLS || row.length > MAX_COLUMNS) throw new Error("size");
    if (row.length !== headers.length) throw new Error("columns");
  }
  return { headers, rows };
}
