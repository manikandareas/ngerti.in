import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
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
        email: { delivery: "resend", from: "Ngertiin <auth@example.test>", apiKey: "fixture" },
      },
      pool,
      async () => {},
      () => {},
    );
    // Version 1 is immutable. Version 2 adds the organization plugin to an existing auth DB.
    await pool.query(await readFile(new URL("../../src/auth/schema.sql", import.meta.url), "utf8"));
    // Retained migrations use the pool search path; normalize generation only, while runtime stays schema-qualified.
    const migration = await getMigrations({ ...auth.options, database: pool });
    const generated = `${await migration.compileMigrations()}\n`;
    const file = new URL("../../src/organizations/provider-schema.sql", import.meta.url);
    if (process.env.NGERTIIN_WRITE_ORGANIZATION_SCHEMA === "1") await writeFile(file, generated);
    expect(await readFile(file, "utf8")).toBe(generated);
    await pool.query(generated);
    await pool.query(
      await readFile(new URL("../../src/organizations/schema.sql", import.meta.url), "utf8"),
    );
    const applied = await getMigrations(auth.options);
    expect({
      created: applied.toBeCreated,
      added: applied.toBeAdded,
      indexes: applied.toBeAddedIndexes,
      problems: applied.schemaProblems,
      unsafe: applied.unsafeChanges,
    }).toEqual({ created: [], added: [], indexes: [], problems: [], unsafe: [] });
  } finally {
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
