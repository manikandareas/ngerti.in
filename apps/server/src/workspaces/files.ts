import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, parse, resolve } from "node:path";
import { DomainError } from "../contracts";
import { MAX_FILE_BYTES, relativePath } from "./contracts";
import { mkdirAt, openAt, readDirectory } from "./posix";

export const deniedWorkspaceNames = [
  ".env",
  ".ssh",
  ".aws",
  ".codex",
  ".muse",
  ".config",
  ".gnupg",
  ".netrc",
  ".npmrc",
  ".git-credentials",
];
const protectedNames = new Set(deniedWorkspaceNames);
export function allowedPath(path: string) {
  const parts = relativePath.parse(path).split("/");
  if (
    parts.some(
      (part) =>
        protectedNames.has(part.toLowerCase()) ||
        part.toLowerCase().startsWith(".env.") ||
        /\.(pem|key|p12|pfx)$/i.test(part),
    )
  )
    throw new DomainError("SCOPE_DENIED", 403);
  return parts;
}
export function canonicalDirectory(path: string) {
  if (!isAbsolute(path)) throw new DomainError("INVALID_REQUEST", 422);
  const value = resolve(path);
  let current = parse(value).root;
  for (const part of value.slice(current.length).split("/").filter(Boolean)) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new DomainError("SCOPE_DENIED", 403);
  }
  if (!lstatSync(value).isDirectory()) throw new DomainError("SCOPE_DENIED", 403);
  return realpathSync(value);
}

/** Walk directory descriptors, never a user-controlled string through an unchecked ancestor. */
export class WorkspaceFiles {
  constructor(
    readonly root: string,
    readonly device: string,
    readonly inode: string,
  ) {}
  private withParent<T>(
    path: string,
    create: boolean,
    action: (directory: number, name: string) => T,
  ): T {
    const parts = allowedPath(path);
    const handles: number[] = [];
    try {
      const root = openSync(
        this.root,
        constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
      );
      handles.push(root);
      const info = fstatSync(root);
      if (String(info.dev) !== this.device || String(info.ino) !== this.inode)
        throw new DomainError("SCOPE_DENIED", 403);
      for (const part of parts.slice(0, -1)) {
        const directory = handles.at(-1) as number;
        if (create) {
          mkdirAt(directory, part);
          fsyncSync(directory);
        }
        handles.push(
          openAt(
            directory,
            part,
            constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
          ),
        );
      }
      return action(handles.at(-1) as number, parts.at(-1) as string);
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        (error as NodeJS.ErrnoException).code === "ENOENT" ? "NOT_FOUND" : "SCOPE_DENIED",
        (error as NodeJS.ErrnoException).code === "ENOENT" ? 404 : 403,
      );
    } finally {
      for (const handle of handles.reverse()) closeSync(handle);
    }
  }
  read(path: string) {
    return this.withParent(path, false, (directory, name) => {
      const handle = openAt(
        directory,
        name,
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        const before = fstatSync(handle);
        if (!before.isFile() || before.nlink !== 1 || before.size > MAX_FILE_BYTES)
          throw new DomainError("SCOPE_DENIED", 403);
        const bytes = Buffer.alloc(before.size);
        // An fd-backed bounded read avoids FIFOs and files growing past the advertised size.
        let offset = 0;
        while (offset < bytes.length) {
          const count = readSync(handle, bytes, offset, bytes.length - offset, offset);
          if (!count) throw new DomainError("CONFLICT");
          offset += count;
        }
        if (readSync(handle, Buffer.alloc(1), 0, 1, bytes.length) !== 0)
          throw new DomainError("CONFLICT");
        const after = fstatSync(handle);
        if (
          before.mtimeMs !== after.mtimeMs ||
          before.ctimeMs !== after.ctimeMs ||
          before.size !== after.size
        )
          throw new DomainError("CONFLICT");
        return bytes;
      } finally {
        closeSync(handle);
      }
    });
  }
  create(path: string, bytes: Uint8Array) {
    if (bytes.length > MAX_FILE_BYTES) throw new DomainError("INVALID_REQUEST", 413);
    return this.withParent(path, true, (directory, name) => {
      const handle = openAt(
        directory,
        name,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
      try {
        writeFileSync(handle, bytes);
        fsyncSync(handle);
      } finally {
        closeSync(handle);
      }
      fsyncSync(directory);
    });
  }
  list(path: string, after: string, limit: number) {
    const directory = path === "" ? "." : path;
    // Use a harmless final component to retain a checked directory descriptor for readdir.
    return this.withParent(
      directory === "." ? "__listing__" : `${directory}/__listing__`,
      false,
      (directory) => {
        const entries = readDirectory(directory)
          .filter((entry) => entry.name > after)
          .filter((entry) => {
            try {
              allowedPath(entry.name);
              return true;
            } catch {
              return false;
            }
          })
          .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const page = entries.slice(0, limit).map((entry) => ({
          name: entry.name,
          path: path ? `${path}/${entry.name}` : entry.name,
          type: entry.type,
        }));
        return {
          entries: page,
          next_after: entries.length > limit ? (page.at(-1)?.name ?? null) : null,
        };
      },
    );
  }
}
