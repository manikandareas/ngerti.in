// Development-only vectors from the current source/table presentation helpers.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileLanguage } from "../../web-client/src/features/conversation/lib/file-format";
import {
  columnMinimums,
  isTableNumber,
  tableCsv,
  tableRowOrder,
} from "../../web-client/src/features/conversation/lib/table-data";
import { parseTableFile } from "../../web-client/src/features/conversation/lib/table-file";

const root = resolve(import.meta.dir, "../../..");
const source = await readFile(
  resolve(root, "apps/web-client/src/features/conversation/lib/file-format.ts"),
  "utf8",
);
const extensions = [...source.matchAll(/^ {2}(\w+): "/gm)].map((m) => m[1]);
const names = [
  ...extensions.map((ext) => `sample.${ext}`),
  "Dockerfile",
  "CONTAINERFILE.dev",
  "Makefile",
  "Makefile.release",
  "GNUMAKEFILE.local",
  "build.mk",
  ".bashrc",
  ".bash_profile",
  ".zshrc",
  ".zprofile",
  ".env",
  ".env.local",
  "unknown.txt",
];
const headers = ["Name", "Amount"];
const rows = [
  "Alpha",
  "a2",
  "a10",
  "éclair",
  "Eclair",
  "foo20",
  "foo3",
  "9223372036854775808",
  "9223372036854775807",
  "",
  "  ",
  "-2",
  "+3",
  "1e400",
  "1e-2",
  "banana",
].map((value, i) => [value, String(i)]);
const fileTables = [
  "",
  "\n",
  "a,b\n1,2\n",
  "\na,b\n\n1,2\n",
  "a,b\n1",
  "a\n1,2",
  'a,b\n"one,two","three\nfour"',
  'a,b\n"unclosed',
  'a,b\n"two""words",ok',
  "\ufeffa\tb\r\n1\t2\r\n",
  "a,b\n,",
  'a\n""',
  ["x"].concat(Array(200).fill("y")).join(","),
].map((text) => {
  const delimiter = text.includes("\t") ? "\t" : ",";
  try {
    return { text, delimiter, accepted: true, table: parseTableFile(text, delimiter) };
  } catch {
    return { text, delimiter, accepted: false };
  }
});
await writeFile(
  resolve(root, "apps/desktop-rs/verification/nma-067/content-reference.json"),
  `${JSON.stringify({ version: 1, file_tables: fileTables, locale: new Intl.Collator().resolvedOptions().locale, file_cases: names.map((name) => ({ name, language: fileLanguage(name) ?? "text" })), table: { headers, rows, minimums: columnMinimums(headers, rows), csv: tableCsv(headers, rows), orders: [false, true].map((descending) => ({ descending, order: tableRowOrder(rows, "", { column: 0, descending }) })), numbers: rows.map((row) => isTableNumber(row[0] ?? "")) } }, null, 2)}\n`,
);
