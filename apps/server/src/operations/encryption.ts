import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  appendFileSync,
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fsyncSync,
  openSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { pipeline } from "node:stream/promises";
import { privateFile } from "./files";

const magic = Buffer.from("NGERTIIN-BACKUP-1\n");
const headerSize = magic.length + 12;

/** Streaming authenticated encryption; plaintext never leaves the operator's private storage. */
export async function encryptBackup(source: string, destination: string, keyPath: string) {
  const key = privateFile(keyPath, 32);
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(magic);
  writeFileSync(destination, Buffer.concat([magic, nonce]), { mode: 0o600, flag: "wx" });
  try {
    await pipeline(
      createReadStream(source),
      cipher,
      createWriteStream(destination, { flags: "a" }),
    );
    appendFileSync(destination, cipher.getAuthTag());
    const fd = openSync(destination, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    rmSync(destination, { force: true });
    throw new Error("Backup encryption failed.");
  } finally {
    key.fill(0);
  }
}

/** Authenticate the entire envelope before any archive extraction or database mutation. */
export async function decryptBackup(source: string, destination: string, keyPath: string) {
  if (existsSync(destination)) throw new Error("Backup plaintext destination already exists.");
  const key = privateFile(keyPath, 32);
  const size = statSync(source).size;
  const header = Buffer.alloc(headerSize);
  const tag = Buffer.alloc(16);
  const fd = openSync(source, "r");
  try {
    if (size <= headerSize + 16) throw new Error("Invalid backup envelope.");
    readSync(fd, header, 0, header.length, 0);
    readSync(fd, tag, 0, tag.length, size - 16);
    if (!header.subarray(0, magic.length).equals(magic))
      throw new Error("Invalid backup envelope.");
    const decipher = createDecipheriv("aes-256-gcm", key, header.subarray(magic.length));
    decipher.setAAD(magic);
    decipher.setAuthTag(tag);
    await pipeline(
      createReadStream(source, { start: headerSize, end: size - 17 }),
      decipher,
      createWriteStream(destination, { mode: 0o600, flags: "wx" }),
    );
  } catch {
    rmSync(destination, { force: true });
    throw new Error("Backup authentication failed; no restore was attempted.");
  } finally {
    key.fill(0);
    closeSync(fd);
  }
}
