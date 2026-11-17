import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { Authentication, Principal } from "../auth/service";
import { DomainError, id } from "../contracts";
import { type AccessContext, accessView, type Role } from "./contracts";

export type Transaction = PoolClient;
export type Permission = "member" | "manage" | "owner";
export const deny = () => new DomainError("SCOPE_DENIED", 403);
export const conflict = () => new DomainError("CONFLICT", 409);
export function requireRole(role: Role, permission: Permission) {
  if (
    (permission === "owner" && role !== "owner") ||
    (permission === "manage" && role === "member")
  )
    throw deny();
}

/** Resolve grants from current rows, never from activeOrganizationId, a client role or a receipt. */
export async function accessContext(
  tx: Transaction,
  userId: string,
  organizationId: string,
  lock = false,
): Promise<AccessContext> {
  const row = (
    await tx.query(
      `SELECT m.id,m.role,s.generation,s.private_work_suspended,p.authorization_generation,
      ARRAY(SELECT tm."teamId" FROM "teamMember" tm JOIN team t ON t.id=tm."teamId"
        WHERE tm.organization_id=$2 AND t."organizationId"=$2 AND tm."userId"=$1 ORDER BY tm."teamId") AS workgroup_ids
     FROM member m JOIN ngertiin_membership_state s ON s.organization_id=m."organizationId" AND s.user_id=m."userId" AND s.membership_id=m.id
     JOIN ngertiin_organization_policy p ON p.organization_id=m."organizationId"
     WHERE m."userId"=$1 AND m."organizationId"=$2 AND s.status='active'${lock ? " FOR SHARE OF m,s,p" : ""}`,
      [userId, organizationId],
    )
  ).rows[0];
  if (!row) throw deny();
  return accessView.parse({
    organization_id: organizationId,
    user_id: userId,
    membership_id: row.id,
    role: row.role,
    membership_generation: row.generation,
    authorization_generation: row.authorization_generation,
    workgroup_ids: row.workgroup_ids,
    private_work_suspended: row.private_work_suspended,
    capabilities: {
      manage_organization: row.role !== "member",
      manage_workgroups: row.role !== "member",
      invite_members: row.role !== "member",
      elevate_members: row.role === "owner",
      read_private_context: false,
    },
  });
}

export async function audit(
  tx: Transaction,
  organizationId: string,
  userId: string,
  action: string,
  targetId: string,
) {
  const row = (
    await tx.query(
      "UPDATE ngertiin_organization_policy SET authorization_generation=authorization_generation+1 WHERE organization_id=$1 RETURNING authorization_generation",
      [organizationId],
    )
  ).rows[0];
  await tx.query(
    "INSERT INTO ngertiin_organization_audit(organization_id,actor_user_id,action,target_id,authorization_generation) VALUES($1,$2,$3,$4,$5)",
    [organizationId, userId, action, targetId, row.authorization_generation],
  );
}

export class OrganizationDatabase {
  constructor(readonly auth: Authentication) {}

  async transaction<T>(
    principal: Principal,
    write: boolean,
    action: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    await principal.validate();
    const tx = await this.auth.pool.connect();
    try {
      await tx.query(write ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const active = await tx.query(
        `SELECT s.id FROM session s JOIN "user" u ON u.id=s."userId"
         WHERE s.id=$1 AND u.id=$2 AND s."expiresAt">now() AND u."emailVerified"=true${write ? " FOR SHARE OF s" : ""}`,
        [principal.sessionId, principal.userId],
      );
      if (!active.rowCount) throw new DomainError("UNAUTHORIZED", 401);
      const result = await action(tx);
      await tx.query("COMMIT");
      return result;
    } catch (error) {
      await tx.query("ROLLBACK");
      // Constraint errors never reveal another organization's identities or database details.
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23505", "23503", "23514", "40P01", "40001"].includes(String(error.code))
      )
        throw conflict();
      throw error;
    } finally {
      tx.release();
    }
  }

  read<T>(
    request: Request,
    organizationId: string,
    permission: Permission,
    action: (tx: Transaction, context: AccessContext) => Promise<T>,
  ) {
    const principal = this.auth.principal(request);
    return this.transaction(principal, false, async (tx) => {
      const context = await accessContext(tx, principal.userId, organizationId);
      requireRole(context.role, permission);
      return action(tx, context);
    });
  }

  command<T>(
    request: Request,
    organizationId: string | null,
    body: unknown,
    permission: Permission | null,
    action: (tx: Transaction, userId: string, context: AccessContext | null) => Promise<T>,
    resolveOrganizationId?: (result: T) => string,
  ) {
    const commandId = id.parse(request.headers.get("Idempotency-Key"));
    const principal = this.auth.principal(request);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ method: request.method, path: new URL(request.url).pathname, body }))
      .digest("hex");
    return this.transaction(principal, true, async (tx) => {
      // This serializes a user's quota/command IDs without locking FK-referenced user rows.
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [principal.userId]);
      if (organizationId) {
        const org = await tx.query("SELECT id FROM organization WHERE id=$1 FOR UPDATE", [
          organizationId,
        ]);
        if (!org.rowCount) throw deny();
      }
      const context =
        organizationId && permission
          ? await accessContext(tx, principal.userId, organizationId)
          : null;
      if (context && permission) requireRole(context.role, permission);
      const old = (
        await tx.query(
          "SELECT * FROM ngertiin_organization_commands WHERE user_id=$1 AND command_id=$2",
          [principal.userId, commandId],
        )
      ).rows[0];
      if (old) {
        if (old.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT", 409);
        const current = await accessContext(tx, principal.userId, old.organization_id);
        if (current.membership_generation !== old.membership_generation) throw deny();
        return old.result as T;
      }
      const result = await action(tx, principal.userId, context);
      // Create/join operations obtain their membership atomically in action().
      const target = organizationId ?? resolveOrganizationId?.(result);
      if (!target) throw new Error("Organization commands must resolve their organization scope.");
      const state = (
        await tx.query(
          "SELECT generation FROM ngertiin_membership_state WHERE organization_id=$1 AND user_id=$2",
          [target, principal.userId],
        )
      ).rows[0];
      await tx.query(
        "INSERT INTO ngertiin_organization_commands VALUES($1,$2,$3,$4,$5,$6::jsonb)",
        [
          principal.userId,
          commandId,
          target,
          state.generation,
          fingerprint,
          JSON.stringify(result),
        ],
      );
      return result;
    });
  }
}
