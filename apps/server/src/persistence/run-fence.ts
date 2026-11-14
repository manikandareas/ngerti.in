import type { Pool, PoolClient } from "pg";
import { DomainError, type Entity, run } from "../contracts";

/** A reserved native dispatch may report after membership revocation. This boundary can
 * only stop/settle that exact dispatch; it cannot publish answers or authorize new work. */
export async function fenceScopedRun(
  pool: Pool,
  expected: Entity<"run">,
  assertAuthority: (client: PoolClient) => Promise<void>,
  outcome?: "succeeded" | "failed" | "cancelled" | "unknown",
) {
  if (!expected.organization_id || !expected.actor_id || !expected.dispatch_token)
    throw new DomainError("SCOPE_DENIED", 403);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT event_clock FROM installation WHERE id=1 FOR UPDATE");
    await assertAuthority(client);
    const row = (
      await client.query("SELECT body FROM entities WHERE kind='run' AND id=$1 FOR UPDATE", [
        expected.id,
      ])
    ).rows[0];
    const current = row ? run.parse(row.body) : null;
    if (
      !current ||
      current.owner_id !== expected.owner_id ||
      current.organization_id !== expected.organization_id ||
      current.actor_id !== expected.actor_id ||
      current.dispatch_token !== expected.dispatch_token ||
      current.authority_epoch !== expected.authority_epoch
    )
      throw new DomainError("STALE_DISPATCH");
    if (!["dispatching", "running", "cancel_requested", "unknown"].includes(current.status)) {
      await client.query("COMMIT");
      return;
    }
    if (!outcome && current.cancellation === "requested") {
      await client.query("COMMIT");
      return;
    }
    const receipt = run.parse({
      ...current,
      revision: current.revision + 1,
      updated_at: new Date().toISOString(),
      status: outcome ?? (current.status === "unknown" ? "unknown" : "cancel_requested"),
      outcome: outcome ?? current.outcome,
      cancellation: outcome === "cancelled" ? "confirmed" : "requested",
      activity: outcome === "unknown" ? "unknown" : outcome ? "idle" : "stopping",
      active_tools: [],
      retry_allowed: false,
      ...(outcome ? { timings: { ...current.timings, settled_at: new Date().toISOString() } } : {}),
    });
    await client.query("UPDATE entities SET body=$1 WHERE kind='run' AND id=$2", [
      JSON.stringify(receipt),
      receipt.id,
    ]);
    const cursor = Number(
      (
        await client.query(
          "UPDATE installation SET event_clock=event_clock+1 WHERE id=1 RETURNING event_clock",
        )
      ).rows[0].event_clock,
    );
    await client.query(
      "INSERT INTO events(cursor,owner_id,body,organization_id,actor_id) VALUES($1,$2,$3,$4,$5)",
      [
        cursor,
        receipt.owner_id,
        JSON.stringify({
          schema_version: 1,
          owner_id: receipt.owner_id,
          type: "run.updated",
          entity_kind: "run",
          entity_id: receipt.id,
          revision: receipt.revision,
          created_at: receipt.updated_at,
          data: receipt,
        }),
        receipt.organization_id,
        receipt.actor_id,
      ],
    );
    await assertAuthority(client);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
