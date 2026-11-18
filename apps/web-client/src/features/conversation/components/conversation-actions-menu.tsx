import { Download01Icon, MoreHorizontalIcon } from "@hugeicons/core-free-icons";
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

export function ConversationActionsMenu() {
  const { snapshot } = useSettingsWorkspace();
  const [busy, setBusy] = useState(false);
  const operation = useRef<AbortController | null>(null);
  const threadId = snapshot?.thread.id;
  useEffect(() => {
    if (threadId) setBusy(false);
    return () => operation.current?.abort();
  }, [threadId]);
  async function download() {
    if (!snapshot || busy) return;
    const abort = new AbortController();
    operation.current = abort;
    setBusy(true);
    try {
      const result = await exportConversation(snapshot, abort.signal);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ngertiin-conversation-${snapshot.thread.id}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Conversation exported. Attachments are excluded.");
    } catch (error) {
      if (!abort.signal.aborted)
        toast.error(
          error instanceof Error ? error.message : "Could not export the conversation. Try again.",
        );
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
        <DropdownMenuItem disabled={busy} onSelect={() => void download()}>
          <HugeiconsIcon icon={Download01Icon} size={16} />
          {busy ? "Exporting…" : "Export conversation"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
