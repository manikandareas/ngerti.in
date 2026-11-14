import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { HarnessError } from "./contracts";

/** Private host files are the only persistent carrier of submitted provider keys. */
export class CredentialStorage {
  constructor(
    readonly root: string,
    readonly keyFile = process.env.NGERTIIN_PROVIDER_MASTER_KEY_FILE,
  ) {}

  private key() {
    if (!this.keyFile) throw new HarnessError("CREDENTIAL_MISSING");
    const info = lstatSync(this.keyFile);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size !== 32)
      throw new HarnessError("CREDENTIAL_MISSING");
    return readFileSync(this.keyFile);
  }
  read(reference: string, requireEncrypted = false) {
    if (!/^[a-f0-9-]{36}$/i.test(reference)) throw new HarnessError("CREDENTIAL_MISSING");
    const file = join(this.root, "credentials", reference);
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size > 65536)
      throw new HarnessError("CREDENTIAL_MISSING");
    const value = readFileSync(file, "utf8").trim();
    if (!value.startsWith("ngertiin-v1:")) {
      if (requireEncrypted) throw new HarnessError("CREDENTIAL_MISSING");
      return value;
    }
    const bytes = Buffer.from(value.slice("ngertiin-v1:".length), "base64");
    const decipher = createDecipheriv("aes-256-gcm", this.key(), bytes.subarray(0, 12));
    decipher.setAAD(Buffer.from(reference));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
  }

  write(value: string, encrypted = false) {
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
    if (encrypted) {
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.key(), nonce);
      cipher.setAAD(Buffer.from(reference));
      const ciphertext = Buffer.concat([cipher.update(value.trim(), "utf8"), cipher.final()]);
      value = `ngertiin-v1:${Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
    }
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
  assertActive(connectionId: string) {
    try {
      lstatSync(join(this.revocations, connectionId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    throw new HarnessError("AUTH_REJECTED");
  }
  private get revocations() {
    return process.env.NGERTIIN_PROVIDER_REVOCATIONS_DIR ?? join(this.root, "provider-revocations");
  }
  retire(connectionId: string, credentialReference?: string) {
    if (!/^[a-f0-9-]{36}$/i.test(connectionId)) throw new HarnessError("AUTH_REJECTED");
    mkdirSync(this.revocations, { recursive: true, mode: 0o700 });
    const file = join(this.revocations, connectionId);
    const fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    try {
      writeFileSync(fd, "revoked\n");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const directory = openSync(
      this.revocations,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
    rmSync(join(this.root, "connections", connectionId), { recursive: true, force: true });
    if (credentialReference)
      rmSync(join(this.root, "credentials", credentialReference), { force: true });
  }
}
