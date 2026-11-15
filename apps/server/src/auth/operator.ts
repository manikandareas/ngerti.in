import { developmentConfig } from "../config";
import { Organizations } from "../organizations/service";
import { Authentication } from "./service";

// This entry point is operator-only. No HTTP route can issue an Owner grant.
if (import.meta.main) {
  const config = developmentConfig();
  if (!config.databaseUrl) throw new Error("Configure PostgreSQL first.");
  const [action, email, maximum] = process.argv.slice(2);
  if (
    !["issue-owner", "grant-organizations"].includes(action) ||
    !email ||
    (action === "grant-organizations" && maximum === undefined)
  )
    throw new Error(
      "Usage: bun apps/server/src/auth/operator.ts issue-owner <email> | grant-organizations <email> <limit>",
    );
  const auth = await Authentication.open(
    config.authentication,
    config.databaseUrl,
    config.owner_id,
  );
  try {
    // Intentional secret output to the operator terminal; never an application log/event/receipt.
    const result =
      action === "issue-owner"
        ? await auth.issueBootstrap(email)
        : await new Organizations(auth).grantCreation(email, Number(maximum));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    await auth.close();
  }
}
