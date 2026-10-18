import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRuns } from "@/features/diagnostics/hooks/use-runs";
import { RunRow } from "./run-row";

export function RunPanel() {
  const { delay, setDelay, runs, start, download } = useRuns();
  return (
    <section className="min-w-0 rounded-2xl border bg-card px-5 pb-3 [&>div:first-child]:px-0">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2">
        <h2>
          <Play size={18} />
          Pekerjaan background
        </h2>
      </div>
      <p className="text-[13px] text-muted-foreground">
        Satu workflow LangGraph menulis dan membaca artifact melalui storage. Status tetap tersimpan
        saat browser ditutup.
      </p>
      <div className="flex flex-col items-stretch gap-3.5 py-6 min-[701px]:flex-row min-[701px]:items-end [&_label]:flex-1 [&_label]:text-xs [&_label]:font-bold">
        <div className="flex-1 text-xs font-bold">
          <label htmlFor="run-delay">Jeda untuk mencoba recovery</label>
          <Select value={delay} onValueChange={setDelay}>
            <SelectTrigger id="run-delay" className="mt-2 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Tanpa jeda</SelectItem>
              <SelectItem value="10">10 detik</SelectItem>
              <SelectItem value="30">30 detik</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" onClick={() => start.mutate()} disabled={start.isPending}>
          <Play size={16} />
          {start.isPending ? "Mengantrekan…" : "Jalankan pekerjaan"}
        </Button>
      </div>
      {start.error || download.error ? (
        <p role="alert" className="my-6 rounded-xl bg-danger-subtle px-5 py-4 text-sm text-danger">
          {start.error?.message || download.error?.message}
        </p>
      ) : null}
      {runs.error ? (
        <p role="alert" className="my-6 rounded-xl bg-danger-subtle px-5 py-4 text-sm text-danger">
          {runs.error.message}
        </p>
      ) : null}
      <div className="run-list" aria-live="polite">
        {runs.data?.length ? (
          runs.data.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              downloading={download.isPending}
              onDownload={(id) => download.mutate(id)}
            />
          ))
        ) : (
          <p className="border-t py-6 text-[13px] text-muted-foreground">
            Belum ada pekerjaan. Jalankan satu untuk memeriksa queue dan worker.
          </p>
        )}
      </div>
    </section>
  );
}
