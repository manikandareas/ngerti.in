import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { cargo, directory, repository, target } from "./cargo";

const version = "0.7.10";
const toolDirectory = resolve(repository, ".dev/desktop-rs-tools", `dioxus-${version}`);
const dx = join(toolDirectory, "dx");

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("Desktop Rust hot reload currently targets macOS ARM64.");
}

if (!(await Bun.file(dx).exists())) {
  console.log(`Downloading Dioxus CLI ${version} for native Rust hot reload...`);
  await mkdir(toolDirectory, { recursive: true });
  const temporary = await mkdtemp(join(toolDirectory, ".download-"));
  try {
    const response = await fetch(
      "https://api.github.com/repos/DioxusLabs/dioxus/releases/assets/496015761?download=1",
      { headers: { Accept: "application/octet-stream" }, signal: AbortSignal.timeout(120_000) },
    );
    if (!response.ok) throw new Error(`Dioxus CLI download failed: HTTP ${response.status}`);
    const archive = new Uint8Array(await response.arrayBuffer());
    const digest = createHash("sha256").update(archive).digest("hex");
    if (digest !== "342c92bc33dca60dadd725ed5e249923f049ae2e1e50b7477f4968d56695b425") {
      throw new Error("Dioxus CLI archive checksum mismatch");
    }
    const archivePath = join(temporary, "dx.tar.gz");
    await Bun.write(archivePath, archive);
    const extraction = Bun.spawn(["tar", "-xzf", archivePath, "-C", temporary, "dx"], {
      stdout: "inherit",
      stderr: "inherit",
    });
    if (await extraction.exited) throw new Error("Dioxus CLI extraction failed");
    await chmod(join(temporary, "dx"), 0o755);
    await rename(join(temporary, "dx"), dx);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

const child = Bun.spawn(
  [
    dx,
    "serve",
    "--addr",
    "127.0.0.1",
    "--desktop",
    "--renderer",
    "native",
    "--package",
    "ngertiin-desktop-dev",
    "--bin",
    "ngertiin-desktop-dev",
    "--features",
    "hot-reload",
    "--hot-patch",
    "--locked",
    "--open",
    "false",
    ...process.argv.slice(2),
  ],
  {
    cwd: directory,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    env: {
      ...process.env,
      PATH: `${dirname(cargo)}:${process.env.PATH ?? ""}`,
      CARGO_TARGET_DIR: target,
      CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "2",
    },
  },
);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
process.exitCode = await child.exited;
