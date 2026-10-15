import { useAuth } from "@clerk/tanstack-react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Download, Play } from "lucide-react";
import { useRef, useState } from "react";
import { api, type Run } from "../lib/api";

const statusText: Record<string, string> = {
  queued: "Dalam antrean",
  running: "Sedang berjalan",
  retrying: "Menunggu retry",
  completed: "Selesai",
  failed: "Gagal",
};

export function RunPanel() {
  const { getToken } = useAuth();
  const client = useQueryClient();
  const requestKey = useRef<string | null>(null);
  const [delay, setDelay] = useState("10");
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: async () => api<Run[]>("/dev/runs", await getToken()),
    refetchInterval: 3000,
  });
  const start = useMutation({
    mutationFn: async () => {
      requestKey.current ||= crypto.randomUUID();
      return api<Run>("/dev/runs", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_key: requestKey.current, delay_seconds: Number(delay) }),
      });
    },
    onSuccess: () => {
      requestKey.current = null;
      client.invalidateQueries({ queryKey: ["runs"] });
    },
  });
  const download = useMutation({
    mutationFn: async (id: string) => {
      const result = await api<{ url: string }>(`/dev/objects/${id}/download`, await getToken());
      window.location.assign(result.url);
    },
  });
  return (
    <section className="diagnostic-panel">
      <div className="section-heading">
        <h2>
          <Play size={18} />
          Pekerjaan background
        </h2>
      </div>
      <p className="subtle">
        Satu workflow LangGraph menulis dan membaca artifact melalui storage. Status tetap tersimpan
        saat browser ditutup.
      </p>
      <div className="run-controls">
        <label>
          Jeda untuk mencoba recovery
          <select value={delay} onChange={(event) => setDelay(event.target.value)}>
            <option value="0">Tanpa jeda</option>
            <option value="10">10 detik</option>
            <option value="30">30 detik</option>
          </select>
        </label>
        <button
          className="button"
          type="button"
          onClick={() => start.mutate()}
          disabled={start.isPending}
        >
          <Play size={16} />
          {start.isPending ? "Mengantrekan…" : "Jalankan pekerjaan"}
        </button>
      </div>
      {start.error || download.error ? (
        <p role="alert" className="notice error">
          {start.error?.message || download.error?.message}
        </p>
      ) : null}
      {runs.error ? (
        <p role="alert" className="notice error">
          {runs.error.message}
        </p>
      ) : null}
      <div className="run-list" aria-live="polite">
        {runs.data?.length ? (
          runs.data.map((run) => (
            <article className="run-row" key={run.id}>
              <span className={`run-icon ${run.status}`}>
                {run.status === "completed" ? <Check size={18} /> : <Clock3 size={18} />}
              </span>
              <div className="run-info">
                <strong>{statusText[run.status] || run.status}</strong>
                <span>
                  Job #{run.job_id} · {run.attempts} percobaan
                </span>
                <code title={run.id}>{run.id}</code>
                {run.error && run.status === "failed" ? (
                  <p className="error-text">{run.error}</p>
                ) : null}
              </div>
              {run.artifact_id ? (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Unduh hasil job ${run.job_id}`}
                  onClick={() => download.mutate(run.artifact_id as string)}
                  disabled={download.isPending}
                >
                  <Download size={18} />
                </button>
              ) : null}
            </article>
          ))
        ) : (
          <p className="empty-note">
            Belum ada pekerjaan. Jalankan satu untuk memeriksa queue dan worker.
          </p>
        )}
      </div>
    </section>
  );
}
