import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { authenticationOwnershipSql } from "../../src/auth/ownership-schema";
import { createAuthenticationProvider } from "../../src/auth/provider";

test("retained authentication schema exactly matches the pinned plugins", async () => {
  const schema = `auth_schema_${crypto.randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({
    connectionString: process.env.NGERTIIN_TEST_DATABASE_URL,
    options: `-c search_path=${schema},pg_catalog`,
  });
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const auth = createAuthenticationProvider(
      {
        mode: "accounts",
        origin: "https://auth.example.test",
        secret: randomBytes(48).toString("hex"),
        schema,
        nativeRedirectUri: "http://127.0.0.1:43119/callback",
        allowInsecureLoopback: false,
        email: { from: "Ngertiin <auth@example.test>", apiKey: "fixture" },
      },
      pool,
      async () => {},
      () => {},
    );
    const migration = await getMigrations(auth.options);
    const generated = `${await migration.compileMigrations()}\n\n${authenticationOwnershipSql}\n`;
    const file = new URL("../../src/auth/schema.sql", import.meta.url);
    if (process.env.NGERTIIN_WRITE_AUTH_SCHEMA === "1") await writeFile(file, generated);
    expect(await readFile(file, "utf8")).toBe(generated);
  } finally {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
