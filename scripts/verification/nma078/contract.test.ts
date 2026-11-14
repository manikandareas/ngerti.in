import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { CONTRACT_VERSION } from "../../../apps/server/src/contracts";
import { Connections } from "../../../apps/server/src/harness/connections";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Machines } from "../../../apps/server/src/machines/service";
import { authFixture } from "../../../apps/server/tests/auth/helpers";

test("export the installed scoped applications and published skills API contract", async () => {
  const f = await authFixture();
  const owner = await f.owner();
  const machines = await Machines.open(f.domain.lifecycle, null);
  const api = await createApi(
    f.domain.lifecycle,
    new Background(f.domain.lifecycle),
    "c".repeat(64),
    {
      authentication: f.auth,
      connections: new Connections(f.domain.lifecycle),
      tools: await ProductTools.open(f.domain.lifecycle),
    },
  );
  try {
    const response = await api.handle(
      new Request(`${f.origin}/v1/contracts`, { headers: { Cookie: owner.cookie } }),
    );
    expect(response.status).toBe(200);
    const contract = await response.json();
    expect(contract.version).toBe(CONTRACT_VERSION);
    expect(contract.entities.app_connection).toBeDefined();
    expect(contract.scoped_data.applications.version).toBe("nma-078.1");
    expect(contract.scoped_data.skills.version).toBe("nma-078.1");
    expect(
      contract.http.some(
        (route: { path: string }) => route.path === "/v1/data/team-agents/:id/skills/publish",
      ),
    ).toBe(true);
    expect(contract.scoped_data.provider_connections.version).toBe("nma-077.1");
    expect(
      contract.http.some(
        (route: { path: string }) => route.path === "/v1/connections/:id/rotate-key",
      ),
    ).toBe(true);
    expect(contract.machine.viewer_scope).toContain("device_session");
    expect(contract.scoped_data.readiness_gate).toBe("pending_nma_079");
    await Bun.write(
      resolve(import.meta.dir, `../../../docs/contracts/${CONTRACT_VERSION}.json`),
      `${JSON.stringify(contract, null, 2)}\n`,
    );
    console.log(
      JSON.stringify({
        version: contract.version,
        routes: contract.http.length,
        scoped_readiness: contract.scoped_data.readiness_gate,
      }),
    );
  } finally {
    await api.stop(true);
    await machines.close();
    await f.close();
  }
});
