import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ConversationEvent } from "@/features/conversation/components/conversation-event";
import type { Message, Snapshot } from "@/types/workspace";

const states: Record<string, string> = {
  working: "Sedang bekerja",
  waiting_peer: "Menunggu anggota",
  waiting_user: "Menunggu kamu",
  completed: "Selesai",
  failed: "Terhambat",
  cancelled: "Dihentikan",
  unknown: "Hasil belum diketahui",
};

export function CollaborationActivity({
  message,
  snapshot,
}: {
  message: Message;
  snapshot: Snapshot;
}) {
  const task = snapshot.tasks.find((item) => item.request_message_id === message.id);
  if (!task) return null;
  const source =
    snapshot.agents.find((agent) => agent.id === task.source_agent_id)?.name ?? "Agent";
  const target = snapshot.agents.find((agent) => agent.id === task.agent_id)?.name ?? "anggota";
  return (
    <div
      id={`message-${message.id}`}
      data-collaboration-activity
      className="w-full min-w-0"
      role="status"
    >
      <ConversationEvent
        kind="handoff"
        icon={
          <HugeiconsIcon
            icon={UserGroupIcon}
            size={15}
            strokeWidth={1.5}
            className="shrink-0"
            aria-hidden="true"
          />
        }
        label={message.purpose === "review" ? "Meninjau hasil" : "Melanjutkan pekerjaan"}
        name={`${source} → ${target}`}
        status={states[task.state] ?? "Sedang diproses"}
        description={task.summary}
      />
    </div>
  );
}
