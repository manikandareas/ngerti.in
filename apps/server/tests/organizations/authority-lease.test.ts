import { expect, test } from "bun:test";
import { readinessFixture } from "./readiness-helpers";

test("transaction authority remains locked and a subsequent lease rejects revoked grants", async () => {
  const f = await readinessFixture();
  try {
    const lane = await f.lane(f.alice.cookie, "codex");
    const release = await lane.scope.acquire?.();
    if (!release) throw new Error("Expected a scoped authority lease.");
    let changed = false;
    const revocation = f.auth.pool
      .query(
        "UPDATE ngertiin_organization_policy SET authorization_generation=authorization_generation+1 WHERE organization_id=$1",
        [lane.scope.organizationId],
      )
      .then(() => {
        changed = true;
      });
    try {
      await release.validate?.(true);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(changed).toBe(false);
      await release.validate?.(true);
    } finally {
      await release();
      await revocation;
    }
    expect(changed).toBe(true);
    await expect(lane.scope.acquire?.()).rejects.toMatchObject({ code: "SCOPE_DENIED" });
  } finally {
    await f.close();
  }
});
