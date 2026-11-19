import { z } from "zod";
import { DomainError } from "../contracts";
import { relativePath } from "./contracts";
import { allowedPath } from "./files";
import type { Workspaces } from "./service";

export const searchFilesInput = z.strictObject({
  query: z
    .string()
    .trim()
    .min(1)
    .max(300)
    .refine((value) => !/[\r\n]/.test(value), "Search text must fit on one line."),
  directory: z.union([z.literal(""), relativePath]).default(""),
  limit: z.int().min(1).max(30).default(12),
});

const scanLimit = 240;
const scanTimeMs = 15_000;
const fileSizeLimit = 64 * 1024;

async function readText(files: Awaited<ReturnType<Workspaces["workingFiles"]>>, path: string) {
  let bytes: Uint8Array;
  try {
    bytes = await files.read(path, fileSizeLimit);
  } catch (error) {
    if (
      error instanceof DomainError &&
      (["NOT_FOUND", "SCOPE_DENIED", "CONFLICT"].includes(error.code) || error.status === 413)
    )
      return null;
    throw error;
  }
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export async function searchFiles(
  files: Awaited<ReturnType<Workspaces["workingFiles"]>>,
  { query, directory, limit }: z.infer<typeof searchFilesInput>,
  authorize: () => Promise<void>,
) {
  if (directory) allowedPath(directory);
  const directories = [{ path: directory, after: "" }];
  const matches: { path: string; line: number; text: string }[] = [];
  const deadline = Date.now() + scanTimeMs;
  let entries = 0;
  let files_scanned = 0;
  const exhausted = () => entries >= scanLimit || Date.now() >= deadline;
  while (directories.length && !exhausted()) {
    const current = directories.shift();
    if (!current) break;
    await authorize();
    const page = await files.list(current.path, current.after, Math.min(40, scanLimit - entries));
    if (page.next_after) directories.push({ path: current.path, after: page.next_after });
    for (const entry of page.entries) {
      if (exhausted()) return { matches, files_scanned, truncated: true };
      entries++;
      try {
        allowedPath(entry.path);
      } catch {
        continue;
      }
      if (entry.type === "directory") {
        directories.push({ path: entry.path, after: "" });
        continue;
      }
      if (entry.type !== "file") continue;
      await authorize();
      const text = await readText(files, entry.path);
      if (text === null) continue;
      files_scanned++;
      for (const [line, content] of text.split(/\r?\n/).entries()) {
        const index = content.indexOf(query);
        if (index < 0) continue;
        if (matches.length === limit) return { matches, files_scanned, truncated: true };
        const start = Math.max(0, index - 80);
        matches.push({
          path: entry.path,
          line: line + 1,
          text: content.slice(start, index + query.length + 80),
        });
      }
    }
  }
  return { matches, files_scanned, truncated: directories.length > 0 };
}
