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
      typeof body?.detail === "string"
        ? body.detail
        : typeof body?.detail?.message === "string"
          ? body.detail.message
          : `Request gagal (${response.status}).`,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
