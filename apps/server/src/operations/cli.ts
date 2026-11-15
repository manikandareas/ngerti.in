import { check } from "./check";
import { createApplicationLogin } from "./database-login";
import { backup, restore, verifyBackup } from "./recovery";

// Operator entry point only. No HTTP route, product tool or harness can invoke these actions.
if (import.meta.main) {
  process.umask(0o077);
  const [action, config, path, revocations] = process.argv.slice(2);
  try {
    if (
      !config ||
      !["check", "database-login", "backup", "backup-offline", "verify", "restore"].includes(
        action,
      ) ||
      (["backup", "backup-offline", "verify", "restore"].includes(action) && !path) ||
      (action === "restore" && !revocations)
    )
      throw new Error(
        "Usage: bun apps/server/src/operations/cli.ts check|database-login <config> | backup|backup-offline|verify <config> <file> | restore <config> <backup> <latest-revocations-directory>",
      );
    const result =
      action === "check"
        ? await check(config)
        : action === "database-login"
          ? await createApplicationLogin(config)
          : action === "backup" || action === "backup-offline"
            ? await backup(config, path, action === "backup-offline")
            : action === "verify"
              ? await verifyBackup(config, path)
              : await restore(config, path, revocations);
    console.log(JSON.stringify({ event: `operations.${action}.completed`, ...result }));
  } catch (error) {
    // Never print native error objects, child output, database URLs, environment or credentials.
    console.error(
      JSON.stringify({
        event: "operations.failed",
        message: error instanceof Error ? error.message : "Operator action failed.",
      }),
    );
    process.exitCode = 1;
  }
}
