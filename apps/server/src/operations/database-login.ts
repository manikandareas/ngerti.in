import { Client } from "pg";
import { sqlName } from "./database";
import { loadOperations } from "./files";

/** One dedicated database login; no product session can provision infrastructure roles. */
export async function createApplicationLogin(configPath: string) {
  const { env } = loadOperations(configPath);
  const target = new URL(env.NGERTIIN_APPLICATION_DATABASE_URL ?? "invalid:");
  const authority = new URL(env.NGERTIIN_DATABASE_URL);
  const name = sqlName.parse(decodeURIComponent(target.username));
  if (
    target.host !== authority.host ||
    target.pathname !== authority.pathname ||
    target.username === authority.username ||
    !target.password
  )
    throw new Error(
      "The application login must select the same dedicated database with a different user.",
    );
  const client = new Client({
    connectionString: env.NGERTIIN_DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();
    if ((await client.query("SELECT 1 FROM pg_roles WHERE rolname=$1", [name])).rowCount)
      throw new Error(
        "The application login already exists; credential rotation is an explicit operator action.",
      );
    await client.query("BEGIN");
    await client.query(
      "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='ngertiin_runtime') THEN CREATE ROLE ngertiin_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF; END $$",
    );
    const password = decodeURIComponent(target.password).replaceAll("'", "''");
    await client.query(
      `CREATE ROLE "${name}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`,
    );
    await client.query(`GRANT ngertiin_runtime TO "${name}"`);
    await client.query("COMMIT");
    return { created: true, role: name };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error("Application login provisioning failed; no existing role was modified.");
  } finally {
    await client.end();
  }
}
