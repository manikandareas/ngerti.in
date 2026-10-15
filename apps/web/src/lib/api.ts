export const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
export const diagnosticsEnabled = import.meta.env.VITE_DEV_DIAGNOSTICS === true;

export async function api<T>(
  path: string,
  token: string | null,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      typeof body?.detail === "string" ? body.detail : `Request gagal (${response.status}).`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

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
