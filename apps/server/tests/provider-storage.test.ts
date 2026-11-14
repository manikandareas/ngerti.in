import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CredentialStorage } from "../src/harness/credential-storage";

test("encrypted provider credentials authenticate their identity and reject tampering or an absent master key", () => {
  const root = mkdtempSync(join(tmpdir(), "ngertiin-vault-"));
  try {
    const keyFile = join(root, "operator-key");
    writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
    const vault = new CredentialStorage(root, keyFile);
    const reference = vault.write("selected-private-secret", true);
    const file = join(root, "credentials", reference);
    expect(readFileSync(file, "utf8")).not.toContain("selected-private-secret");
    expect(vault.read(reference, true)).toBe("selected-private-secret");
    const relocated = crypto.randomUUID();
    writeFileSync(join(root, "credentials", relocated), readFileSync(file), { mode: 0o600 });
    expect(() => vault.read(relocated, true)).toThrow();
    expect(() => new CredentialStorage(root, "").read(reference, true)).toThrow(
      "CREDENTIAL_MISSING",
    );
    const plain = vault.write("legacy-only");
    expect(() => vault.read(plain, true)).toThrow("CREDENTIAL_MISSING");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("revocation removes native files and the credential; retained tombstones fence restored native homes", () => {
  const root = mkdtempSync(join(tmpdir(), "ngertiin-retirement-"));
  try {
    const vault = new CredentialStorage(root);
    const connection = crypto.randomUUID();
    const reference = vault.write("old-secret");
    const native = join(root, "connections", connection, "codex");
    mkdirSync(native, { recursive: true });
    writeFileSync(join(native, "auth.json"), "old-auth");
    vault.retire(connection, reference);
    expect(() => vault.read(reference)).toThrow();
    mkdirSync(native, { recursive: true });
    writeFileSync(join(native, "auth.json"), "restored-old-auth");
    expect(() => vault.assertActive(connection)).toThrow("AUTH_REJECTED");
    vault.retire(connection, reference);
    expect(() => vault.assertActive(crypto.randomUUID())).not.toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
