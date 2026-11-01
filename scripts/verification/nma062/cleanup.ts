import assert from "node:assert/strict";
import { lstatSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const directory = resolve(".dev/nma062-native");
const { token } = await Bun.file(join(directory, "installation.json")).json();
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:8322${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert(response.ok, `${path}: ${response.status}`);
  return response.json();
}
const runs = await api<{ status: string }[]>("/v1/entities/run");
assert(runs.length === 14 && runs.every((r) => r.status === "succeeded"));
const routines = await api<{ state: string }[]>("/v1/entities/routine");
assert(routines.every((r) => r.state === "paused"));
const profiles = await api<{ id: string; grants: { agent_id: string; thread_id: string }[] }[]>(
  "/v1/entities/browser_profile",
);
const sessions = await api<{ id: string; profile_id: string; state: string; generation: number }[]>(
  "/v1/entities/browser_session",
);
for (const profile of profiles) {
  const session = sessions
    .filter((s) => s.profile_id === profile.id && s.state !== "closed")
    .sort((a, b) => b.generation - a.generation)[0];
  if (session && profile.grants[0])
    await api(`/v1/browser/sessions/${session.id}/control`, {
      agent_id: profile.grants[0].agent_id,
      thread_id: profile.grants[0].thread_id,
      operation: "close",
    });
}
const connections = await api<{ id: string }[]>("/v1/entities/connection");
let removed = 0;
for (const connection of connections) {
  await api(`/v1/connections/${connection.id}/revoke`, {});
  const path = join(directory, "connections", connection.id, "codex", "auth.json");
  if (await Bun.file(path).exists()) {
    assert(!lstatSync(path).isSymbolicLink());
    rmSync(path);
    removed++;
  }
}
for (const name of readdirSync(join(directory, "credentials"))) {
  assert(/^[a-f0-9-]{36}$/.test(name));
  const path = join(directory, "credentials", name);
  assert(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink());
  rmSync(path);
  removed++;
}
const listed = Bun.spawn(["docker", "ps", "-aq", "--filter", "ancestor=ngertiin-browser:nma058"], {
  stdout: "pipe",
  stderr: "ignore",
});
const ids = (await new Response(listed.stdout).text()).trim().split(/\s+/).filter(Boolean);
assert.equal(await listed.exited, 0);
const cleaned: string[] = [];
for (const id of ids) {
  const inspect = Bun.spawn(["docker", "inspect", id], { stdout: "pipe", stderr: "ignore" });
  const data = JSON.parse(await new Response(inspect.stdout).text())[0];
  assert.equal(await inspect.exited, 0);
  const owned =
    data.Config.Labels?.["ngertiin.owner"] &&
    data.Mounts.some(
      (m: { Source: string }) =>
        m.Source.startsWith(`${directory}/browser-profiles/`) ||
        /\/ngertiin-nma062-[^/]+\/browser-profiles\//.test(m.Source),
    );
  if (!owned) continue;
  if (data.State.Running) {
    const stop = Bun.spawn(["docker", "stop", "--time=10", id], {
      stdout: "ignore",
      stderr: "ignore",
    });
    assert.equal(await stop.exited, 0);
  }
  const remove = Bun.spawn(["docker", "rm", id], { stdout: "ignore", stderr: "ignore" });
  assert.equal(await remove.exited, 0);
  cleaned.push(id);
}
await Bun.write(
  "docs/verification/nma-062/cleanup.json",
  JSON.stringify(
    {
      proof_connections_revoked: connections.length,
      copied_credential_files_removed: removed,
      paused_routines: routines.length,
      completed_native_runs: runs.length,
      proof_browser_containers_removed: cleaned,
      original_credentials_and_other_containers_preserved: true,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    proof_connections_revoked: connections.length,
    copied_credentials_removed: removed,
    proof_containers_removed: cleaned.length,
  }),
);
