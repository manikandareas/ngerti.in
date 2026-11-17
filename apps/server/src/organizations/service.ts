import type { Authentication } from "../auth/service";
import { type AccessContext, auditView, organizationView } from "./contracts";
import {
  accessContext,
  audit,
  conflict,
  deny,
  OrganizationDatabase,
  type Transaction,
} from "./database";
import { invitation } from "./invitations";
import { addMembership, membership, provisioning } from "./members";
import { audienceAllows, listAudiences, listWorkgroups } from "./workgroups";

export class Organizations {
  readonly database: OrganizationDatabase;
  constructor(readonly auth: Authentication) {
    this.database = new OrganizationDatabase(auth);
  }

  async creationLimit(tx: Transaction, userId: string) {
    const row = (
      await tx.query(
        `SELECT COALESCE(p.organization_limit,CASE WHEN b.user_id IS NOT NULL THEN 1 ELSE 0 END) AS maximum
      FROM "user" u LEFT JOIN ngertiin_organization_creation p ON p.user_id=u.id
      LEFT JOIN ngertiin_owner_binding b ON b.user_id=u.id WHERE u.id=$1`,
        [userId],
      )
    ).rows[0];
    return Number(row.maximum);
  }
  list(request: Request) {
    const principal = this.auth.principal(request);
    return this.database.transaction(principal, false, async (tx) => ({
      organizations: (
        await tx.query(
          'SELECT o.id,o.name,o.slug FROM organization o JOIN member m ON m."organizationId"=o.id WHERE m."userId"=$1 ORDER BY o."createdAt",o.id',
          [principal.userId],
        )
      ).rows.map((row) => organizationView.parse(row)),
      creation_limit: await this.creationLimit(tx, principal.userId),
      created_count: Number(
        (
          await tx.query(
            "SELECT count(*) FROM ngertiin_organization_policy WHERE created_by_user_id=$1",
            [principal.userId],
          )
        ).rows[0].count,
      ),
    }));
  }
  create(request: Request, body: { name: string; slug: string }) {
    return this.database.command(
      request,
      null,
      body,
      null,
      async (tx, actor) => {
        const limit = await this.creationLimit(tx, actor);
        const count = Number(
          (
            await tx.query(
              "SELECT count(*) FROM ngertiin_organization_policy WHERE created_by_user_id=$1",
              [actor],
            )
          ).rows[0].count,
        );
        if (count >= limit) throw deny();
        const org = organizationView.parse(
          (
            await tx.query(
              'INSERT INTO organization(name,slug,"createdAt") VALUES($1,$2,now()) RETURNING id,name,slug',
              [body.name, body.slug],
            )
          ).rows[0],
        );
        await tx.query(
          "INSERT INTO ngertiin_organization_policy(organization_id,created_by_user_id) VALUES($1,$2)",
          [org.id, actor],
        );
        const member = await addMembership(tx, org.id, actor, "owner");
        await audit(tx, org.id, actor, "organization.created", org.id);
        return {
          organization: org,
          membership: member,
          provisioning: await provisioning(tx, org.id, actor),
        };
      },
      (result) => result.organization.id,
    );
  }
  update(request: Request, organizationId: string, body: { name: string; slug: string }) {
    return this.database.command(request, organizationId, body, "manage", async (tx, actor) => {
      const organization = (
        await tx.query(
          "UPDATE organization SET name=$2,slug=$3 WHERE id=$1 RETURNING id,name,slug",
          [organizationId, body.name, body.slug],
        )
      ).rows[0];
      await audit(tx, organizationId, actor, "organization.updated", organizationId);
      return { organization };
    });
  }
  /** Operator-only policy: grants creation, never organization membership or chat access. */
  async grantCreation(email: string, maximum: number) {
    if (!Number.isInteger(maximum) || maximum < 0 || maximum > 100)
      throw new Error("Organization creation limit must be between 0 and 100.");
    const tx = await this.auth.pool.connect();
    try {
      await tx.query("BEGIN");
      const user = (
        await tx.query('SELECT id FROM "user" WHERE lower(email)=$1 AND "emailVerified"=true', [
          email.trim().toLowerCase(),
        ])
      ).rows[0];
      if (!user) throw new Error("A verified account is required.");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [user.id]);
      await tx.query(
        "INSERT INTO ngertiin_organization_creation(user_id,organization_limit) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET organization_limit=$2,updated_at=now()",
        [user.id, maximum],
      );
      await tx.query(
        "INSERT INTO ngertiin_organization_audit(action,target_id) VALUES('operator.creation_policy_changed',$1)",
        [user.id],
      );
      await tx.query("COMMIT");
      return { organization_limit: maximum };
    } catch (error) {
      await tx.query("ROLLBACK");
      throw error;
    } finally {
      tx.release();
    }
  }
  async assertCurrent(
    context: AccessContext,
    privateWork = false,
    transaction?: Transaction,
    lock = false,
  ) {
    const tx = transaction ?? (await this.auth.pool.connect());
    try {
      const current = await accessContext(tx, context.user_id, context.organization_id, lock);
      if (
        current.membership_id !== context.membership_id ||
        current.membership_generation !== context.membership_generation ||
        current.authorization_generation !== context.authorization_generation ||
        (privateWork && current.private_work_suspended)
      )
        throw deny();
      return current;
    } finally {
      if (!transaction) tx.release();
    }
  }
  context(request: Request, organizationId: string) {
    return this.database.read(request, organizationId, "member", async (_, context) => context);
  }
  members(request: Request, organizationId: string) {
    return this.database.read(request, organizationId, "manage", async (tx) => ({
      members: await this.memberRows(tx, organizationId),
    }));
  }
  private async memberRows(tx: Transaction, organizationId: string) {
    const ids = (
      await tx.query('SELECT id FROM member WHERE "organizationId"=$1 ORDER BY "createdAt",id', [
        organizationId,
      ])
    ).rows;
    return Promise.all(ids.map((row) => membership(tx, organizationId, row.id)));
  }
  invitations(request: Request, organizationId: string) {
    return this.database.read(request, organizationId, "manage", async (tx) => {
      const ids = (
        await tx.query(
          'SELECT id FROM invitation WHERE "organizationId"=$1 ORDER BY "createdAt" DESC,id LIMIT 100',
          [organizationId],
        )
      ).rows;
      return {
        invitations: await Promise.all(ids.map((row) => invitation(tx, organizationId, row.id))),
      };
    });
  }
  async invitationOrganizationId(invitationId: string): Promise<string> {
    const row = (
      await this.auth.pool.query('SELECT "organizationId" FROM invitation WHERE id=$1', [
        invitationId,
      ])
    ).rows[0];
    if (!row) throw deny();
    return row.organizationId as string;
  }
  reviewInvitation(request: Request, invitationId: string) {
    const principal = this.auth.principal(request);
    return this.database.transaction(principal, false, async (tx) => {
      const row = (
        await tx.query(
          `SELECT i."organizationId" FROM invitation i JOIN "user" u ON lower(u.email)=i.email
        WHERE i.id=$1 AND u.id=$2 AND u."emailVerified"=true AND i.status='pending' AND i."expiresAt">now()`,
          [invitationId, principal.userId],
        )
      ).rows[0];
      if (!row) throw deny();
      return {
        organization: organizationView.parse(
          (
            await tx.query("SELECT id,name,slug FROM organization WHERE id=$1", [
              row.organizationId,
            ])
          ).rows[0],
        ),
        invitation: await invitation(tx, row.organizationId, invitationId),
      };
    });
  }
  async deliverInvitation(request: Request, organizationId: string, invitationId: string) {
    const current = await this.database.read(
      request,
      organizationId,
      "manage",
      async (tx, context) => {
        const item = await invitation(tx, organizationId, invitationId);
        if (item.role === "admin" && context.role !== "owner") throw deny();
        return item;
      },
    );
    if (current.status !== "pending" || Date.parse(current.expires_at) <= Date.now())
      throw conflict();
    if (current.delivery === "sent") return { invitation: current };
    let delivery: "sent" | "failed" = "sent";
    try {
      await this.auth.deliver({
        to: current.email,
        purpose: "invitation",
        url: `${this.auth.config.origin}/invitations/${invitationId}`,
        idempotencyKey: `invitation/${invitationId}`,
      });
    } catch {
      delivery = "failed";
    }
    await this.auth.pool.query(
      "UPDATE ngertiin_invitation_state SET delivery=$2 WHERE invitation_id=$1 AND delivery<>'sent'",
      [invitationId, delivery],
    );
    return this.database.read(request, organizationId, "manage", async (tx) => ({
      invitation: await invitation(tx, organizationId, invitationId),
    }));
  }
  resumePrivateWork(request: Request, organizationId: string) {
    return this.database.command(request, organizationId, {}, "member", async (tx, actor) => {
      await tx.query(
        "UPDATE ngertiin_membership_state SET private_work_suspended=false WHERE organization_id=$1 AND user_id=$2",
        [organizationId, actor],
      );
      await audit(tx, organizationId, actor, "member.private_work_resumed", actor);
      return accessContext(tx, actor, organizationId);
    });
  }
  allows(request: Request, organizationId: string, audienceId: string) {
    return this.database.read(request, organizationId, "member", async (tx, context) => ({
      allowed: await audienceAllows(tx, organizationId, context.user_id, audienceId),
    }));
  }
  async auditRows(tx: Transaction, organizationId: string, after = "0") {
    return (
      await tx.query(
        "SELECT sequence::text,actor_user_id,action,target_id,authorization_generation,created_at FROM ngertiin_organization_audit WHERE organization_id=$1 AND sequence>$2::bigint ORDER BY sequence LIMIT 500",
        [organizationId, after],
      )
    ).rows.map((row) => auditView.parse({ ...row, created_at: row.created_at.toISOString() }));
  }
  export(request: Request, organizationId: string) {
    return this.database.read(request, organizationId, "owner", async (tx) => ({
      organization: organizationView.parse(
        (await tx.query("SELECT id,name,slug FROM organization WHERE id=$1", [organizationId]))
          .rows[0],
      ),
      members: await this.memberRows(tx, organizationId),
      workgroups: await listWorkgroups(tx, organizationId),
      audiences: await listAudiences(tx, organizationId),
      retention: {
        administration: "retained_until_explicit_operator_purge" as const,
        private_data: "excluded" as const,
        team_ownership: "organization" as const,
      },
    }));
  }
}
