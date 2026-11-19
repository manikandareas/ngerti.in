import { MoreHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useApiResource } from "@/hooks/use-api-resource";
import { command } from "@/lib/api-client";
import type { Memory, Snapshot } from "@/types/workspace";
import { PanelHelp } from "./panel-help";

type Context = { agent_id: string; thread_id: string };

function MemoryRow({
  memory,
  context,
  refresh,
}: {
  memory: Memory;
  context: Context;
  refresh: () => void;
}) {
  const [draft, setDraft] = useState<{ revision: number; text: string } | null>(null);
  const [forgetting, setForgetting] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply(change: "write" | "delete", expected_revision: number, text?: string) {
    setBusy(true);
    setError("");
    try {
      await command(`/v1/learning/memories/${change}`, {
        context,
        memory_id: memory.id,
        expected_revision,
        ...(change === "write" ? { text, visibility: memory.visibility } : {}),
      });
      setDraft(null);
      setForgetting(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not update this memory.");
    } finally {
      setBusy(false);
      refresh();
    }
  }

  function cancel() {
    setDraft(null);
    setForgetting(null);
    setError("");
  }

  return (
    <div className="space-y-2">
      {draft ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void apply("write", draft.revision, draft.text.trim());
          }}
        >
          <Textarea
            aria-label="Memory text"
            value={draft.text}
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
            maxLength={8000}
            disabled={busy}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !draft.text.trim()}>
              Save memory
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground">
            {memory.text}
          </p>
          {forgetting === null && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Memory actions" disabled={busy}>
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => setDraft({ revision: memory.revision, text: memory.text })}
                >
                  Edit memory
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setForgetting(memory.revision)}>
                  Forget memory
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
      {forgetting !== null && (
        <div className="space-y-2">
          <p className="text-[13px]">Forget this memory?</p>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void apply("delete", forgetting)}
            >
              Forget memory
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px]">
          {error}
        </p>
      )}
    </div>
  );
}

function MemoryText({ path, cursor, context }: { path: string; cursor: number; context: Context }) {
  const [expanded, setExpanded] = useState(false);
  const resource = useApiResource<{ memories: Memory[]; next_after: string | null }>(path, cursor);
  if (resource.error)
    return (
      <div role="alert" className="text-[13px]">
        <p>{resource.error}</p>
        <Button variant="ghost" size="sm" onClick={resource.retry}>
          Try again
        </Button>
      </div>
    );
  if (!resource.data)
    return (
      <p role="status" className="text-[13px] text-muted-foreground">
        Loading memories…
      </p>
    );
  return (
    <div className="space-y-3">
      {resource.data.memories.map((memory) => (
        <MemoryRow key={memory.id} memory={memory} context={context} refresh={resource.retry} />
      ))}
      {!resource.data.memories.length && (
        <p className="text-[13px] text-muted-foreground">No memories from this conversation yet.</p>
      )}
      {resource.data.next_after &&
        (expanded ? (
          <MemoryText
            key={resource.data.next_after}
            cursor={cursor}
            context={context}
            path={`${path.split("&after=")[0]}&after=${encodeURIComponent(resource.data.next_after)}`}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="px-0 text-muted-foreground"
            onClick={() => setExpanded(true)}
          >
            Show more memories
          </Button>
        ))}
    </div>
  );
}

export function LibraryMemory({ snapshot }: { snapshot: Snapshot }) {
  const agent = snapshot.agents[0];
  const context = agent ? { agent_id: agent.id, thread_id: snapshot.thread.id } : null;
  return (
    <section className="pt-5" aria-label="Memory">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[16px] font-semibold">Memory</h3>
        <PanelHelp topic="Memory" />
      </div>
      {snapshot.thread.type === "dm" && context ? (
        <MemoryText
          key={`${context.agent_id}:${context.thread_id}`}
          cursor={snapshot.cursor}
          context={context}
          path={`/v1/learning/memories?${new URLSearchParams(context)}`}
        />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Private memories stay in direct conversations.
        </p>
      )}
    </section>
  );
}
