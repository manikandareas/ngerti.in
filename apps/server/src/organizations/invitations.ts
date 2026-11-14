import { randomUUID } from "node:crypto";
import { type InvitationWrite, invitationView } from "./contracts";
import { accessContext, audit, conflict, deny, requireRole, type Transaction } from "./database";
import { addMembership, provisioning } from "./members";
import { addWorkgroupMember, validateWorkgroups } from "./workgroups";

export async function invitation(tx: Transaction, organizationId: string, invitationId: string) {
  const row = (
    await tx.query(
      `SELECT i.id,i."organizationId" AS organization_id,i.email,i.role,i.status,i."expiresAt" AS expires_at,s.delivery,
    ARRAY(SELECT workgroup_id FROM ngertiin_invitation_workgroups WHERE invitation_id=i.id ORDER BY workgroup_id) AS workgroup_ids
    FROM invitation i JOIN ngertiin_invitation_state s ON s.invitation_id=i.id
    WHERE i."organizationId"=$1 AND i.id=$2`,
      [organizationId, invitationId],
    )
  ).rows[0];
  if (!row) throw deny();
  return invitationView.parse({ ...row, expires_at: row.expires_at.toISOString() });
}
export async function createInvitation(
  tx: Transaction,
  organizationId: string,
  actor: string,
  body: InvitationWrite,
) {
  const context = await accessContext(tx, actor, organizationId);
  requireRole(context.role, body.role === "admin" ? "owner" : "manage");
  await validateWorkgroups(tx, organizationId, body.workgroup_ids);
  if (
    (
      await tx.query(
        'SELECT 1 FROM member m JOIN "user" u ON u.id=m."userId" WHERE m."organizationId"=$1 AND lower(u.email)=$2',
        [organizationId, body.email],
      )
    ).rowCount
  )
    throw conflict();
  // Expired pending rows no longer occupy the pending-email uniqueness slot.
  await tx.query(
    "UPDATE invitation SET status='canceled' WHERE \"organizationId\"=$1 AND lower(email)=$2 AND status='pending' AND \"expiresAt\"<=now()",
    [organizationId, body.email],
  );
  if (
    Number(
      (
        await tx.query(
          'SELECT count(*) FROM invitation WHERE "organizationId"=$1 AND status=\'pending\' AND "expiresAt">now()',
          [organizationId],
        )
      ).rows[0].count,
    ) >= 100
  )
    throw conflict();
  const id = randomUUID();
  await tx.query(
    'INSERT INTO invitation(id,"organizationId",email,role,status,"expiresAt","createdAt","inviterId") VALUES($1,$2,$3,$4,\'pending\',now()+interval \'48 hours\',now(),$5)',
    [id, organizationId, body.email, body.role, actor],
  );
  await tx.query(
    "INSERT INTO ngertiin_invitation_state(invitation_id,organization_id,inviter_membership_id,inviter_generation) VALUES($1,$2,$3,$4)",
    [id, organizationId, context.membership_id, context.membership_generation],
  );
  for (const group of body.workgroup_ids)
    await tx.query("INSERT INTO ngertiin_invitation_workgroups VALUES($1,$2)", [id, group]);
  await audit(tx, organizationId, actor, "invitation.created", id);
  return { invitation: await invitation(tx, organizationId, id) };
}
export async function cancelInvitation(
  tx: Transaction,
  organizationId: string,
  actor: string,
  invitationId: string,
) {
  const current = await invitation(tx, organizationId, invitationId);
  const context = await accessContext(tx, actor, organizationId);
  requireRole(context.role, current.role === "admin" ? "owner" : "manage");
  if (current.status !== "pending") throw conflict();
  await tx.query("UPDATE invitation SET status='canceled' WHERE id=$1", [invitationId]);
  await audit(tx, organizationId, actor, "invitation.canceled", invitationId);
  return { invitation: await invitation(tx, organizationId, invitationId) };
}
export async function acceptInvitation(
  tx: Transaction,
  organizationId: string,
  actor: string,
  invitationId: string,
) {
  const row = (
    await tx.query(
      `SELECT i.*,s.inviter_membership_id,s.inviter_generation,s.accepted_user_id,s.accepted_generation,
    i."expiresAt">clock_timestamp() AS unexpired,u.email AS user_email,u."emailVerified" AS verified
    FROM invitation i JOIN ngertiin_invitation_state s ON s.invitation_id=i.id CROSS JOIN "user" u
    WHERE i.id=$1 AND i."organizationId"=$2 AND u.id=$3 FOR UPDATE OF i`,
      [invitationId, organizationId, actor],
    )
  ).rows[0];
  if (!row?.verified || row.email !== row.user_email.toLowerCase()) throw deny();
  if (row.status === "accepted") {
    const current = await accessContext(tx, actor, organizationId);
    if (row.accepted_user_id !== actor || row.accepted_generation !== current.membership_generation)
      throw deny();
    return {
      membership: await addMembership(tx, organizationId, actor, row.role),
      provisioning: await provisioning(tx, organizationId, actor),
    };
  }
  if (row.status !== "pending" || !row.unexpired) throw deny();
  const inviter = await accessContext(tx, row.inviterId, organizationId);
  if (
    inviter.membership_id !== row.inviter_membership_id ||
    inviter.membership_generation !== row.inviter_generation
  )
    throw deny();
  requireRole(inviter.role, row.role === "admin" ? "owner" : "manage");
  const groups = (await invitation(tx, organizationId, invitationId)).workgroup_ids;
  await validateWorkgroups(tx, organizationId, groups);
  const member = await addMembership(tx, organizationId, actor, row.role);
  for (const group of groups) await addWorkgroupMember(tx, organizationId, group, actor);
  await tx.query("UPDATE invitation SET status='accepted' WHERE id=$1", [invitationId]);
  await tx.query(
    "UPDATE ngertiin_invitation_state SET accepted_user_id=$2,accepted_generation=$3 WHERE invitation_id=$1",
    [invitationId, actor, member.generation],
  );
  await audit(tx, organizationId, actor, "invitation.accepted", invitationId);
  return { membership: member, provisioning: await provisioning(tx, organizationId, actor) };
}
