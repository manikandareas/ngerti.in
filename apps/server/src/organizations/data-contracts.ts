import { z } from "zod";
import { SCOPED_API_READINESS_GATE } from "../contracts";
import { base, id } from "../contracts/base";

export const preferenceChanges = z.strictObject({
  instructions: z.string().max(100_000).default(""),
  soul: z.string().max(100_000).default(""),
});
export const agentPreference = z.strictObject({
  ...base,
  kind: z.literal("agent_preference"),
  agent_id: id,
  changes: preferenceChanges,
});
export const publishedKnowledge = z.strictObject({
  ...base,
  kind: z.literal("published_knowledge"),
  agent_id: id,
  text: z.string().min(1).max(100_000),
  state: z.enum(["active", "deleted"]),
});
export const teamAgentWrite = z.strictObject({
  name: z.string().trim().min(1).max(200),
  harness: z.enum(["codex", "muse"]),
  instructions: z.string().max(100_000).default(""),
  soul: z.string().max(100_000).default(""),
  audience_id: id,
});
export function scopedDataContract() {
  return {
    version: "nma-075.1",
    readiness_gate: SCOPED_API_READINESS_GATE,
    organization_header: "X-Ngertiin-Organization",
    cursor_header: "X-Ngertiin-Event-Context",
    cursors: "server_signed_user_organization_membership_and_authorization_generation",
    private_data: "organization_and_user_never_administrator_inheritance",
    default_agent: "idempotent_library_generated_single_syllable_name",
    provider_connections: {
      version: "nma-077.1",
      ownership: ["personal", "organization"],
      selection: "conversation_then_user_then_allowed_organization_only_when_unset",
      admission: "immutable_connection_generation_account_model_billing_snapshot",
      credentials: "server_only_encrypted_keys_actor_private_native_homes",
      native_execution: "scoped_selected_provider_and_private_execution_domain",
    },
    native_execution: "scoped_selected_provider_and_private_execution_domain",
    applications: {
      version: "nma-078.1",
      ownership: ["personal", "organization"],
      organization_access: "audience_and_agent_tool_resource_grants",
      routing: "backend_identity_and_exact_connected_account_no_fallback",
      effects: "actor_private_receipts_and_durable_connected_account_holds",
      native_catalog: "scoped_product_gateway_only_no_ambient_native_configuration",
    },
    skills: {
      version: "nma-078.1",
      team: "management_published_immutable_revision_and_explicit_pinned_assignment",
      personal: "private_application_packages_and_preferences",
      inherited: "read_only_selected_actor_provider_binding",
    },
    switching: "explicit_request_scope_preserved_by_retry_no_session_active_organization",
  };
}
