import { realpathSync, statSync } from "node:fs";

let verifiedDevelopmentRoot: string | null = null;

export function nativeStorageReady(root: string) {
  return (
    process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE === "encrypted-volume" ||
    (verifiedDevelopmentRoot !== null && realpathSync(root) === verifiedDevelopmentRoot)
  );
}

/** Local development may use a verified FileVault data volume; deployment requires operator configuration. */
export async function configureNativeStorage(root: string, localDevelopment: boolean) {
  verifiedDevelopmentRoot = null;
  if (!localDevelopment || process.platform !== "darwin") return;
  try {
    const directory = realpathSync(root);
    if (statSync(directory).dev !== statSync("/System/Volumes/Data").dev) return;
    const child = Bun.spawn(["/usr/bin/fdesetup", "status"], {
      env: { PATH: "/usr/bin:/bin:/usr/sbin:/sbin", LANG: "C" },
      stdout: "pipe",
      stderr: "ignore",
    });
    const timer = setTimeout(() => child.kill(), 3000);
    try {
      const output = await new Response(child.stdout).text();
      if ((await child.exited) === 0 && output.trim() === "FileVault is On.")
        verifiedDevelopmentRoot = directory;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // An unavailable encryption check keeps native login disabled.
  }
}
