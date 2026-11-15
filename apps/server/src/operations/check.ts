import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { authenticationConfig } from "../auth/config";
import { detectHarness } from "../harness/availability";
import { DOMAIN_IMAGE, readDomainPolicy } from "../machines/domain-runtime";
import { loadOperations, privateDirectory, privateFile, run, sha256 } from "./files";

export async function check(configPath: string) {
  const { config, env } = loadOperations(configPath);
  if (
    process.platform !== "linux" ||
    !["arm64", "x64"].includes(process.arch) ||
    !/^VERSION_ID="24\.04"$/m.test(readFileSync("/etc/os-release", "utf8"))
  )
    throw new Error("The declared deployment profile requires Ubuntu 24.04 ARM64 or AMD64.");
  // Bun's descriptor-relative filesystem boundary compiles openat.c and needs libc6-dev.
  await import("../workspaces/posix");
  if (
    env.APP_ENV !== "production" ||
    env.NGERTIIN_AUTH_MODE !== "accounts" ||
    !authenticationConfig(env)
  )
    throw new Error("Deployment requires production account mode.");
  if (env.NGERTIIN_AUTH_ALLOW_INSECURE_LOOPBACK !== "false")
    throw new Error("Insecure authentication is forbidden in deployment.");
  if (env.NGERTIIN_PROVIDER_NATIVE_STORAGE !== "encrypted-volume")
    throw new Error("Verify encrypted native storage and backups before enabling deployment.");
  if (
    !env.NGERTIIN_APPLICATION_DATABASE_URL ||
    env.NGERTIIN_APPLICATION_DATABASE_URL === env.NGERTIIN_DATABASE_URL
  )
    throw new Error("Configure a separate restricted application database login.");
  const application = new Client({
    connectionString: env.NGERTIIN_APPLICATION_DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await application.connect();
    const role = (
      await application.query(
        "SELECT rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,pg_has_role(current_user,'ngertiin_runtime','member') AS runtime FROM pg_roles WHERE rolname=current_user",
      )
    ).rows[0];
    const ownership = await application.query(
      "SELECT 1 FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE r.rolname=current_user AND n.nspname=ANY($1) UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE r.rolname=current_user AND n.nspname=ANY($1)",
      [
        [
          env.NGERTIIN_DATABASE_SCHEMA ?? "ngertiin_app",
          env.NGERTIIN_AUTH_SCHEMA ?? "ngertiin_auth",
        ],
      ],
    );
    if (
      !role ||
      role.rolsuper ||
      role.rolbypassrls ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      !role.runtime ||
      ownership.rowCount
    )
      throw new Error(
        "The application database login must be a non-owner restricted runtime member.",
      );
  } finally {
    await application.end();
  }
  if (Object.values(env).some((value) => value.includes("REPLACE_WITH")))
    throw new Error("Complete the private operator configuration first.");
  privateDirectory(config.state_dir);
  privateDirectory(config.trust_dir);
  privateFile(join(config.trust_dir, "provider.key"), 32);
  privateDirectory(join(config.trust_dir, "revocations"));
  if (existsSync(`${config.state_dir}.restore-intent.json`))
    throw new Error("Reconcile the unfinished restore before starting the server.");
  if (!readDomainPolicy(config.state_dir))
    throw new Error("Declare execution-domain admission/resource limits first.");
  const manifest = process.arch === "x64" ? "versions.amd64.json" : "versions.json";
  const versions = JSON.parse(
    readFileSync(new URL(`../../../../infra/server/${manifest}`, import.meta.url), "utf8"),
  );
  if (env.NGERTIIN_MACHINE_ASSETS_DIR !== "/opt/ngertiin/machine-assets")
    throw new Error(
      "Deployment requires stable operator-owned machine assets outside release directories.",
    );
  for (const file of ["ngertiin-browser.desktop", "chromium-policy.json", "start-browser.sh"]) {
    if (
      sha256(join(env.NGERTIIN_MACHINE_ASSETS_DIR, file)) !==
      sha256(new URL(`../../../../infra/machine/${file}`, import.meta.url).pathname)
    )
      throw new Error(
        "Retained machine assets differ from this release; use a coordinated domain upgrade.",
      );
  }
  if (Bun.version !== versions.bun || DOMAIN_IMAGE !== versions.cua)
    throw new Error("Deployment versions differ from the pinned profile.");
  const binaries = [];
  for (const harness of ["codex", "muse"] as const) {
    const value = await detectHarness(
      harness,
      env[harness === "codex" ? "NGERTIIN_CODEX_EXECUTABLE" : "NGERTIIN_MUSE_EXECUTABLE"],
      15000,
    );
    if (value.state !== "supported" || value.version !== versions[harness] || !value.executable)
      throw new Error(
        `Pinned ${harness} preflight failed (${value.state}); inspect version and host load.`,
      );
    binaries.push({ harness, version: value.version, sha256: sha256(value.executable) });
  }
  const image = JSON.parse(await run(["docker", "image", "inspect", DOMAIN_IMAGE]))[0];
  if (image.Os !== "linux" || image.Architecture !== (process.arch === "x64" ? "amd64" : "arm64"))
    throw new Error("Pull the pinned Cua image for the declared Linux architecture.");
  await run([
    "docker",
    "exec",
    config.database_container,
    "pg_isready",
    "-U",
    config.database_user,
    "-d",
    config.database_name,
  ]);
  return { profile: versions.profile, bun: Bun.version, binaries, ready: true };
}
