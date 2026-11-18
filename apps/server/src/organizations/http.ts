import type { Elysia } from "elysia";
import { z } from "zod";
import { authenticationResponse } from "../auth/http";
import { DomainError } from "../contracts";
import {
  audienceWrite,
  invitationWrite,
  organizationId,
  organizationWrite,
  role,
  workgroupWrite,
} from "./contracts";
import { deny } from "./database";
import { acceptInvitation, cancelInvitation, createInvitation } from "./invitations";
import { changeRole, provisioning, removeMember } from "./members";
import type { Organizations } from "./service";
import {
  deleteWorkgroup,
  listAudiences,
  listWorkgroups,
  ownWorkgroups,
  setWorkgroupMember,
  writeAudience,
  writeWorkgroup,
} from "./workgroups";

export function registerOrganizationRoutes(api: Elysia, orgs: Organizations) {
  const db = orgs.database;
  const groupParams = organizationId.extend({ workgroupId: z.uuid() });
  const invitationParams = organizationId.extend({ invitationId: z.uuid() });
  const audienceParams = organizationId.extend({ audienceId: z.uuid() });
  const memberParams = organizationId.extend({ membershipId: z.uuid() });
  const empty = z.strictObject({});
  return api
    .get("/v1/organizations", async ({ request }) =>
      authenticationResponse(await orgs.list(request)),
    )
    .post(
      "/v1/organizations",
      async ({ request, body }) => authenticationResponse(await orgs.create(request, body)),
      { body: organizationWrite },
    )
    .get(
      "/v1/organizations/:organizationId",
      async ({ request, params }) =>
        authenticationResponse(await orgs.context(request, params.organizationId)),
      { params: organizationId },
    )
    .post(
      "/v1/organizations/:organizationId",
      async ({ request, params, body }) =>
        authenticationResponse(await orgs.update(request, params.organizationId, body)),
      { params: organizationId, body: organizationWrite },
    )
    .delete(
      "/v1/organizations/:organizationId",
      async ({ request, params }) => {
        await orgs.context(request, params.organizationId);
        throw new DomainError("SCOPE_DENIED", 403);
      },
      { params: organizationId, body: empty },
    )
    .get(
      "/v1/organizations/:organizationId/members",
      async ({ request, params }) =>
        authenticationResponse(await orgs.members(request, params.organizationId)),
      { params: organizationId },
    )
    .post(
      "/v1/organizations/:organizationId/members/:membershipId/role",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "owner", (tx, actor) =>
            changeRole(tx, params.organizationId, actor, params.membershipId, body.role),
          ),
        ),
      { params: memberParams, body: z.strictObject({ role }) },
    )
    .post(
      "/v1/organizations/:organizationId/members/:membershipId/remove",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "member", (tx, actor, context) => {
            if (!context) throw deny();
            return removeMember(
              tx,
              params.organizationId,
              actor,
              context.role,
              params.membershipId,
            );
          }),
        ),
      { params: memberParams, body: empty },
    )
    .get(
      "/v1/organizations/:organizationId/provisioning",
      async ({ request, params }) =>
        authenticationResponse(
          await db.read(request, params.organizationId, "member", async (tx, context) => ({
            provisioning: await provisioning(tx, params.organizationId, context.user_id),
          })),
        ),
      { params: organizationId },
    )
    .post(
      "/v1/organizations/:organizationId/private-work/resume",
      async ({ request, params }) =>
        authenticationResponse(await orgs.resumePrivateWork(request, params.organizationId)),
      { params: organizationId, body: empty },
    )
    .get(
      "/v1/organizations/:organizationId/my-workgroups",
      async ({ request, params }) =>
        authenticationResponse(
          await db.read(request, params.organizationId, "member", async (tx, context) => ({
            workgroups: await ownWorkgroups(tx, params.organizationId, context.user_id),
          })),
        ),
      { params: organizationId },
    )
    .get(
      "/v1/organizations/:organizationId/workgroups",
      async ({ request, params }) =>
        authenticationResponse(
          await db.read(request, params.organizationId, "manage", async (tx) => ({
            workgroups: await listWorkgroups(tx, params.organizationId),
          })),
        ),
      { params: organizationId },
    )
    .post(
      "/v1/organizations/:organizationId/workgroups",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "manage", (tx, actor) =>
            writeWorkgroup(tx, params.organizationId, actor, body.name),
          ),
        ),
      { params: organizationId, body: workgroupWrite },
    )
    .post(
      "/v1/organizations/:organizationId/workgroups/:workgroupId",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "manage", (tx, actor) =>
            writeWorkgroup(tx, params.organizationId, actor, body.name, params.workgroupId),
          ),
        ),
      { params: groupParams, body: workgroupWrite },
    )
    .post(
      "/v1/organizations/:organizationId/workgroups/:workgroupId/delete",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "manage", (tx, actor) =>
            deleteWorkgroup(tx, params.organizationId, actor, params.workgroupId),
          ),
        ),
      { params: groupParams, body: empty },
    )
    .post(
      "/v1/organizations/:organizationId/workgroups/:workgroupId/members",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "manage", (tx, actor) =>
            setWorkgroupMember(
              tx,
              params.organizationId,
              actor,
              params.workgroupId,
              body.membership_id,
              body.present,
            ),
          ),
        ),
      {
        params: groupParams,
        body: z.strictObject({ membership_id: z.uuid(), present: z.boolean() }),
      },
    )
    .get(
      "/v1/organizations/:organizationId/audiences",
      async ({ request, params }) =>
        authenticationResponse(
          await db.read(request, params.organizationId, "manage", async (tx) => ({
            audiences: await listAudiences(tx, params.organizationId),
          })),
        ),
      { params: organizationId },
    )
    .post(
      "/v1/organizations/:organizationId/audiences",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "manage", (tx, actor) =>
            writeAudience(tx, params.organizationId, actor, body),
          ),
        ),
      { params: organizationId, body: audienceWrite },
    )
    .post(
      "/v1/organizations/:organizationId/audiences/:audienceId",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "manage", (tx, actor) =>
            writeAudience(tx, params.organizationId, actor, body, params.audienceId),
          ),
        ),
      { params: audienceParams, body: audienceWrite },
    )
    .get(
      "/v1/organizations/:organizationId/audiences/:audienceId/access",
      async ({ request, params }) =>
        authenticationResponse(
          await orgs.allows(request, params.organizationId, params.audienceId),
        ),
      { params: audienceParams },
    )
    .get(
      "/v1/organizations/:organizationId/invitations",
      async ({ request, params }) =>
        authenticationResponse(await orgs.invitations(request, params.organizationId)),
      { params: organizationId },
    )
    .post(
      "/v1/organizations/:organizationId/invitations",
      async ({ request, params, body }) => {
        const result = await db.command(
          request,
          params.organizationId,
          body,
          "manage",
          (tx, actor) => createInvitation(tx, params.organizationId, actor, body),
        );
        return authenticationResponse(
          await orgs.deliverInvitation(request, params.organizationId, result.invitation.id),
        );
      },
      { params: organizationId, body: invitationWrite },
    )
    .post(
      "/v1/organizations/:organizationId/invitations/:invitationId/cancel",
      async ({ request, params, body }) =>
        authenticationResponse(
          await db.command(request, params.organizationId, body, "manage", (tx, actor) =>
            cancelInvitation(tx, params.organizationId, actor, params.invitationId),
          ),
        ),
      { params: invitationParams, body: empty },
    )
    .post(
      "/v1/organizations/:organizationId/invitations/:invitationId/send",
      async ({ request, params }) =>
        authenticationResponse(
          await orgs.deliverInvitation(request, params.organizationId, params.invitationId),
        ),
      { params: invitationParams, body: empty },
    )
    .get(
      "/v1/invitations/:invitationId",
      async ({ request, params }) =>
        authenticationResponse(await orgs.reviewInvitation(request, params.invitationId)),
      { params: z.strictObject({ invitationId: z.uuid() }) },
    )
    .post(
      "/v1/invitations/:invitationId/accept",
      async ({ request, params, body }) => {
        const organizationId = await orgs.invitationOrganizationId(params.invitationId);
        return authenticationResponse(
          await db.command(request, organizationId, body, null, (tx, actor) =>
            acceptInvitation(tx, organizationId, actor, params.invitationId),
          ),
        );
      },
      { params: z.strictObject({ invitationId: z.uuid() }), body: empty },
    )
    .get(
      "/v1/organizations/:organizationId/audit",
      async ({ request, params, query }) =>
        authenticationResponse(
          await db.read(request, params.organizationId, "manage", async (tx) => ({
            audit: await orgs.auditRows(tx, params.organizationId, query.after),
          })),
        ),
      {
        params: organizationId,
        query: z.strictObject({
          after: z
            .string()
            .regex(/^[0-9]{1,18}$/)
            .default("0"),
        }),
      },
    )
    .get(
      "/v1/organizations/:organizationId/export",
      async ({ request, params }) =>
        authenticationResponse(await orgs.export(request, params.organizationId)),
      { params: organizationId },
    );
}
