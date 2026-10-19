import { MessageScroller } from "@shadcn/react/message-scroller";
import { ArrowDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Approval, Snapshot } from "@/features/chat/types";
import { ThreadPersonaProposals } from "@/features/persona/components/persona-proposal";
import { ThreadScheduleProposals } from "@/features/schedules/components/schedule-proposal";
import { TaskCard } from "@/features/tasks/components/task-card";
import { cn } from "@/lib/utils";
import { ApprovalCard } from "./approval-card";
import { Message } from "./message";
import { Welcome } from "./welcome";

interface ThreadTranscriptProps {
  snapshot: Snapshot;
  active: boolean;
  loadEarlier: () => Promise<void>;
  onHistoryError: (message: string) => void;
  onDraftChange: (value: string) => void;
  hasDraft: boolean;
  onRetry: () => void;
  decide: (approval: Approval, approved: boolean) => Promise<void>;
}

export function ThreadTranscript({
  snapshot,
  active,
  loadEarlier,
  onHistoryError,
  onDraftChange,
  hasDraft,
  onRetry,
  decide,
}: ThreadTranscriptProps) {
  const empty = snapshot.messages.length === 0;
  const run = snapshot.run;
  return (
    <MessageScroller.Root className="relative min-h-0 flex-1">
      <MessageScroller.Viewport
        className="h-full overflow-x-hidden overflow-y-auto overscroll-contain data-pending-scroll:invisible"
        aria-label="Pesan percakapan"
      >
        <MessageScroller.Content
          className={cn(
            "mx-auto max-w-[800px] px-4 pt-6 pb-12 min-[701px]:px-6",
            empty && "flex min-h-full items-center justify-center py-8",
          )}
          aria-busy={active && run?.status !== "waiting_approval"}
        >
          {snapshot.has_more ? (
            <Button
              variant="ghost"
              className="mb-6 w-full"
              onClick={() => {
                void loadEarlier().catch(() =>
                  onHistoryError("Riwayat sebelumnya belum dapat dimuat."),
                );
              }}
            >
              Lihat pesan sebelumnya
            </Button>
          ) : null}
          {empty ? (
            <Welcome choose={onDraftChange} hasDraft={hasDraft} />
          ) : (
            snapshot.messages.map((message) => (
              <MessageScroller.Item
                key={message.id}
                messageId={message.id}
                className="mb-4 min-w-0"
              >
                <Message message={message} />
                {message.role === "assistant"
                  ? snapshot.approvals
                      .filter((item) => item.run_id === message.run_id)
                      .map((approval) => (
                        <ApprovalCard key={approval.id} approval={approval} decide={decide} />
                      ))
                  : null}
              </MessageScroller.Item>
            ))
          )}
          {run?.status === "failed" ? (
            <div
              className="my-2.5 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger [&_button]:mt-3"
              role="status"
            >
              <p>{run.error}</p>
              <Button type="button" variant="outline" onClick={onRetry}>
                <RefreshCw /> Coba lagi
              </Button>
            </div>
          ) : null}
          {snapshot.tasks?.length ? (
            <section className="mt-6 space-y-3" aria-label="Task di percakapan ini">
              <h2 className="text-sm text-muted-foreground">Pekerjaan di percakapan ini</h2>
              {[...snapshot.tasks]
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .slice(0, 10)
                .map((task) => (
                  <TaskCard key={task.id} task={task} showResult={false} />
                ))}
            </section>
          ) : null}
          <ThreadScheduleProposals threadId={snapshot.thread.id} />
          <ThreadPersonaProposals threadId={snapshot.thread.id} />
        </MessageScroller.Content>
      </MessageScroller.Viewport>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-background to-transparent"
      />
      <Button asChild variant="outline" size="icon">
        <MessageScroller.Button
          direction="end"
          className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border bg-card shadow-sm data-[active=false]:hidden"
          aria-label="Ke pesan terbaru"
        >
          <ArrowDown size={18} />
        </MessageScroller.Button>
      </Button>
    </MessageScroller.Root>
  );
}
