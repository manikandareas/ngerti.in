import { readFileSync, writeFileSync } from "node:fs";
import { loadOperations } from "../../../apps/server/src/operations/files";

if (process.env.NGERTIIN_DISPOSABLE_REHEARSAL !== "nma082")
  throw new Error("Explicit disposable rehearsal marker required.");
const { env } = loadOperations("/etc/ngertiin/operations.json");
const ca = readFileSync("/srv/ngertiin/tls/caddy/pki/authorities/local/root.crt", "utf8");
const origin = env.NGERTIIN_AUTH_URL;
const login = await fetch(`${origin}/api/auth/sign-in/email`, {
  method: "POST",
  tls: { ca },
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "deployment@example.test",
    password: "Disposable-deployment-password-948!",
  }),
});
if (!login.ok) throw new Error("Restored fixture login failed.");
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
const request = (path: string, organization?: string) =>
  fetch(`${origin}${path}`, {
    tls: { ca },
    signal: AbortSignal.timeout(30000),
    headers: {
      Cookie: cookie,
      Origin: origin,
      ...(organization ? { "X-Ngertiin-Organization": organization } : {}),
    },
  });
const organizations = (await (await request("/v1/organizations")).json()).organizations;
if (organizations.length !== 2)
  throw new Error("Expected the two named restored fixture organizations.");
let result: { pass: number; fail: number; checks: string[] } | undefined;
for (const organization of organizations) {
  const artifacts = await (await request("/v1/entities/artifact", organization.id)).json();
  const artifact = artifacts.find((item: { name: string }) => item.name === "recovery-proof.txt");
  if (!artifact) continue;
  const path = `/v1/workspaces/${artifact.workspace_id}/file?path=${encodeURIComponent(artifact.source_path)}`;
  const response = await request(path, organization.id);
  if (
    !response.ok ||
    (await response.text()) !== "Immutable artifact recovered through the real HTTPS API.\n"
  )
    throw new Error("Restored working-file API bytes differ.");
  const other = organizations.find((item: { id: string }) => item.id !== organization.id);
  if ((await request(path, other.id)).ok)
    throw new Error("Foreign organization obtained the restored working file.");
  result = {
    pass: 2,
    fail: 0,
    checks: [
      "Actual workspace file API returns the restored uploaded bytes",
      "Cross-organization workspace file API remains denied",
    ],
  };
}
if (!result) throw new Error("Restored uploaded artifact was not found.");
writeFileSync("/srv/ngertiin/working-file-restore-report.json", JSON.stringify(result, null, 2), {
  mode: 0o600,
});
console.log(JSON.stringify(result));
