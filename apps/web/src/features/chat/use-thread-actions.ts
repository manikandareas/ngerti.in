import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { postChatCommand } from "./chat-api";
import type { Approval, ChatRun } from "./types";

export function useThreadActions(
  run: ChatRun | null | undefined,
  setError: (message: string) => void,
) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  async function decide(approval: Approval, approved: boolean): Promise<void> {
    await postChatCommand(`/chat/approvals/${approval.id}/decision`, await getToken(), {
      revision: approval.revision,
      approved,
      request_key: crypto.randomUUID(),
    });
  }
  async function changeRun(action: "retry" | "cancel"): Promise<void> {
    if (!run) return;
    setError("");
    try {
      await postChatCommand(
        `/chat/runs/${run.id}/${action}`,
        await getToken(),
        action === "retry" ? { request_key: crypto.randomUUID() } : undefined,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Permintaan belum tersimpan.");
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["quotas", userId] });
    }
  }

  return {
    decide,
    cancel: () => changeRun("cancel"),
    retry: () => changeRun("retry"),
  };
}
