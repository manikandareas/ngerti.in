import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const image = "postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29";
let container: string | undefined;
let child: ReturnType<typeof Bun.spawn> | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child?.kill(signal));
async function docker(args: string[]) {
  const process = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  const [out, error, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
  if (code) throw new Error(`Disposable PostgreSQL failed: ${error.trim()}`);
  return out.trim();
}
try {
  let database = process.env.NGERTIIN_TEST_DATABASE_URL;
  if (!database) {
    const password = crypto.randomUUID();
    container = await docker(["run", "-d", "--rm", "--label", "ngertiin.verification=nma-080", "--tmpfs", "/var/lib/postgresql", "-e", `POSTGRES_PASSWORD=${password}`, "-e", "POSTGRES_DB=ngertiin_test", "-p", "127.0.0.1::5432", image]);
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const probe = Bun.spawn(["docker", "exec", container, "pg_isready", "-U", "postgres", "-d", "ngertiin_test"], { stdout: "ignore", stderr: "ignore" });
      if (await probe.exited === 0) { ready = true; break; }
      await Bun.sleep(200);
    }
    if (!ready) throw new Error("Disposable PostgreSQL did not start.");
    const port = (await docker(["port", container, "5432/tcp"])).match(/^127\.0\.0\.1:(\d+)$/)?.[1];
    if (!port) throw new Error("Expected a loopback database binding.");
    database = `postgresql://postgres:${password}@127.0.0.1:${port}/ngertiin_test`;
  }
  child = Bun.spawn([process.execPath, "x", "playwright", "test", "--config", "playwright.organizations.config.ts", ...process.argv.slice(2)], { cwd: resolve(root, "apps/web-client"), env: { ...process.env, NGERTIIN_TEST_DATABASE_URL: database, NGERTIIN_APPLICATION_DATABASE_URL: database }, stdout: "inherit", stderr: "inherit" });
  process.exitCode = await child.exited;
} finally { if (container) await docker(["rm", "-f", container]); }
