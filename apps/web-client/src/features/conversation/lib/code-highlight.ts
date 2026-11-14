// OpenMausBot 0.1.137 CodeBlock grammar/theme loading, rendered as escaped React text tokens.
import { type CSSProperties, createElement, type ReactNode } from "react";
import type { HighlighterCore, ThemedToken } from "shiki/core";
import { assertScope, clientScope, onScopeChange, scopedStorageKey } from "@/lib/client-scope";

const LIGHT_THEME = "github-light-default";
const DARK_THEME = "github-dark-default";
const grammarLoaders = {
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  jsonc: () => import("shiki/langs/jsonc.mjs"),
  json5: () => import("shiki/langs/json5.mjs"),
  bash: () => import("shiki/langs/bash.mjs"),
  powershell: () => import("shiki/langs/powershell.mjs"),
  fish: () => import("shiki/langs/fish.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  scss: () => import("shiki/langs/scss.mjs"),
  sass: () => import("shiki/langs/sass.mjs"),
  less: () => import("shiki/langs/less.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  mdx: () => import("shiki/langs/mdx.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  xml: () => import("shiki/langs/xml.mjs"),
  c: () => import("shiki/langs/c.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  rust: () => import("shiki/langs/rust.mjs"),
  go: () => import("shiki/langs/go.mjs"),
  ruby: () => import("shiki/langs/ruby.mjs"),
  php: () => import("shiki/langs/php.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  kotlin: () => import("shiki/langs/kotlin.mjs"),
  swift: () => import("shiki/langs/swift.mjs"),
  dart: () => import("shiki/langs/dart.mjs"),
  r: () => import("shiki/langs/r.mjs"),
  lua: () => import("shiki/langs/lua.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  graphql: () => import("shiki/langs/graphql.mjs"),
  proto: () => import("shiki/langs/proto.mjs"),
  dockerfile: () => import("shiki/langs/dockerfile.mjs"),
  makefile: () => import("shiki/langs/makefile.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  wasm: () => import("shiki/langs/wasm.mjs"),
};
type GrammarFile = keyof typeof grammarLoaders;
const grammarAlias: Record<string, GrammarFile> = {
  js: "javascript",
  node: "javascript",
  ts: "typescript",
  sh: "bash",
  zsh: "bash",
  shell: "bash",
  ps1: "powershell",
  py: "python",
  htm: "html",
  yml: "yaml",
  md: "markdown",
  svg: "xml",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  cs: "csharp",
  "c#": "csharp",
  rs: "rust",
  golang: "go",
  rb: "ruby",
  kt: "kotlin",
  gql: "graphql",
  protobuf: "proto",
  docker: "dockerfile",
  make: "makefile",
};
const PLAIN_LANGS = new Set(["", "text", "txt", "plaintext", "plain"]);
let highlighterPromise: Promise<HighlighterCore> | undefined;
const grammarLoading = new Map<string, Promise<void>>();

function grammarFile(lang: string): GrammarFile | undefined {
  const alias = grammarAlias[lang];
  if (alias) return alias;
  return Object.hasOwn(grammarLoaders, lang) ? (lang as GrammarFile) : undefined;
}

function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterPromise) return highlighterPromise;
  const created = (async () => {
    const { createHighlighterCore } = await import("shiki/core");
    const { createJavaScriptRegexEngine } = await import("shiki/engine/javascript");
    return createHighlighterCore({
      themes: [
        import("shiki/themes/github-light-default.mjs").then((mod) => mod.default),
        import("shiki/themes/github-dark-default.mjs").then((mod) => mod.default),
      ],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    });
  })().catch((error: unknown) => {
    highlighterPromise = undefined;
    throw error;
  });
  highlighterPromise = created;
  return created;
}

function loadGrammar(highlighter: HighlighterCore, file: GrammarFile): Promise<void> {
  const pending = grammarLoading.get(file);
  if (pending) return pending;
  const next = grammarLoaders[file]()
    .then((mod) => highlighter.loadLanguage(mod.default))
    .catch((error: unknown) => {
      grammarLoading.delete(file);
      throw error;
    });
  grammarLoading.set(file, next);
  return next;
}

const cache = new Map<string, { tokens: ThemedToken[][]; lines?: ReactNode[][]; size: number }>();
export const HIGHLIGHT_MAX_CHARS = 100_000;
export async function highlightTokens(code: string, lang: string): Promise<ThemedToken[][] | null> {
  if (code.length > HIGHLIGHT_MAX_CHARS) return null;
  const scope = clientScope();
  const key = scopedStorageKey(`${lang}:${code}`, scope);
  const cached = cache.get(key);
  if (cached) return cached.tokens;
  const highlighter = await getHighlighter();
  const requested = lang.trim().toLowerCase();
  const plain = PLAIN_LANGS.has(requested);
  const file = plain ? undefined : grammarFile(requested);
  if (!plain && !file) return null;
  if (file) await loadGrammar(highlighter, file);
  assertScope(scope);
  const tokens = highlighter.codeToTokens(code, {
    lang: file ?? "text",
    themes: { light: LIGHT_THEME, dark: DARK_THEME },
    defaultColor: false,
  }).tokens;
  const size = key.length + JSON.stringify(tokens).length;
  if (size <= 4 * 1024 * 1024) {
    cache.set(key, { tokens, size });
    let total = [...cache.values()].reduce((sum, item) => sum + item.size, 0);
    for (const [oldest, item] of cache) {
      if (cache.size <= 200 && total <= 4 * 1024 * 1024) break;
      cache.delete(oldest);
      total -= item.size;
    }
  }
  return tokens;
}

export async function highlightSnippet(code: string, lang: string): Promise<ReactNode[][] | null> {
  const scope = clientScope();
  const key = scopedStorageKey(`${lang}:${code}`, scope);
  const cached = cache.get(key);
  if (cached?.lines) return cached.lines;
  const tokens = await highlightTokens(code, lang);
  if (!tokens) return null;
  assertScope(scope);
  const lines = tokens.map((line) =>
    line.map((token, index) =>
      createElement(
        "span",
        {
          key: index,
          style: token.htmlStyle as CSSProperties,
          className: "text-(--shiki-light) dark:text-(--shiki-dark)",
        },
        token.content,
      ),
    ),
  );
  const entry = cache.get(key);
  if (entry) entry.lines = lines;
  return lines;
}

onScopeChange(() => cache.clear());
