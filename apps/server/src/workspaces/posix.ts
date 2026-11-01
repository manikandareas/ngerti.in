import { CString, cc, dlopen, type Pointer, ptr, toArrayBuffer } from "bun:ffi";
import { closeSync } from "node:fs";
import { DomainError } from "../contracts";

// Node's fs API has no openat. Descriptor-relative traversal avoids ancestor-swap races;
// /dev/fd/<directory>/<name> is not traversable on macOS.
const darwin = process.platform === "darwin";
const library = dlopen(darwin ? "/usr/lib/libSystem.B.dylib" : "libc.so.6", {
  mkdirat: { args: ["i32", "ptr", "i32"], returns: "i32" },
  dup: { args: ["i32"], returns: "i32" },
  fdopendir: { args: ["i32"], returns: "ptr" },
  readdir: { args: ["ptr"], returns: "ptr" },
  closedir: { args: ["ptr"], returns: "i32" },
  [darwin ? "__error" : "__errno_location"]: { args: [], returns: "ptr" },
});
const fixed = cc({
  source: new URL("./openat.c", import.meta.url),
  symbols: { workspace_openat: { args: ["i32", "ptr", "i32", "i32"], returns: "i32" } },
});
function failure(): never {
  const address = library.symbols[darwin ? "__error" : "__errno_location"]();
  const code = address ? new Int32Array(toArrayBuffer(address as Pointer, 0, 4))[0] : 0;
  throw new DomainError(code === 2 ? "NOT_FOUND" : "SCOPE_DENIED", code === 2 ? 404 : 403);
}
export function openAt(directory: number, name: string, flags: number, mode = 0) {
  const bytes = Buffer.from(`${name}\0`);
  const descriptor = fixed.symbols.workspace_openat(directory, ptr(bytes), flags, mode);
  if (descriptor < 0) failure();
  return descriptor;
}
export function mkdirAt(directory: number, name: string) {
  const bytes = Buffer.from(`${name}\0`);
  if (library.symbols.mkdirat(directory, ptr(bytes), 0o700) !== 0) {
    const address = library.symbols[darwin ? "__error" : "__errno_location"]();
    if (!address || new Int32Array(toArrayBuffer(address as Pointer, 0, 4))[0] !== 17) failure();
  }
}
export function readDirectory(directory: number) {
  const duplicate = library.symbols.dup(directory);
  if (duplicate < 0) failure();
  const stream = library.symbols.fdopendir(duplicate);
  if (!stream) {
    closeSync(duplicate);
    throw new DomainError("SCOPE_DENIED", 403);
  }
  const entries: { name: string; type: "file" | "directory" | "unsupported" }[] = [];
  try {
    while (true) {
      const item = library.symbols.readdir(stream);
      if (!item) break;
      const name = String(new CString(item, darwin ? 21 : 19));
      const type = new Uint8Array(toArrayBuffer(item, darwin ? 20 : 18, 1))[0];
      if (name === "." || name === ".." || type === 10) continue;
      entries.push({ name, type: type === 4 ? "directory" : type === 8 ? "file" : "unsupported" });
      if (entries.length > 100_000) throw new DomainError("INVALID_REQUEST", 413);
    }
  } finally {
    library.symbols.closedir(stream);
  }
  return entries;
}
