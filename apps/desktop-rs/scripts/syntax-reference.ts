// Development-only extraction from the exact Shiki themes used by the current client.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const scopes: Record<string, string> = {
  attribute: "entity.other.attribute-name",
  boolean: "constant.language.boolean",
  comment: "comment",
  comment_doc: "comment",
  constant: "constant",
  constructor: "entity.name.function",
  function: "entity.name.function",
  keyword: "keyword",
  number: "constant.numeric",
  operator: "keyword.operator",
  property: "meta.property-name",
  punctuation: "variable.other",
  "punctuation.bracket": "variable.other",
  "punctuation.delimiter": "variable.other",
  string: "string",
  "string.escape": "constant.character.escape",
  "string.regex": "string.regexp",
  tag: "entity.name.tag",
  type: "entity.name.type",
  variable: "variable.other",
  preproc: "keyword",
  label: "entity.name",
  embedded: "variable.other",
};
const provenance = {
  version: 1,
  reference: "apps/web-client/src/features/conversation/lib/code-highlight.ts",
  sources: [] as { theme: string; module: string; sha256: string }[],
  mapping: scopes,
};
for (const mode of ["light", "dark"]) {
  const path = Bun.resolveSync(
    `shiki/themes/github-${mode}-default.mjs`,
    resolve(root, "apps/web-client/src"),
  );
  const theme = (await import(path)).default;
  function color(scope: string) {
    let result = theme.colors["editor.foreground"],
      specificity = -1;
    for (const token of theme.tokenColors) {
      for (const candidate of [token.scope].flat()) {
        if (typeof candidate !== "string") continue;
        for (const s of candidate.split(",").map((s: string) => s.trim())) {
          if (
            (scope === s || scope.startsWith(`${s}.`)) &&
            s.length >= specificity &&
            token.settings.foreground
          ) {
            result = token.settings.foreground;
            specificity = s.length;
          }
        }
      }
    }
    return result;
  }
  const syntax = Object.fromEntries(
    Object.entries(scopes).map(([key, scope]) => [key, { color: color(scope) }]),
  );
  const style = {
    "editor.background": theme.colors["editor.background"],
    "editor.foreground": theme.colors["editor.foreground"],
    "editor.line_number": theme.colors["editorLineNumber.foreground"],
    "editor.active_line_number": theme.colors["editorLineNumber.activeForeground"],
    syntax,
  };
  await writeFile(
    resolve(root, `apps/desktop-rs/assets/syntax-${mode}.json`),
    `${JSON.stringify({ name: theme.name, appearance: mode, style }, null, 2)}\n`,
  );
  provenance.sources.push({
    theme: theme.name,
    module: path.slice(root.length + 1),
    sha256: createHash("sha256")
      .update(await readFile(path))
      .digest("hex"),
  });
}
await writeFile(
  resolve(root, "apps/desktop-rs/verification/nma-067/syntax-provenance.json"),
  `${JSON.stringify(provenance, null, 2)}\n`,
);
