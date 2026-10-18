import { Check, Clock3, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Run } from "@/features/diagnostics/types";

const statusText: Record<string, string> = {
  queued: "Dalam antrean",
  running: "Sedang berjalan",
  retrying: "Menunggu retry",
  completed: "Selesai",
  failed: "Gagal",
};

interface RunRowProps {
  run: Run;
  downloading: boolean;
  onDownload: (id: string) => void;
}

export function RunRow({ run, downloading, onDownload }: RunRowProps) {
  const artifactId = run.artifact_id;
  return (
    <article className="flex items-center gap-3 border-t py-4">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-muted [&.completed]:bg-success [&.completed]:text-success-foreground [&.failed]:bg-danger-subtle [&.failed]:text-danger ${run.status}`}
      >
        {run.status === "completed" ? <Check size={18} /> : <Clock3 size={18} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-[13px] [&>span]:text-xs [&>span]:text-muted-foreground [&_code]:truncate [&_code]:text-[11px] [&_code]:text-muted-foreground">
        <strong>{statusText[run.status] || run.status}</strong>
        <span>
          Job #{run.job_id} · {run.attempts} percobaan
        </span>
        <code title={run.id}>{run.id}</code>
        {run.error && run.status === "failed" ? (
          <p className="text-xs text-danger">{run.error}</p>
        ) : null}
      </div>
      {artifactId ? (
        <Button
          variant="outline"
          size="icon"
          type="button"
          aria-label={`Unduh hasil job ${run.job_id}`}
          onClick={() => onDownload(artifactId)}
          disabled={downloading}
        >
          <Download size={18} />
        </Button>
      ) : null}
    </article>
  );
}
