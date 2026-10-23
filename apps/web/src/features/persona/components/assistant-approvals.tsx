import { ChevronDown, ShieldCheck } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApprovalCard } from "@/features/chat/components/approval-card";
import { useThread } from "@/features/chat/hooks/use-thread";
import { useThreadActions } from "@/features/chat/hooks/use-thread-actions";
import { useResourceContext } from "@/features/library/components/resource-context";
import { taskStage } from "@/features/tasks/constants";
import { useTasks } from "@/features/tasks/hooks/use-tasks";

const statusLabels: Record<string, string> = {
  approved: "Disetujui",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  executed: "Dilaksanakan",
  succeeded: "Dilaksanakan",
  cancelled: "Dibatalkan",
  unknown: "Hasil belum pasti",
  executing: "Sedang dilaksanakan",
};

function HistoryItem({
  title,
  description,
  status,
  date,
  children,
}: {
  title: string;
  description?: string;
  status: string;
  date?: string;
  children: ReactNode;
}) {
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg py-2 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
            <ShieldCheck className="size-5 text-muted-foreground" strokeWidth={1.6} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium wrap-anywhere">{title}</span>
            {description ? (
              <span className="mt-1 block text-sm leading-relaxed text-muted-foreground wrap-anywhere">
                {description}
              </span>
            ) : null}
            <span className="mt-1.5 block text-xs text-muted-foreground">
              {statusLabels[status] ?? status}
              {date ? (
                <>
                  {" "}
                  ·{" "}
                  <time dateTime={date}>
                    {new Date(date).toLocaleDateString("id-ID", { dateStyle: "medium" })}
                  </time>
                </>
              ) : null}
            </span>
          </span>
          <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground group-open:rotate-180" />
        </summary>
        <div className="ml-12 mt-2 text-sm text-muted-foreground">{children}</div>
      </details>
    </li>
  );
}

export function AssistantApprovals({ threadId }: { threadId: string | null }) {
  const thread = useThread(threadId);
  const actions = useThreadActions(thread.snapshot?.run, () => {});
  const tasks = useTasks();
  const context = useResourceContext();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const approvals = thread.snapshot?.approvals ?? [];
  const isActive = (approval: (typeof approvals)[number]) =>
    approval.status === "pending" && Date.parse(approval.expires_at) > now;
  const activeApprovals = approvals.filter(isActive);
  const pastApprovals = approvals.filter((approval) => !isActive(approval));
  const pending = tasks.data?.tasks.filter((task) => task.status === "waiting_user") ?? [];
  const history =
    tasks.data?.tasks.filter((task) => task.action && task.action.status !== "proposed") ?? [];
  const hasActive = activeApprovals.length > 0 || pending.length > 0;
  const loading = tasks.isPending || (Boolean(threadId) && !thread.snapshot && !thread.error);
  const failed = Boolean(thread.error) || tasks.isError;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">
        {hasActive
          ? "Perlu persetujuan"
          : loading || failed
            ? "Persetujuan"
            : "Riwayat persetujuan"}
      </h3>
      {thread.error ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>{thread.error}</p>
          <Button variant="outline" onClick={thread.refresh}>
            Coba lagi
          </Button>
        </div>
      ) : null}
      {tasks.isError ? (
        <div role="alert" className="space-y-2 text-sm">
          <p>Persetujuan pekerjaan belum dapat dimuat.</p>
          <Button variant="outline" onClick={() => void tasks.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Memuat persetujuan…
        </p>
      ) : null}
      {hasActive ? (
        <div className="space-y-4">
          {activeApprovals.map((approval) => (
            <ApprovalCard key={approval.id} approval={approval} decide={actions.decide} />
          ))}
          {pending.length ? (
            <ul className="space-y-3">
              {pending.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-start gap-3 rounded-lg py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                    onClick={() => context.open({ kind: "task", id: task.id })}
                  >
                    <ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium wrap-anywhere">{task.title}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Tinjau keputusan
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : !loading && !failed ? (
        history.length || pastApprovals.length ? (
          <ul className="space-y-5">
            {pastApprovals.map((approval) => (
              <HistoryItem
                key={approval.id}
                title={approval.action.name}
                status={approval.status === "pending" ? "expired" : approval.status}
              >
                <dl className="space-y-2">
                  {Object.entries(approval.action.args).map(([key, value]) => (
                    <div key={key}>
                      <dt className="text-xs">{key}</dt>
                      <dd className="max-h-40 overflow-auto whitespace-pre-wrap wrap-anywhere">
                        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </HistoryItem>
            ))}
            {[...history]
              .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
              .map((task) => (
                <HistoryItem
                  key={task.id}
                  title={task.title}
                  description={task.instruction}
                  status={task.action?.status ?? "unknown"}
                  date={task.updated_at}
                >
                  <p className="wrap-anywhere">{task.error ?? taskStage[task.stage]}</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => context.open({ kind: "task", id: task.id })}
                  >
                    Lihat detail
                  </Button>
                </HistoryItem>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Belum ada riwayat persetujuan.</p>
        )
      ) : null}
    </section>
  );
}
