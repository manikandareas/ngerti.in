import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getMigrations } from "better-auth/db/migration";
import type { Pool } from "pg";
import type { AuthenticationConfig } from "./config";
import { type AuthenticationProvider, NATIVE_CLIENT_ID } from "./provider";

/** Auth has its own namespace and migration; it never rewrites legacy application identities. */
export async function initializeAuthentication(
  pool: Pool,
  auth: AuthenticationProvider,
  config: AuthenticationConfig,
  legacyOwnerId: string,
) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext(current_database()),hashtext($1))", [
      config.schema,
    ]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${config.schema}"`);
    await client.query(
      "CREATE TABLE IF NOT EXISTS ngertiin_auth_migrations(version integer PRIMARY KEY,sha256 text NOT NULL)",
    );
    const migrations = await Promise.all([
      readFile(new URL("./schema.sql", import.meta.url), "utf8"),
      Promise.all([
        readFile(new URL("../organizations/provider-schema.sql", import.meta.url), "utf8"),
        readFile(new URL("../organizations/schema.sql", import.meta.url), "utf8"),
      ]).then((parts) => parts.join("\n")),
    ]);
    const existing = (await client.query("SELECT * FROM ngertiin_auth_migrations ORDER BY version"))
      .rows;
    if (
      existing.some(
        (row, index) =>
          row.version !== index + 1 ||
          !migrations[index] ||
          row.sha256 !== createHash("sha256").update(migrations[index]).digest("hex"),
      )
    )
      throw new Error("Unsupported or modified authentication migration.");
    for (let index = existing.length; index < migrations.length; index++) {
      const sql = migrations[index];
      const checksum = createHash("sha256").update(sql).digest("hex");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO ngertiin_auth_migrations VALUES($1,$2)", [
          index + 1,
          checksum,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    const changes = await getMigrations(auth.options);
    if (
      changes.toBeCreated.length ||
      changes.toBeAdded.length ||
      changes.toBeAddedIndexes.length ||
      changes.schemaProblems.length ||
      changes.unsafeChanges.length
    )
      throw new Error(
        `Authentication schema does not match the pinned provider: ${JSON.stringify({
          missing_tables: changes.toBeCreated.length,
          missing_columns: changes.toBeAdded.length,
          missing_indexes: changes.toBeAddedIndexes.length,
          schema_problems: changes.schemaProblems.length,
          unsafe_changes: changes.unsafeChanges.length,
        })}`,
      );
    await client.query(
      "INSERT INTO ngertiin_owner_binding(id,legacy_owner_id) VALUES(1,$1) ON CONFLICT DO NOTHING",
      [legacyOwnerId],
    );
    const owner = (
      await client.query("SELECT legacy_owner_id FROM ngertiin_owner_binding WHERE id=1")
    ).rows[0];
    if (owner.legacy_owner_id !== legacyOwnerId)
      throw new Error("Authentication belongs to another installation owner.");
    const context = await auth.$context;
    const adapter = context.adapter;
    const resource = await adapter.findOne({
      model: "oauthResource",
      where: [{ field: "identifier", value: config.origin }],
    });
    if (!resource)
      await adapter.create({
        model: "oauthResource",
        data: {
          identifier: config.origin,
          name: "Ngertiin API",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    const native = {
      clientId: NATIVE_CLIENT_ID,
      name: "Ngertiin Tauri",
      redirectUris: [config.nativeRedirectUri],
      scopes: ["ngertiin", "offline_access"],
      applicationType: "native",
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      requirePKCE: true,
      skipConsent: true,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const existingClient = await adapter.findOne<Record<string, unknown>>({
      model: "oauthClient",
      where: [{ field: "clientId", value: NATIVE_CLIENT_ID }],
    });
    if (!existingClient) await adapter.create({ model: "oauthClient", data: native });
    else {
      // Changes to a trusted client's redirect or mode require an explicit operator migration.
      for (const field of [
        "redirectUris",
        "scopes",
        "tokenEndpointAuthMethod",
        "applicationType",
        "requirePKCE",
        "skipConsent",
      ] as const)
        if (JSON.stringify(existingClient[field]) !== JSON.stringify(native[field]))
          throw new Error(
            "Native client configuration changed; an explicit authentication migration is required.",
          );
    }
    const linked = await adapter.findOne({
      model: "oauthClientResource",
      where: [
        { field: "clientId", value: NATIVE_CLIENT_ID },
        { field: "resourceId", value: config.origin },
      ],
    });
    if (!linked)
      await adapter.create({
        model: "oauthClientResource",
        data: { clientId: NATIVE_CLIENT_ID, resourceId: config.origin, createdAt: new Date() },
      });
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext(current_database()),hashtext($1))", [
      config.schema,
    ]);
    client.release();
  }
}
