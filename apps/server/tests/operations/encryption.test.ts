import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptBackup, encryptBackup } from "../../src/operations/encryption";

test("backup authenticates large opaque bytes and fails before exposing tampered plaintext", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ngertiin-backup-"));
  try {
    const key = join(directory, "key");
    const source = join(directory, "source");
    const encrypted = join(directory, "encrypted");
    const restored = join(directory, "restored");
    writeFileSync(key, randomBytes(32), { mode: 0o600 });
    const bytes = randomBytes(2 * 1024 * 1024 + 113);
    writeFileSync(source, bytes);
    await encryptBackup(source, encrypted, key);
    expect(readFileSync(encrypted).includes(bytes.subarray(100, 200))).toBe(false);
    await decryptBackup(encrypted, restored, key);
    expect(readFileSync(restored).equals(bytes)).toBe(true);
    await expect(decryptBackup(encrypted, restored, key)).rejects.toThrow("already exists");
    expect(readFileSync(restored).equals(bytes)).toBe(true);
    rmSync(restored);
    const corrupt = readFileSync(encrypted);
    corrupt[128] ^= 0x01;
    writeFileSync(encrypted, corrupt);
    await expect(decryptBackup(encrypted, restored, key)).rejects.toThrow("authentication failed");
    expect(existsSync(restored)).toBe(false);
    await encryptBackup(source, join(directory, "valid"), key);
    writeFileSync(key, randomBytes(32), { mode: 0o600 });
    await expect(decryptBackup(join(directory, "valid"), restored, key)).rejects.toThrow(
      "authentication failed",
    );
    expect(existsSync(restored)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
