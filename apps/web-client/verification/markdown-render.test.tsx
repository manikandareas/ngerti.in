import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownDocument } from "../src/features/conversation/components/answer";
import { InlineReferencesProvider } from "../src/features/conversation/components/inline-references";
import type { Snapshot } from "../src/types/workspace";

const fileId = "11111111-1111-4111-8111-111111111111";
const snapshot = {
  thread: { id: "thread", type: "dm" },
  agents: [{ id: "agent", name: "Tobi", handle: "tobi", avatar_config: null }],
  runs: [],
  goals: [],
  artifacts: [{ id: fileId, name: "report.md" }],
} as unknown as Snapshot;

function render(text: string) {
  return renderToStaticMarkup(
    <InlineReferencesProvider snapshot={snapshot}>
      <MarkdownDocument text={text} snapshot={snapshot} />
    </InlineReferencesProvider>,
  );
}

test("cached Markdown keeps plain formatting, links and GFM tables", () => {
  const html = render("**Ready** [source](https://example.com)\n\n| A | B |\n| - | - |\n| 1 | 2 |");
  expect(html).toContain("<strong>Ready</strong>");
  expect(html).toContain('href="https://example.com"');
  expect(html).toContain("<table");
});

test("reference detection preserves aliases, raw file IDs and explicit file links", () => {
  const mention = render("Ask @Tobi and @user.");
  expect(mention).toContain('data-inline-reference="agent"');
  expect(mention).toContain('data-inline-reference="user"');
  for (const text of [fileId, `Open ${fileId} please.`, `[report](ngertiin://file/${fileId})`]) {
    const html = render(text);
    expect(html).toContain("report.md");
    expect(html).toContain('data-inline-reference="file"');
  }
  expect(render("`@Tobi` /unknown-skill")).toContain("/unknown-skill");
});
