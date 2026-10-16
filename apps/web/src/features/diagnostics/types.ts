export interface Account {
  id: string;
  clerk_user_id: string;
  created_at: string;
}
export interface SystemStatus {
  api_ready: boolean;
  components: Record<string, { status: string; detail: string }>;
}
export interface Run {
  id: string;
  status: string;
  job_id: number;
  attempts: number;
  artifact_id: string | null;
  error: string | null;
  created_at: string;
}
export interface StoredObject {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  created_at: string;
}
