import type { ReactNode } from "react";
import { Message, MessageContent } from "@/components/ui/message";
import type { ReferenceAgent } from "../lib/inline-references";
import { AgentAvatar } from "./identity";

/** Shared attribution for assistant text, interactions and Computer activity. */
export function AgentMessageAvatar({
  agent,
  loading = false,
  open,
}: {
  agent?: ReferenceAgent;
  loading?: boolean;
  open?: () => void;
}) {
  return (
    <button
      type="button"
      className="group-message-avatar mt-0.5 size-8 shrink-0 self-start rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Profil ${agent?.name ?? "agent"}`}
      disabled={!open}
      onClick={open}
    >
      <AgentAvatar
        agent={agent}
        className="size-8"
        animated
        followPointer
        showLoadingActivity={loading}
        state={loading ? undefined : "idle"}
      />
    </button>
  );
}

export function AssistantMessage({
  agent,
  group,
  open,
  children,
}: {
  agent?: ReferenceAgent;
  group: boolean;
  open?: () => void;
  children: ReactNode;
}) {
  return (
    <Message className="conversation-message">
      {group && <AgentMessageAvatar agent={agent} open={open} />}
      <MessageContent>{children}</MessageContent>
    </Message>
  );
}
