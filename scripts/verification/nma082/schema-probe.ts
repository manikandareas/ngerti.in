import { loadOperations } from "../../../apps/server/src/operations/files";

if (process.env.NGERTIIN_DISPOSABLE_REHEARSAL !== "nma082")
  throw new Error("Explicit disposable rehearsal marker required.");
const { env } = loadOperations("/etc/ngertiin/operations.json");
const child = Bun.spawn(
  [
    process.execPath,
    "test",
    "--timeout",
    "120000",
    "scripts/verification/nma082/schema-startup.test.ts",
  ],
  {
    env: {
      ...process.env,
      NGERTIIN_TEST_DATABASE_URL: env.NGERTIIN_DATABASE_URL,
      NGERTIIN_APPLICATION_DATABASE_URL: env.NGERTIIN_DATABASE_URL,
    },
    stdout: "inherit",
    stderr: "inherit",
  },
);
process.exitCode = await child.exited;
