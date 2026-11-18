import { randomUUID } from "node:crypto";
import { type AudienceWrite, audienceView, ownWorkgroupView, workgroupView } from "./contracts";
import { audit, deny, type Transaction } from "./database";
import { membership } from "./members";

export async function validateWorkgroups(tx: Transaction, organizationId: string, ids: string[]) {
  const result = await tx.query(
    'SELECT id FROM team WHERE "organizationId"=$1 AND id=ANY($2::uuid[])',
    [organizationId, ids],
  );
  if (result.rowCount !== ids.length) throw deny();
}
export async function listWorkgroups(tx: Transaction, organizationId: string) {
  const rows = (
    await tx.query(
      `SELECT t.id,t.name,ARRAY(SELECT tm."userId" FROM "teamMember" tm WHERE tm."teamId"=t.id AND tm.organization_id=$1 ORDER BY tm."userId") AS user_ids
    FROM team t WHERE t."organizationId"=$1 ORDER BY t."createdAt",t.id`,
      [organizationId],
    )
  ).rows;
  return rows.map((row) => workgroupView.parse(row));
}
export async function ownWorkgroups(tx: Transaction, organizationId: string, userId: string) {
  const result = await tx.query(
    `SELECT t.id,t.name FROM team t JOIN "teamMember" tm ON tm."teamId"=t.id
    WHERE t."organizationId"=$1 AND tm.organization_id=$1 AND tm."userId"=$2 ORDER BY t.name,t.id`,
    [organizationId, userId],
  );
  return result.rows.map((row) => ownWorkgroupView.parse(row));
}
export async function writeWorkgroup(
  tx: Transaction,
  organizationId: string,
  actor: string,
  name: string,
  workgroupId?: string,
) {
  if (workgroupId) {
    await validateWorkgroups(tx, organizationId, [workgroupId]);
    await tx.query(
      'UPDATE team SET name=$3,"updatedAt"=now() WHERE "organizationId"=$1 AND id=$2',
      [organizationId, workgroupId, name],
    );
  } else {
    workgroupId = randomUUID();
    await tx.query(
      'INSERT INTO team(id,name,"memberCount","organizationId","createdAt","updatedAt") VALUES($1,$2,0,$3,now(),now())',
      [workgroupId, name, organizationId],
    );
  }
  await audit(tx, organizationId, actor, "workgroup.saved", workgroupId);
  const workgroup = (await listWorkgroups(tx, organizationId)).find(
    (group) => group.id === workgroupId,
  );
  if (!workgroup) throw deny();
  return { workgroup };
}
export async function setWorkgroupMember(
  tx: Transaction,
  organizationId: string,
  actor: string,
  workgroupId: string,
  membershipId: string,
  present: boolean,
) {
  await validateWorkgroups(tx, organizationId, [workgroupId]);
  const target = await membership(tx, organizationId, membershipId);
  await addWorkgroupMember(tx, organizationId, workgroupId, target.user_id, present);
  await audit(
    tx,
    organizationId,
    actor,
    present ? "workgroup.member_added" : "workgroup.member_removed",
    workgroupId,
  );
  const workgroup = (await listWorkgroups(tx, organizationId)).find(
    (group) => group.id === workgroupId,
  );
  if (!workgroup) throw deny();
  return { workgroup };
}
export async function addWorkgroupMember(
  tx: Transaction,
  organizationId: string,
  workgroupId: string,
  userId: string,
  present = true,
) {
  if (present)
    await tx.query(
      `INSERT INTO "teamMember"(id,"teamId","userId","membershipKey","createdAt",organization_id)
    VALUES($1,$2,$3,$4,now(),$5) ON CONFLICT("teamId","userId") DO NOTHING`,
      [randomUUID(), workgroupId, userId, `${workgroupId}:${userId}`, organizationId],
    );
  else
    await tx.query(
      'DELETE FROM "teamMember" WHERE organization_id=$1 AND "teamId"=$2 AND "userId"=$3',
      [organizationId, workgroupId, userId],
    );
  await tx.query(
    'UPDATE team SET "memberCount"=(SELECT count(*) FROM "teamMember" WHERE "teamId"=$1) WHERE id=$1',
    [workgroupId],
  );
}
export async function deleteWorkgroup(
  tx: Transaction,
  organizationId: string,
  actor: string,
  workgroupId: string,
) {
  await validateWorkgroups(tx, organizationId, [workgroupId]);
  await tx.query('DELETE FROM team WHERE "organizationId"=$1 AND id=$2', [
    organizationId,
    workgroupId,
  ]);
  await audit(tx, organizationId, actor, "workgroup.deleted", workgroupId);
  return { deleted: true as const };
}
export async function listAudiences(tx: Transaction, organizationId: string) {
  return (
    await tx.query(
      `SELECT a.id,a.mode,ARRAY(SELECT workgroup_id FROM ngertiin_audience_workgroups WHERE audience_id=a.id ORDER BY workgroup_id) AS workgroup_ids
    FROM ngertiin_audiences a WHERE organization_id=$1 ORDER BY a.id`,
      [organizationId],
    )
  ).rows.map((row) => audienceView.parse(row));
}
export async function writeAudience(
  tx: Transaction,
  organizationId: string,
  actor: string,
  body: AudienceWrite,
  audienceId?: string,
) {
  if (body.mode === "workgroups") await validateWorkgroups(tx, organizationId, body.workgroup_ids);
  if (audienceId) {
    if (
      !(
        await tx.query("UPDATE ngertiin_audiences SET mode=$3 WHERE organization_id=$1 AND id=$2", [
          organizationId,
          audienceId,
          body.mode,
        ])
      ).rowCount
    )
      throw deny();
    await tx.query(
      "DELETE FROM ngertiin_audience_workgroups WHERE organization_id=$1 AND audience_id=$2",
      [organizationId, audienceId],
    );
  } else {
    audienceId = randomUUID();
    await tx.query("INSERT INTO ngertiin_audiences(id,organization_id,mode) VALUES($1,$2,$3)", [
      audienceId,
      organizationId,
      body.mode,
    ]);
  }
  if (body.mode === "workgroups")
    for (const group of body.workgroup_ids)
      await tx.query("INSERT INTO ngertiin_audience_workgroups VALUES($1,$2,$3)", [
        organizationId,
        audienceId,
        group,
      ]);
  await audit(tx, organizationId, actor, "audience.saved", audienceId);
  const audience = (await listAudiences(tx, organizationId)).find((item) => item.id === audienceId);
  if (!audience) throw deny();
  return { audience };
}
export async function audienceAllows(
  tx: Transaction,
  organizationId: string,
  userId: string,
  audienceId: string,
) {
  const result = await tx.query(
    `SELECT 1 FROM ngertiin_audiences a JOIN member m ON m."organizationId"=a.organization_id AND m."userId"=$2
    JOIN ngertiin_membership_state s ON s.organization_id=a.organization_id AND s.user_id=m."userId" AND s.status='active'
    WHERE a.organization_id=$1 AND a.id=$3 AND (a.mode='all_members' OR EXISTS(
      SELECT 1 FROM ngertiin_audience_workgroups g JOIN "teamMember" tm ON tm.organization_id=g.organization_id AND tm."teamId"=g.workgroup_id
      WHERE g.audience_id=a.id AND tm."userId"=$2))`,
    [organizationId, userId, audienceId],
  );
  return Boolean(result.rowCount);
}
