const languages: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  json: "json",
  jsonc: "jsonc",
  json5: "json5",
  go: "go",
  py: "python",
  rb: "ruby",
  rs: "rust",
  php: "php",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  swift: "swift",
  dart: "dart",
  r: "r",
  lua: "lua",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  ps1: "powershell",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  md: "markdown",
  mdx: "mdx",
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
  proto: "proto",
  diff: "diff",
  patch: "diff",
  dockerfile: "dockerfile",
};

/** Filename matching is independent of the case-sensitive path used for actual reads. */
export function fileLanguage(name: string): string | undefined {
  const base = name.split("/").at(-1)?.toLowerCase() ?? "";
  if (/^(dockerfile|containerfile)(\..+)?$/.test(base)) return "dockerfile";
  if (/^(makefile|gnumakefile)(\..+)?$/.test(base) || base.endsWith(".mk")) return "makefile";
  if (/^\.(bashrc|bash_profile|zshrc|zprofile)$/.test(base)) return "bash";
  if (/^\.env(\..+)?$/.test(base)) return "bash";
  const extension = base.split(".").at(-1) ?? "";
  return Object.hasOwn(languages, extension) ? languages[extension] : undefined;
}

export function isTextFile(name: string, mediaType = ""): boolean {
  return (
    !!fileLanguage(name) ||
    /\.(txt|csv|tsv|log|ini|conf|config|gitignore|editorconfig)$/i.test(name) ||
    /^(text\/|application\/(json|[^;]+\+json|xml|[^;]+\+xml|javascript))/.test(mediaType) ||
    /^(readme|license|licence|changelog|notice)$/i.test(name.split("/").at(-1) ?? "")
  );
}
