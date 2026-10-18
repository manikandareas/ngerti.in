import { Server } from "lucide-react";
import type { SystemStatus as SystemStatusData } from "@/features/diagnostics/types";

const labels: Record<string, string> = {
  api: "API",
  database: "PostgreSQL",
  migrations: "Migrasi aplikasi",
  pgvector: "pgvector",
  queue: "Procrastinate",
  checkpoints: "LangGraph",
  worker: "Worker",
  storage: "Storage S3",
  auth: "Clerk",
};

const statusLabels: Record<string, string> = {
  ready: "Siap",
  configured: "Terkonfigurasi",
};

interface SystemStatusProps {
  data?: SystemStatusData;
  error: Error | null;
}

export function SystemStatus({ data, error }: SystemStatusProps) {
  const ready = data
    ? Object.values(data.components).filter((item) => item.status === "ready").length
    : 0;
  return (
    <section className="overflow-hidden rounded-2xl border bg-card" aria-labelledby="system-title">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2">
        <h2 id="system-title">
          <Server size={19} />
          Kesiapan sistem
        </h2>
        <span className="text-[13px] text-muted-foreground">
          {data
            ? `${ready} dari ${Object.keys(data.components).length} komponen siap`
            : "Menghubungkan…"}
        </span>
      </div>
      {error ? (
        <p className="my-6 rounded-xl bg-danger-subtle px-5 py-4 text-sm text-danger" role="alert">
          API belum dapat dihubungi. Pastikan proses API berjalan, lalu segarkan status.
        </p>
      ) : null}
      <div className="grid min-[701px]:grid-cols-3">
        {data
          ? Object.entries(data.components).map(([key, item]) => (
              <div
                className="border-t px-5 py-4 min-[701px]:min-h-[104px] min-[701px]:[&:not(:nth-child(3n))]:border-r [&>div]:flex [&>div]:items-center [&>div]:gap-2 [&_p]:mt-2 [&_p]:text-xs [&_p]:text-muted-foreground"
                key={key}
              >
                <div>
                  <span
                    className={`size-[7px] shrink-0 rounded-full bg-danger [&.ready]:bg-primary-edge [&.configured]:bg-warning-foreground ${item.status}`}
                  />
                  <h3>{labels[key] || key}</h3>
                  <span
                    className={`ml-auto text-[11px] font-extrabold whitespace-nowrap text-danger [&.ready]:text-success-foreground [&.configured]:text-warning-foreground ${item.status}`}
                  >
                    {statusLabels[item.status] ?? "Belum siap"}
                  </span>
                </div>
                <p>{item.detail}</p>
              </div>
            ))
          : null}
        {!data && !error
          ? Object.keys(labels).map((key) => (
              <div
                className="m-2 h-[104px] animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
                key={key}
              />
            ))
          : null}
      </div>
    </section>
  );
}
