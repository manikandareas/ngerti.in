import { MessageScroller } from "@shadcn/react/message-scroller";
import { ArrowDown, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { Approval, Snapshot } from "@/features/chat/types";
import { transcriptPlacement } from "@/features/chat/utils/transcript-placement";
import { ThreadGoalProposals } from "@/features/goals/components/goal-proposal";
import { ThreadPersonaProposals } from "@/features/persona/components/persona-proposal";
import { ThreadScheduleProposals } from "@/features/schedules/components/schedule-proposal";
import { TaskInline } from "@/features/tasks/components/task-inline";
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
  onReply: (text: string) => void;
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
  onReply,
  onRetry,
  decide,
}: ThreadTranscriptProps) {
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const key = `ngertiin-read-position:${snapshot.thread.id}`;
    const frame = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem(key);
        if (saved !== null) element.scrollTop = Number(saved);
      } catch {
        /* Optional read position storage. */
      }
    });
    const save = () => {
      try {
        sessionStorage.setItem(key, String(element.scrollTop));
      } catch {
        /* Optional storage. */
      }
    };
    element.addEventListener("scroll", save);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("scroll", save);
    };
  }, [snapshot.thread.id]);
  const empty = snapshot.messages.length === 0;
  const run = snapshot.run;
  const { taskAnchors, approvalAnchors } = transcriptPlacement(snapshot);
  return (
    <MessageScroller.Root className="relative min-h-0 flex-1">
      <MessageScroller.Viewport
        ref={viewport}
        className="h-full overflow-x-hidden overflow-y-auto overscroll-contain data-pending-scroll:invisible"
        aria-label="Pesan percakapan"
      >
        <MessageScroller.Content
          className={cn(
            "mx-auto max-w-[768px] px-4 pt-28 pb-12 min-[701px]:px-6",
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
            snapshot.thread.kind === "main" ? (
              <Welcome choose={onDraftChange} hasDraft={hasDraft} />
            ) : (
              <p className="text-sm text-muted-foreground">Mulai percakapan baru dengan Gwen.</p>
            )
          ) : (
            snapshot.messages.map((message) => (
              <MessageScroller.Item
                key={message.id}
                messageId={message.id}
                className="mb-8 min-w-0"
              >
                <Message message={message} onReply={onReply} />
                {message.role === "assistant"
                  ? snapshot.approvals
                      .filter((item) => approvalAnchors.get(item.run_id) === message.id)
                      .map((approval) => (
                        <ApprovalCard key={approval.id} approval={approval} decide={decide} />
                      ))
                  : null}
                {snapshot.tasks
                  ?.filter((task) => taskAnchors.get(task.id) === message.id)
                  .map((task) => (
                    <TaskInline key={task.id} task={task} />
                  ))}
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
          {snapshot.approvals
            .filter((approval) => !approvalAnchors.has(approval.run_id))
            .map((approval) => (
              <ApprovalCard key={approval.id} approval={approval} decide={decide} />
            ))}
          {snapshot.tasks
            ?.filter((task) => !taskAnchors.has(task.id))
            .map((task) => (
              <TaskInline key={task.id} task={task} />
            ))}
          <ThreadScheduleProposals threadId={snapshot.thread.id} />
          <ThreadGoalProposals threadId={snapshot.thread.id} />
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
