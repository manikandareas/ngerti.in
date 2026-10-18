import { apiUrl } from "@/lib/api";
import type { UploadedFile } from "./types";

export function uploadFile(
  file: File,
  token: string | null,
  requestKey: string,
  progress: (value: number) => void,
  signal: AbortSignal,
  fileId?: string,
): Promise<UploadedFile> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", `${apiUrl}/files${fileId ? `/${fileId}/revisions` : ""}`);
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(Math.round((event.loaded / event.total) * 95));
    };
    const abort = () => request.abort();
    signal.addEventListener("abort", abort, { once: true });
    request.onloadend = () => signal.removeEventListener("abort", abort);
    request.onerror = () =>
      reject(new Error("Upload terputus. Pilih Coba lagi untuk melanjutkan."));
    request.onabort = () => reject(new Error("Upload dibatalkan."));
    request.onload = () => {
      let data: UploadedFile & { detail?: string };
      try {
        data = JSON.parse(request.responseText);
      } catch {
        reject(new Error("Respons upload belum dapat dibaca. Coba lagi."));
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        progress(100);
        resolve(data);
      } else reject(new Error(typeof data.detail === "string" ? data.detail : "Upload ditolak."));
    };
    const body = new FormData();
    body.append("request_key", requestKey);
    body.append("file", file);
    if (signal.aborted) reject(new Error("Upload dibatalkan."));
    else request.send(body);
  });
}

export async function fileContent(revisionId: string, token: string | null, signal?: AbortSignal) {
  const response = await fetch(`${apiUrl}/files/revisions/${revisionId}/content`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail ?? "File tidak tersedia atau telah dihapus.");
  }
  return response.blob();
}

export async function downloadFile(revisionId: string, filename: string, token: string | null) {
  const blob = await fileContent(revisionId, token);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
