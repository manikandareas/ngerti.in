import { randomUUID } from "node:crypto";
import { membershipView, provisioningView, type Role } from "./contracts";
import { audit, conflict, deny, type Transaction } from "./database";

export async function addMembership(
  tx: Transaction,
  organizationId: string,
  userId: string,
  role: Role,
) {
  const member = (
    await tx.query('SELECT id FROM member WHERE "organizationId"=$1 AND "userId"=$2', [
      organizationId,
      userId,
    ])
  ).rows[0];
  if (member) return membership(tx, organizationId, member.id);
  const state = (
    await tx.query(
      `INSERT INTO ngertiin_membership_state(organization_id,user_id,membership_id,status)
     VALUES($1,$2,$3,'active') ON CONFLICT(organization_id,user_id) DO UPDATE
     SET status='active',generation=ngertiin_membership_state.generation+1,removed_at=NULL RETURNING *`,
      [organizationId, userId, randomUUID()],
    )
  ).rows[0];
  await tx.query(
    'INSERT INTO member(id,"organizationId","userId",role,"createdAt") VALUES($1,$2,$3,$4,now())',
    [state.membership_id, organizationId, userId, role],
  );
  await tx.query(
    `INSERT INTO ngertiin_membership_provisioning(organization_id,user_id,membership_generation)
     VALUES($1,$2,$3) ON CONFLICT(organization_id,user_id) DO UPDATE SET
     membership_generation=$3,status='pending',updated_at=now()`,
    [organizationId, userId, state.generation],
  );
  return membership(tx, organizationId, state.membership_id);
}
export async function membership(tx: Transaction, organizationId: string, membershipId: string) {
  const row = (
    await tx.query(
      `SELECT m.id,m."userId" AS user_id,u.name,u.email,m.role,s.generation,s.private_work_suspended FROM member m
     JOIN "user" u ON u.id=m."userId"
     JOIN ngertiin_membership_state s ON s.organization_id=m."organizationId" AND s.user_id=m."userId"
     WHERE m."organizationId"=$1 AND m.id=$2 AND s.status='active'`,
      [organizationId, membershipId],
    )
  ).rows[0];
  if (!row) throw deny();
  return membershipView.parse(row);
}
export async function provisioning(tx: Transaction, organizationId: string, userId: string) {
  return provisioningView.parse(
    (
      await tx.query(
        "SELECT id,organization_id,user_id,membership_generation,status FROM ngertiin_membership_provisioning WHERE organization_id=$1 AND user_id=$2",
        [organizationId, userId],
      )
    ).rows[0],
  );
}
async function protectLastOwner(tx: Transaction, organizationId: string, targetRole: Role) {
  if (
    targetRole === "owner" &&
    Number(
      (
        await tx.query("SELECT count(*) FROM member WHERE \"organizationId\"=$1 AND role='owner'", [
          organizationId,
        ])
      ).rows[0].count,
    ) <= 1
  )
    throw conflict();
}
export async function changeRole(
  tx: Transaction,
  organizationId: string,
  actor: string,
  membershipId: string,
  role: Role,
) {
  const target = await membership(tx, organizationId, membershipId);
  if (target.role === role) return { membership: target };
  if (role !== "owner") await protectLastOwner(tx, organizationId, target.role);
  await tx.query('UPDATE member SET role=$3 WHERE "organizationId"=$1 AND id=$2', [
    organizationId,
    membershipId,
    role,
  ]);
  await tx.query(
    "UPDATE ngertiin_membership_state SET generation=generation+1 WHERE organization_id=$1 AND user_id=$2",
    [organizationId, target.user_id],
  );
  await tx.query(
    `UPDATE ngertiin_membership_provisioning p SET membership_generation=s.generation,updated_at=now()
    FROM ngertiin_membership_state s WHERE s.organization_id=$1 AND s.user_id=$2 AND p.organization_id=s.organization_id AND p.user_id=s.user_id`,
    [organizationId, target.user_id],
  );
  await audit(tx, organizationId, actor, "member.role_changed", membershipId);
  return { membership: await membership(tx, organizationId, membershipId) };
}
export async function removeMember(
  tx: Transaction,
  organizationId: string,
  actor: string,
  actorRole: Role,
  membershipId: string,
) {
  const target = await membership(tx, organizationId, membershipId);
  if (
    actor !== target.user_id &&
    (actorRole === "member" || (actorRole === "admin" && target.role !== "member"))
  )
    throw deny();
  await protectLastOwner(tx, organizationId, target.role);
  // FK cascades delete only effective team memberships. Attribution/tombstones/intents are retained.
  const teams = (
    await tx.query('SELECT "teamId" FROM "teamMember" WHERE organization_id=$1 AND "userId"=$2', [
      organizationId,
      target.user_id,
    ])
  ).rows;
  await tx.query('DELETE FROM member WHERE "organizationId"=$1 AND id=$2', [
    organizationId,
    membershipId,
  ]);
  for (const team of teams)
    await tx.query('UPDATE team SET "memberCount"="memberCount"-1 WHERE id=$1', [team.teamId]);
  await tx.query(
    `UPDATE ngertiin_membership_state SET status='removed',generation=generation+1,private_work_suspended=true,removed_at=now()
    WHERE organization_id=$1 AND user_id=$2`,
    [organizationId, target.user_id],
  );
  await tx.query(
    `UPDATE ngertiin_membership_provisioning p SET status='suspended',membership_generation=s.generation,updated_at=now()
    FROM ngertiin_membership_state s WHERE s.organization_id=$1 AND s.user_id=$2 AND p.organization_id=s.organization_id AND p.user_id=s.user_id`,
    [organizationId, target.user_id],
  );
  await tx.query(
    `UPDATE invitation SET status='canceled' WHERE "organizationId"=$1 AND "inviterId"=$2 AND status='pending'`,
    [organizationId, target.user_id],
  );
  await audit(tx, organizationId, actor, "member.removed", membershipId);
  return { removed: true as const };
}
