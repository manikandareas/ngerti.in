import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { command, request } from "@/lib/api-client";
import { assertScope, clientScope } from "@/lib/client-scope";
import type { Workspace } from "@/types/work";
import type { Snapshot } from "@/types/workspace";

export function WorkspaceProject({
  snapshot,
  refresh,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<unknown>;
}) {
  const inputId = useId();
  const agentId = snapshot.thread.member_agent_ids[0];
  const workspace = snapshot.workspaces.find(
    (item) =>
      item.thread_id === snapshot.thread.id &&
      item.state === "active" &&
      (item.scope === "group" || item.agent_id === agentId),
  );
  const current = workspace?.project_directory ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!agentId) return null;

  async function save() {
    if (busy) return;
    const scope = clientScope();
    setBusy(true);
    setError("");
    try {
      const active =
        workspace ??
        (await request<Workspace | null>(
          `/v1/threads/${snapshot.thread.id}/workspace?agent_id=${agentId}`,
        ));
      if (!active) throw new Error("The workspace is unavailable.");
      assertScope(scope);
      await command(`/v1/workspaces/${active.id}/project-directory`, {
        expected_revision: active.revision,
        directory: (draft ?? current) || null,
      });
      await refresh();
      setDraft(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not select the project folder.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details>
      <summary className="cursor-pointer break-all py-2 text-sm font-medium">
        Workspace · {current || "Working files root"}
      </summary>
      <form
        className="space-y-2 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Label htmlFor={inputId}>Project folder</Label>
        <Input
          id={inputId}
          aria-describedby={`${inputId}-hint`}
          value={draft ?? current}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
        />
        <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
          Enter a folder path from Working files. Leave it blank to use the root.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="sm" disabled={busy || (draft ?? current) === current}>
          Save project folder
        </Button>
      </form>
    </details>
  );
}
