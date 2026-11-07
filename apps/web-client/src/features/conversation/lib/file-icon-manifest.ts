import { fileLanguage } from "./file-format.js";

export const FILE_ICON_BASE = "/file-icons/material-5.40.0";
export type IconAssociations = {
  file?: string;
  folder?: string;
  folderExpanded?: string;
  fileNames?: Record<string, string>;
  fileExtensions?: Record<string, string>;
  folderNames?: Record<string, string>;
  folderNamesExpanded?: Record<string, string>;
  languageIds?: Record<string, string>;
};
export type FileIconManifest = IconAssociations & {
  icons: Record<string, string>;
  light?: IconAssociations;
};

export function resolveFileIcon(
  manifest: FileIconManifest,
  path: string,
  options: { folder?: boolean; expanded?: boolean; light?: boolean; mediaType?: string } = {},
): string | undefined {
  const parts = path.toLowerCase().split("/");
  const name = parts.at(-1) ?? "";
  const names = parts.length > 1 ? [parts.slice(-2).join("/"), name] : [name];
  const themed = options.light ? manifest.light : undefined;
  const own = (table: Record<string, string> | undefined, value: string) =>
    table && Object.hasOwn(table, value) ? table[value] : undefined;
  const lookup = (key: keyof IconAssociations, values: string[]) => {
    const base = manifest[key];
    const light = themed?.[key];
    for (const value of values) {
      const icon =
        (typeof light === "object" ? own(light, value) : undefined) ??
        (typeof base === "object" ? own(base, value) : undefined);
      if (icon) return icon;
    }
    return undefined;
  };
  const fallback = (key: "file" | "folder" | "folderExpanded") => themed?.[key] ?? manifest[key];
  let id: string | undefined;
  if (options.folder) {
    id =
      (options.expanded ? lookup("folderNamesExpanded", names) : undefined) ??
      lookup("folderNames", names) ??
      (options.expanded ? fallback("folderExpanded") : undefined) ??
      fallback("folder");
  } else {
    const extensions = name
      .split(".")
      .slice(1)
      .map((_, index, segments) => segments.slice(index).join("."));
    const extensionKeys = extensions.flatMap((extension) =>
      parts.length > 1 ? [`${parts.at(-2)}/${extension}`, extension] : [extension],
    );
    const language = fileLanguage(name);
    const mime = options.mediaType ?? "";
    const mediaIcon = mime.startsWith("image/")
      ? "image"
      : mime === "application/pdf"
        ? "pdf"
        : undefined;
    id =
      lookup("fileNames", names) ??
      lookup("fileExtensions", extensionKeys) ??
      (language ? lookup("languageIds", [language]) : undefined) ??
      mediaIcon ??
      fallback("file");
  }
  const filename = id ? own(manifest.icons, id) : undefined;
  return filename ? `${FILE_ICON_BASE}/${filename}` : undefined;
}
