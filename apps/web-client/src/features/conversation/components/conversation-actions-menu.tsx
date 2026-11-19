import {
  Add01Icon,
  Download01Icon,
  MoreHorizontalIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportConversation } from "@/features/settings/lib/export-conversation";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { durableCommand, request } from "@/lib/api-client";

export function ConversationActionsMenu({
  newChat,
  cloneProfile,
}: {
  newChat?: () => void;
  cloneProfile?: () => void;
}) {
  const { snapshot, refresh } = useSettingsWorkspace();
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const threadId = snapshot?.thread.id;
  const review =
    snapshot?.runs.find((run) => run.learning_review?.state === "running") ??
    snapshot?.runs.find((run) => run.learning_review?.state === "pending");
  useEffect(() => {
    if (threadId) setBusy(false);
    return () => operation.current?.abort();
  }, [threadId]);
  async function stopReview() {
    if (!review || busy) return;
    const scope = new AbortController();
    operation.current = scope;
    setBusy(true);
    try {
      await durableCommand(
        `stop-review:${review.id}`,
        `/v1/learning/reviews/${review.id}/stop`,
        {},
      );
      if (!scope.signal.aborted) {
        toast.success("Learning review stopped.");
        void refresh().catch(() => {});
      }
    } catch (error) {
      if (!scope.signal.aborted)
        toast.error(error instanceof Error ? error.message : "Could not stop the learning review.");
    } finally {
      if (operation.current === scope) {
        operation.current = null;
        setBusy(false);
      }
    }
  }
  async function download(mode: "conversation" | "export" | "backup" = "conversation") {
    if (!snapshot || busy) return;
    const abort = new AbortController();
    operation.current = abort;
    setBusy(true);
    try {
      const result =
        mode === "conversation"
          ? await exportConversation(snapshot, abort.signal)
          : await request(
              `/v1/threads/${snapshot.thread.id}/profile?mode=${mode}`,
              undefined,
              undefined,
              abort.signal,
            );
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      const label = snapshot.agents[0]?.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      anchor.download =
        mode === "conversation"
          ? `ngertiin-conversation-${snapshot.thread.id}.json`
          : `${label || "ngertiin"}-profile${mode === "backup" ? "-backup" : ""}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(
        mode === "conversation"
          ? "Conversation exported. Attachments are excluded."
          : mode === "backup"
            ? "Agent profile backup downloaded."
            : "Agent profile exported.",
      );
    } catch (error) {
      if (!abort.signal.aborted)
        toast.error(error instanceof Error ? error.message : "Could not export. Try again.");
    } finally {
      if (operation.current === abort) {
        operation.current = null;
        setBusy(false);
      }
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="workspace-toolbar-button"
          aria-label="Conversation menu"
          disabled={!snapshot || busy}
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {newChat && (
          <DropdownMenuItem disabled={busy} onSelect={newChat}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
            New chat with this agent
          </DropdownMenuItem>
        )}
        {cloneProfile && (
          <>
            <DropdownMenuItem onSelect={cloneProfile}>Clone agent profile</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void download("export")}>
              Export agent profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void download("backup")}>
              Back up agent profile
            </DropdownMenuItem>
          </>
        )}
        {review && (
          <DropdownMenuItem disabled={busy} onSelect={() => void stopReview()}>
            <HugeiconsIcon icon={StopIcon} size={16} />
            Stop learning review
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={busy} onSelect={() => void download()}>
          <HugeiconsIcon icon={Download01Icon} size={16} />
          {busy ? "Exporting…" : "Export conversation"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
