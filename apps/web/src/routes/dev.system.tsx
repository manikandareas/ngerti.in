import { useAuth } from "@clerk/tanstack-react-start";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, RefreshCw, Server } from "lucide-react";
import { useState } from "react";
import { type Account, api, diagnosticsEnabled, type SystemStatus } from "../lib/api";
import { AccessPanel } from "../ui/access-panel";
import { AppShell } from "../ui/app-shell";
import { FilePanel } from "../ui/file-panel";
import { RunPanel } from "../ui/run-panel";

export const Route = createFileRoute("/dev/system")({
  beforeLoad: () => {
    if (!diagnosticsEnabled) throw notFound();
  },
  component: DiagnosticPage,
});

function DiagnosticPage() {
  const { userId } = useAuth();
  return <DiagnosticSession key={userId || "signed-out"} />;
}

function DiagnosticSession() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <Diagnostics />
    </QueryClientProvider>
  );
}

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

function Diagnostics() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const status = useQuery({
    queryKey: ["system"],
    queryFn: () => api<SystemStatus>("/dev/status", null),
    refetchInterval: 5000,
  });
  const account = useQuery({
    queryKey: ["account"],
    queryFn: async () => api<Account>("/me", await getToken()),
    enabled: !!isSignedIn,
  });
  const ready = status.data
    ? Object.values(status.data.components).filter((item) => item.status === "ready").length
    : 0;
  return (
    <AppShell>
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        Kembali ke ruang belajar
      </Link>
      <div className="diagnostic-heading">
        <div>
          <span className="eyebrow">Development · Fondasi #02</span>
          <h1>Periksa fondasi aplikasi.</h1>
          <p>Jalankan alur nyata, lihat statusnya, dan lanjutkan setelah gangguan.</p>
        </div>
        <button
          className="button secondary"
          type="button"
          onClick={() => status.refetch()}
          disabled={status.isFetching}
        >
          <RefreshCw size={16} className={status.isFetching ? "spin" : ""} />
          Segarkan status
        </button>
      </div>
      <section className="system-section" aria-labelledby="system-title">
        <div className="section-heading">
          <h2 id="system-title">
            <Server size={19} />
            Kesiapan sistem
          </h2>
          <span className="subtle">
            {status.data ? `${ready} dari 8 komponen siap` : "Menghubungkan…"}
          </span>
        </div>
        {status.error ? (
          <p className="notice error" role="alert">
            API belum dapat dihubungi. Pastikan proses API berjalan, lalu segarkan status.
          </p>
        ) : null}
        <div className="system-grid">
          {status.data
            ? Object.entries(status.data.components).map(([key, item]) => (
                <div className="system-item" key={key}>
                  <div>
                    <span className={`status-dot ${item.status}`} />
                    <h3>{labels[key] || key}</h3>
                    <span className={`status-label ${item.status}`}>
                      {item.status === "ready"
                        ? "Siap"
                        : item.status === "configured"
                          ? "Terkonfigurasi"
                          : "Belum siap"}
                    </span>
                  </div>
                  <p>{item.detail}</p>
                </div>
              ))
            : !status.error
              ? Object.keys(labels).map((key) => <div className="skeleton" key={key} />)
              : null}
        </div>
      </section>
      {!isLoaded ? (
        <p>Memuat sesi…</p>
      ) : !isSignedIn ? (
        <div className="notice">
          <p>Masuk untuk memeriksa akun, menjalankan pekerjaan, dan mencoba storage.</p>
          <Link className="button" to="/sign-in">
            Masuk ke akun
          </Link>
        </div>
      ) : (
        <>
          <section className="account-section">
            <CheckCircle2 size={20} />
            <div>
              <h2>Identitas dari server</h2>
              {account.data ? (
                <>
                  <p>Akun aplikasi terhubung dengan sesi Clerk.</p>
                  <dl className="account-details">
                    <div>
                      <dt>Account ID</dt>
                      <dd>{account.data.id}</dd>
                    </div>
                    <div>
                      <dt>Clerk user</dt>
                      <dd>{account.data.clerk_user_id}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p role={account.error ? "alert" : undefined}>
                  {account.error ? account.error.message : "Memverifikasi sesi dengan backend…"}
                </p>
              )}
            </div>
            {account.error ? (
              <button type="button" className="button secondary" onClick={() => account.refetch()}>
                Coba lagi
              </button>
            ) : null}
          </section>
          {account.data ? (
            <div className="diagnostic-panels">
              <RunPanel />
              <FilePanel />
              <AccessPanel />
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
