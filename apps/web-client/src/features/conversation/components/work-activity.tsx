import { ArrowRight01Icon, LinkSquare02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { repairMessage } from "@/lib/api-errors";
import type { Message, Run, Snapshot } from "@/types/workspace";

const routingLabels: Record<string, string> = {
  classifying: "Memilih penjawab…",
  reviewing: "Memastikan penerima…",
  preparing: "Menyiapkan router…",
  retrying: "Menunggu koneksi router…",
  fallback: "Memilih penjawab lewat agent…",
  blocked: "Router belum siap",
};

export function WorkActivity({
  message,
  run,
  snapshot,
  retryRoute,
  retryPreparation,
  busy,
}: {
  message: Message;
  run?: Run;
  snapshot: Snapshot;
  retryRoute: (route: Snapshot["routes"][number]) => void;
  retryPreparation: (runId: string, revision: number) => void;
  busy: boolean;
}) {
  const route = snapshot.routes.find((r) => r.message_id === message.id);
  const execution = route?.execution;
  const stage = execution?.stage ?? (route?.state === "pending" ? "classifying" : route?.state);
  const retry =
    stage === "blocked" &&
    execution?.retry_preparation &&
    execution.run_id &&
    execution.run_revision !== null
      ? { runId: execution.run_id, revision: execution.run_revision }
      : null;
  return (
    <div className="w-full min-w-0 space-y-2 text-caption text-muted-foreground empty:hidden">
      {route?.state === "pending" && stage && stage !== "reconcile" && (
        <p role="status" className="flex items-center gap-1.5">
          {stage !== "blocked" && (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={13}
              className="motion-safe:animate-spin"
              aria-hidden="true"
            />
          )}
          {routingLabels[stage] ?? "Memilih penjawab…"}
        </p>
      )}
      {stage === "blocked" && (
        <p>{repairMessage(execution?.diagnostic?.code ?? "SERVICE_UNAVAILABLE")}</p>
      )}
      {retry && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => retryPreparation(retry.runId, retry.revision)}
        >
          Coba hubungkan router lagi
        </Button>
      )}
      {route && (["rejected", "unknown"].includes(route.state) || stage === "reconcile") && (
        <p role="status">
          {route.state === "unknown" || stage === "reconcile"
            ? "Hasil routing belum diketahui. Periksa run sebelum melanjutkan."
            : route.clarification || repairMessage(route.error_code ?? "ROUTING_UNAVAILABLE")}
        </p>
      )}
      {route?.state === "rejected" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => retryRoute(route)}>
          Coba pilih penjawab lagi
        </Button>
      )}
      {!!run?.sources?.length && (
        <details className="group/sources w-fit max-w-full rounded-xl border border-border/40 bg-panel">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] hover:bg-secondary [&::-webkit-details-marker]:hidden">
            <HugeiconsIcon icon={LinkSquare02Icon} size={13} strokeWidth={1.5} aria-hidden="true" />
            Sumber riset · {run.sources.length}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={13}
              strokeWidth={1.5}
              className="ml-auto group-open/sources:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <ul className="space-y-2 border-t border-border/40 p-3 text-[13px]">
            {run.sources
              .filter((s) => /^https?:\/\//i.test(s.url))
              .map((source) => (
                <li key={`${source.operation}:${source.url}`}>
                  <a
                    className="text-link underline"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.title || source.url}
                  </a>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
