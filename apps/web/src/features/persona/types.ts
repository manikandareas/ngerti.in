export interface PersonaContent {
  name: string;
  tagline: string;
  avatar: "gwen" | "initial";
  soul: string;
}
export interface PersonaProfile extends PersonaContent {
  revision: number;
}
export interface PersonaProposal {
  id: string;
  thread_id: string | null;
  source_run_id: string | null;
  expected_revision: number;
  before_content: PersonaContent;
  content: PersonaContent;
  source: "editor" | "chat" | "restore";
  status: "proposed" | "approved" | "rejected" | "expired";
  applied_revision: number | null;
  expires_at: string;
}
export interface PersonaList {
  profile: PersonaProfile;
  proposals: PersonaProposal[];
}
export interface PersonaRevision {
  revision: number;
  content: PersonaContent;
  source: string;
  restored_from: number | null;
  created_at: string;
}
export interface PersonaHistory {
  revisions: PersonaRevision[];
  has_more: boolean;
}
export type AssistantTab = "activity" | "approvals" | "upcoming" | "identity";
