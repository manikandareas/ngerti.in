import { createRequire } from "node:module";

const id = process.argv[2];
if (!id || !/^[a-f0-9-]{36}$/.test(id))
  throw new Error("An explicit acceptance Routine ID is required.");
const release = "/opt/ngertiin/current";
const { loadOperations } = await import(`${release}/apps/server/src/operations/files.ts`);
const { env } = loadOperations("/etc/ngertiin/operations.json");
Object.assign(process.env, env);
const { developmentConfig } = await import(`${release}/apps/server/src/config.ts`);
const config = developmentConfig();
if (
  config.authentication.origin !== "https://demo.ngerti.in" ||
  !/^[a-z_][a-z0-9_]*$/.test(config.databaseSchema)
)
  throw new Error("The retained acceptance target is required.");
const { Client } = createRequire(`${release}/apps/server/package.json`)("pg");
const db = new Client({ connectionString: env.NGERTIIN_DATABASE_URL });
try {
  await db.connect();
  await db.query("BEGIN READ ONLY");
  const rows = await db.query(
    `SELECT body FROM "${config.databaseSchema}".entities WHERE kind='run' AND body->>'routine_id'=$1 ORDER BY body->>'created_at'`,
    [id],
  );
  console.log(
    JSON.stringify(
      {
        observed_at: new Date().toISOString(),
        routine_id: id,
        runs: rows.rows.map(({ body }: { body: Record<string, unknown> }) => ({
          id: body.id,
          status: body.status,
          created_at: body.created_at,
          timings: body.timings,
          native_accepted: Boolean(body.native_run_id),
          product_tools: body.product_tools,
          billing: (body.provider_selection as { billing_source?: string })?.billing_source,
        })),
      },
      null,
      2,
    ),
  );
  await db.query("ROLLBACK");
} finally {
  await db.end();
}
