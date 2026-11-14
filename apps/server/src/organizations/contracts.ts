import { z } from "zod";
import { SCOPED_API_READINESS_GATE } from "../contracts";

export const role = z.enum(["owner", "admin", "member"]);
export type Role = z.infer<typeof role>;
export const organizationId = z.strictObject({ organizationId: z.uuid() });
export const organizationWrite = z.strictObject({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
});
export const workgroupWrite = z.strictObject({ name: z.string().trim().min(1).max(120) });
export const workgroupIds = z
  .array(z.uuid())
  .max(100)
  .refine((ids) => new Set(ids).size === ids.length);
export const invitationWrite = z.strictObject({
  email: z
    .email()
    .max(254)
    .transform((value) => value.trim().toLowerCase()),
  role: z.enum(["admin", "member"]),
  workgroup_ids: workgroupIds.default([]),
});
export type InvitationWrite = z.infer<typeof invitationWrite>;
export const audienceWrite = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("all_members") }),
  z.strictObject({ mode: z.literal("workgroups"), workgroup_ids: workgroupIds }),
]);
export type AudienceWrite = z.infer<typeof audienceWrite>;
export const membershipView = z.strictObject({
  id: z.uuid(),
  user_id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role,
  generation: z.int().positive(),
  private_work_suspended: z.boolean(),
});
export const organizationView = organizationWrite.extend({ id: z.uuid() });
export const accessView = z.strictObject({
  organization_id: z.uuid(),
  user_id: z.uuid(),
  membership_id: z.uuid(),
  role,
  membership_generation: z.int().positive(),
  authorization_generation: z.int().positive(),
  workgroup_ids: z.array(z.uuid()),
  private_work_suspended: z.boolean(),
  capabilities: z.strictObject({
    manage_organization: z.boolean(),
    manage_workgroups: z.boolean(),
    invite_members: z.boolean(),
    elevate_members: z.boolean(),
    read_private_context: z.literal(false),
  }),
});
export type AccessContext = z.infer<typeof accessView>;
export const provisioningView = z.strictObject({
  id: z.uuid(),
  organization_id: z.uuid(),
  user_id: z.uuid(),
  membership_generation: z.int().positive(),
  status: z.enum(["pending", "materialized", "suspended"]),
});
export const workgroupView = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  user_ids: z.array(z.uuid()),
});
export const audienceView = z.strictObject({
  id: z.uuid(),
  mode: z.enum(["all_members", "workgroups"]),
  workgroup_ids: z.array(z.uuid()),
});
export const invitationView = z.strictObject({
  id: z.uuid(),
  organization_id: z.uuid(),
  email: z.email(),
  role: z.enum(["admin", "member"]),
  status: z.enum(["pending", "accepted", "canceled", "rejected"]),
  expires_at: z.iso.datetime(),
  workgroup_ids: z.array(z.uuid()),
  delivery: z.enum(["pending", "sent", "failed"]),
});
export const auditView = z.strictObject({
  sequence: z.string(),
  actor_user_id: z.uuid().nullable(),
  action: z.string(),
  target_id: z.uuid().nullable(),
  authorization_generation: z.int().nullable(),
  created_at: z.iso.datetime(),
});

export function organizationsContract() {
  return {
    version: "nma-074.1",
    readiness_gate: SCOPED_API_READINESS_GATE,
    base_path: "/v1/organizations",
    organization_context: "explicit_path_and_current_membership_never_session_active_organization",
    creation_policy: "operator_entitlement_default_bootstrap_one_other_accounts_zero",
    roles: ["owner", "admin", "member"],
    workgroups: "better_auth_teams_multiple_per_member",
    audience: "explicit_all_members_or_union_of_current_workgroup_memberships",
    administrative_elevation: "owner_only_last_owner_protected",
    invitations: "verified_email_bound_48_hours_current_inviter_generation_and_workgroups",
    commands: "required_uuid_idempotency_key_actor_bound_receipt_reauthorized_before_replay",
    provisioning:
      "durable_user_organization_intent_nma_075_materializes_random_named_default_agent_dm",
    offboarding:
      "retained_tombstone_and_attribution_private_work_principal_suspended_no_automatic_reassignment",
    organization_deletion: "disabled",
    private_application_data: "explicit_organization_user_context_guarded_legacy_binding_nma_075",
    export: "owner_only_administrative_metadata_no_private_context_or_credentials",
  };
}
