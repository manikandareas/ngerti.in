import { developmentConfig } from "../config";
import { Authentication } from "./service";

// This entry point is operator-only. No HTTP route can issue an Owner grant.
if (import.meta.main) {
  const config = developmentConfig();
  if (!config.authentication || !config.databaseUrl)
    throw new Error("Configure account authentication and PostgreSQL first.");
  const [action, email] = process.argv.slice(2);
  if (action !== "issue-owner" || !email)
    throw new Error("Usage: bun apps/server/src/auth/operator.ts issue-owner <email>");
  const auth = await Authentication.open(
    config.authentication,
    config.databaseUrl,
    config.owner_id,
  );
  try {
    // Intentional secret output to the operator terminal; never an application log/event/receipt.
    process.stdout.write(`${JSON.stringify(await auth.issueBootstrap(email))}\n`);
  } finally {
    await auth.close();
  }
}
