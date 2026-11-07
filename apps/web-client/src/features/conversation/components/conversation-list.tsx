import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { conversationSubtitle } from "@/features/conversation/lib/conversation-subtitle";
import { cn } from "@/lib/utils";
import type { Agent, AgentActivity, ConversationPreview, Thread } from "@/types/workspace";
import { ConversationListSkeleton, ConversationRowSkeleton } from "./conversation-loading";
import { AgentAvatar } from "./identity";

/** Prepare mounted portraits behind skeletons, preserving viewport-based avatar rendering. */
export function ConversationList({
  threads,
  agents,
  agentsById,
  activitiesByThread,
  previewsByThread,
  threadId,
  choose,
}: {
  threads: Thread[];
  agents: Agent[];
  agentsById: Map<string, Agent>;
  activitiesByThread: Map<string, AgentActivity[]>;
  previewsByThread: Map<string, ConversationPreview>;
  threadId: string | null;
  choose: (id: string) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [readyRows, setReadyRows] = useState(new Map<string, string>());
  const markReady = useCallback((id: string, identity: string) => {
    setReadyRows((previous) => {
      if (previous.get(id) === identity) return previous;
      return new Map(previous).set(id, identity);
    });
  }, []);

  useLayoutEffect(() => {
    if (revealed) return;
    const element = list.current;
    const nav = element?.closest("nav");
    if (!element || !nav) return;
    const reveal = () => {
      const viewport = nav.getBoundingClientRect();
      if (!viewport.height || !viewport.width) return;
      const visible = Array.from(element.children).filter((row) => {
        const bounds = row.getBoundingClientRect();
        return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
      });
      if (visible.length && visible.every((row) => row.getAttribute("data-row-ready") === "true"))
        setRevealed(true);
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(nav);
    return () => observer.disconnect();
  });

  return (
    <div className="relative" aria-busy={!revealed}>
      {!revealed && (
        <div className="absolute inset-x-0 top-0">
          <ConversationListSkeleton />
        </div>
      )}
      <div
        ref={list}
        className={cn(!revealed && "invisible")}
        aria-hidden={!revealed}
        inert={!revealed}
      >
        {threads.map((thread) => {
          const members = agents.filter((agent) => thread.member_agent_ids.includes(agent.id));
          const member = agentsById.get(thread.member_agent_ids[0]);
          const name = thread.name ?? member?.name ?? "Percakapan";
          const portraits = thread.type === "group" ? members.slice(0, 2) : member ? [member] : [];
          const identity = JSON.stringify(
            portraits.map((agent) => [agent.id, agent.avatar_config]),
          );
          const ready = readyRows.get(thread.id) === identity;
          const subtitle = conversationSubtitle(
            thread,
            agentsById,
            activitiesByThread.get(thread.id) ?? [],
            previewsByThread.get(thread.id),
          );
          return (
            <div key={thread.id} className="relative" data-row-ready={ready}>
              {!ready && (
                <div aria-hidden="true" className="absolute inset-x-0 top-0">
                  <ConversationRowSkeleton />
                </div>
              )}
              <Button
                variant="ghost"
                type="button"
                data-thread-id={thread.id}
                aria-current={thread.id === threadId ? "page" : undefined}
                aria-hidden={!ready}
                inert={!ready}
                onClick={() => choose(thread.id)}
                className={cn(
                  "contact-row gap-3 min-h-[60px] my-0.5 px-2 py-2 rounded-[10px] text-left transition-colors duration-150 flex items-center w-full h-auto whitespace-normal",
                  thread.id === threadId && "contact-row-active",
                  !ready && "invisible",
                )}
              >
                <AgentAvatar
                  key={identity}
                  agent={member}
                  animated
                  followPointer={false}
                  deferred
                  showLoadingActivity
                  threadId={thread.id}
                  name={name}
                  group={thread.type === "group"}
                  largeGroup
                  className="size-11"
                  members={members}
                  onReady={() => markReady(thread.id, identity)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium leading-5">{name}</span>
                  <span
                    title={subtitle}
                    className="contact-description mt-0.5 block truncate text-[13px] leading-[18px] text-muted-foreground"
                  >
                    {subtitle}
                  </span>
                </span>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
