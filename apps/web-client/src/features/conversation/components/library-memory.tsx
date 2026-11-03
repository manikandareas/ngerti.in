import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useApiResource } from "@/hooks/use-api-resource";
import type { Memory, Snapshot } from "@/types/workspace";
import { PanelHelp } from "./panel-help";

function MemoryText({ path, cursor }: { path: string; cursor: number }) {
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
        <p
          key={memory.id}
          className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-muted-foreground"
        >
          {memory.text}
        </p>
      ))}
      {!resource.data.memories.length && (
        <p className="text-[13px] text-muted-foreground">No memories from this conversation yet.</p>
      )}
      {resource.data.next_after &&
        (expanded ? (
          <MemoryText
            key={resource.data.next_after}
            cursor={cursor}
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
  return (
    <section className="pt-5" aria-label="Memory">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[16px] font-semibold">Memory</h3>
        <PanelHelp topic="Memory" />
      </div>
      {snapshot.thread.type === "dm" && agent ? (
        <MemoryText
          key={`${agent.id}:${snapshot.thread.id}`}
          cursor={snapshot.cursor}
          path={`/v1/learning/memories?${new URLSearchParams({ agent_id: agent.id, thread_id: snapshot.thread.id })}`}
        />
      ) : (
        <p className="text-[13px] text-muted-foreground">
          Private memories stay in direct conversations.
        </p>
      )}
    </section>
  );
}
