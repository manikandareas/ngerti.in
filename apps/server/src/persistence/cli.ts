import { parseArgs } from "node:util";
import { backupSQLite, importSQLite, restoreSQLiteBackup } from "./sqlite-import";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    state: { type: "string" },
    backup: { type: "string" },
    schema: { type: "string" },
    apply: { type: "boolean", default: false },
    "include-private-state": { type: "boolean", default: false },
    restore: { type: "string" },
  },
});
if (values.restore) {
  if (!values.backup) throw new Error("--backup is required for restore.");
  console.log(
    JSON.stringify(restoreSQLiteBackup(values.backup, values.restore, values.state), null, 2),
  );
} else {
  if (!values.source || !values.state) throw new Error("--source and --state are required.");
  if (values.apply && !values.backup) throw new Error("--apply requires a new --backup directory.");
  const backup = values.backup
    ? backupSQLite(values.source, values.state, values.backup, values["include-private-state"])
    : null;
  const report = await importSQLite(
    values.source,
    `${values.state}/ngertiin.postgres`,
    { connectionString: process.env.NGERTIIN_DATABASE_URL, schema: values.schema },
    values.apply,
  );
  console.log(JSON.stringify({ ...report, backup }, null, 2));
}
