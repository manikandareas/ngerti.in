import { useApiResource } from "@/hooks/use-api-resource";
import { useAccount } from "./session";
import type { Audience, Workgroup } from "./types";

export interface AgentGrant {
  agent_id: string;
  audience_id: string;
}
export function useOrganizationResources(cursor = 0, enabled = true) {
  const account = useAccount();
  const path =
    enabled && account.access?.capabilities.manage_organization
      ? `/v1/organizations/${account.organization?.id}`
      : null;
  const groups = useApiResource<{ workgroups: Workgroup[] }>(path && `${path}/workgroups`, cursor);
  const audiences = useApiResource<{ audiences: Audience[] }>(path && `${path}/audiences`, cursor);
  const grants = useApiResource<{ grants: AgentGrant[] }>(path && `${path}/agent-access`, cursor);
  return {
    groups,
    audiences,
    grants,
    error: groups.error || audiences.error || grants.error,
    loading: !!path && (!groups.data || !audiences.data || !grants.data),
    retry: () => {
      groups.retry();
      audiences.retry();
      grants.retry();
    },
  };
}
