/** Actual static renderer contracts: readable Markdown and no active embedded content. */
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TextPreview } from "./components/text-preview";

const render = (body: string, type = "text/markdown") =>
  renderToStaticMarkup(createElement(TextPreview, { body, type }));
const markdown = render(
  "# Judul\n\n- Satu\n- Dua\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```text\ncontoh\n```\n\n$x^2$\n",
);
for (const tag of ["h1", "ul", "li", "table", "code", "math"]) {
  assert.match(markdown, new RegExp(`<${tag}[ >]`), `Markdown renders ${tag}`);
}
const hostile = render(
  '![tracking](https://example.com/pixel.png)\n\n<script>alert(1)</script>\n<iframe src="https://example.com"></iframe>\n\n[unsafe](javascript:alert(1))',
);
assert.doesNotMatch(hostile, /<(script|iframe|img)[ >]/i);
assert.doesNotMatch(hostile, /href="javascript:/i);
assert.match(hostile, /tracking/);
assert.match(render("# Plain", "text/plain"), /<pre/);
assert.doesNotMatch(render("# Plain", "text/plain"), /<h1/);
const csv = render('a,b\n"two, cells","line\nnext"', "text/csv");
assert.match(csv, /two, cells/);
assert.match(csv, /line\nnext/);
assert.match(render("a".repeat(200001), "text/plain"), /200.000 karakter/);
assert.match(render("\\[\n\\frac{1}{2}\n\\]"), /<math[ >]/);
assert.match(render("\\[x^2\\]"), /<math[ >]/);
assert.doesNotMatch(render("```text\n\\[\nx^2\n\\]\n```"), /<math[ >]/);
console.log("Artifacts: 17 rendering, isolation, source and limit contracts passed");
