import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/** Private host files are the only persistent carrier of submitted provider keys. */
export class CredentialStorage {
  constructor(readonly root: string) {}

  write(value: string) {
    const root = lstatSync(this.root);
    if (!root.isDirectory() || root.isSymbolicLink())
      throw new Error("Credential root must be a real directory.");
    const directory = join(this.root, "credentials");
    try {
      mkdirSync(directory, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
      throw new Error("Credential directory must be private.");
    const reference = crypto.randomUUID();
    const file = join(directory, reference);
    const fd = openSync(
      file,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      try {
        writeFileSync(fd, value.trim(), "utf8");
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      // Commit both directory entries before publishing a connection referring to the key.
      for (const path of [directory, this.root]) {
        const directoryFd = openSync(
          path,
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        try {
          fsyncSync(directoryFd);
        } finally {
          closeSync(directoryFd);
        }
      }
      return reference;
    } catch (error) {
      unlinkSync(file);
      throw error;
    }
  }

  remove(reference: string) {
    unlinkSync(join(this.root, "credentials", reference));
  }
}
