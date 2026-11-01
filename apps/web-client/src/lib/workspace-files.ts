import { command } from "@/lib/api-client";
import type { Artifact, Workspace } from "@/types/work";

export function artifactUrl(artifact: Artifact, workspaceId = artifact.workspace_id) {
  return `/v1/artifacts/${artifact.id}/content?workspace_id=${encodeURIComponent(workspaceId ?? "")}`;
}
export async function uploadFile(workspaceId: string, file: File): Promise<Artifact> {
  if (file.size > 16 * 1024 * 1024) throw new Error("Ukuran file maksimal 16 MB.");
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("File belum dapat dibaca."));
    reader.readAsDataURL(file);
  });
  return command<Artifact>(`/v1/workspaces/${workspaceId}/uploads`, {
    name: file.name,
    media_type: file.type || "application/octet-stream",
    content_base64: content,
  });
}
export async function ensureWorkspace(agentId: string, threadId: string, workspaces: Workspace[]) {
  return (
    workspaces.find(
      (w) => w.state === "active" && w.agent_id === agentId && w.thread_id === threadId,
    ) ?? command<Workspace>("/v1/workspaces", { agent_id: agentId, thread_id: threadId })
  );
}
