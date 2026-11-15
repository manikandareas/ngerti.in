import { Client } from "pg";
import { z } from "zod";
import { type OperationsConfig, run } from "./files";

export const sqlName = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);

export async function assertDatabaseTarget(client: Client, config: OperationsConfig) {
  const sql =
    "SELECT current_database()::text || '|' || system_identifier::text AS identity FROM pg_control_system()";
  const identity = (await client.query(sql)).rows[0].identity;
  const container = await run(
    [
      "docker",
      "exec",
      config.database_container,
      "psql",
      "-XAt",
      "-U",
      config.database_user,
      "-d",
      config.database_name,
      "-c",
      sql,
    ],
    { stage: "database target identity" },
  );
  if (identity !== container)
    throw new Error(
      "The configured container and authority connection select different databases.",
    );
}

/** The same advisory lock as Store prevents a second lifecycle authority during maintenance. */
export async function offlineDatabase(env: Record<string, string>) {
  const client = new Client({
    connectionString: env.NGERTIIN_DATABASE_URL,
    connectionTimeoutMillis: 5000,
    application_name: "ngertiin-offline-recovery",
  });
  try {
    await client.connect();
    const schema = sqlName.parse(env.NGERTIIN_DATABASE_SCHEMA ?? "ngertiin_app");
    const result = await client.query(
      "SELECT pg_try_advisory_lock($1,hashtext(current_database() || ':' || $2)) AS held",
      [0x4e474831, schema],
    );
    if (!result.rows[0].held) throw new Error("A live application authority prevents recovery.");
    return client;
  } catch {
    await client.end().catch(() => {});
    throw new Error("Offline PostgreSQL authority could not be acquired.");
  }
}

export async function databaseFingerprint(client: Client, schemas: string[]) {
  const tables = await client.query<{ schemaname: string; tablename: string }>(
    "SELECT schemaname,tablename FROM pg_tables WHERE schemaname=ANY($1) ORDER BY schemaname,tablename",
    [schemas],
  );
  const result: Record<string, { count: string; digest: string }> = {};
  for (const { schemaname, tablename } of tables.rows) {
    // Identifiers come from PostgreSQL, with quotes escaped independently of user input.
    const table = [schemaname, tablename]
      .map((value) => `"${value.replaceAll('"', '""')}"`)
      .join(".");
    const row = await client.query(
      `SELECT count(*)::text AS count,coalesce(sum(('x'||substr(md5(to_jsonb(t)::text),1,16))::bit(64)::bigint::numeric),0)::text AS digest FROM ${table} t`,
    );
    result[`${schemaname}.${tablename}`] = row.rows[0];
  }
  return result;
}
