export interface UserSession {
  user: { id: string; name: string; email: string; email_verified: boolean };
  session_id: string;
  authentication: "web" | "native";
  expires_at: string;
  contract_version?: string;
}
export interface Organization {
  id: string;
  name: string;
  slug: string;
}
export interface OrganizationList {
  organizations: Organization[];
  creation_limit: number;
  created_count: number;
}
export interface OrganizationAccess {
  organization_id: string;
  user_id: string;
  membership_id: string;
  role: "owner" | "admin" | "member";
  membership_generation: number;
  authorization_generation: number;
  workgroup_ids: string[];
  private_work_suspended: boolean;
  capabilities: {
    manage_organization: boolean;
    manage_workgroups: boolean;
    invite_members: boolean;
    elevate_members: boolean;
    read_private_context: false;
  };
}
export interface Member {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: OrganizationAccess["role"];
  private_work_suspended: boolean;
}
export interface Workgroup {
  id: string;
  name: string;
  user_ids: string[];
}
export interface Audience {
  id: string;
  mode: "all_members" | "workgroups";
  workgroup_ids: string[];
}
export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  delivery: "pending" | "sent" | "failed";
  expires_at: string;
  workgroup_ids: string[];
}
export interface AISelection {
  id: string;
  actor_id: string | null;
  scope: "conversation" | "user" | "organization";
  harness: import("@/lib/harnesses").HarnessId;
  thread_id: string | null;
  agent_id: string | null;
  selection: { connection_id: string; model_id: string; reasoning: string | null } | null;
}

export interface WorkspaceAccess {
  invocable_team_agent_ids: string[];
  allowed_organization_connection_ids: string[];
}
