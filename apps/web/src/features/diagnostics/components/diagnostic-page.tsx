import { useAuth } from "@clerk/tanstack-react-start";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useSystemStatus } from "@/features/diagnostics/hooks/use-system-status";
import { ProactivityInspector } from "@/features/proactivity/components/proactivity-inspector";
import { AccountDiagnostics } from "./account-diagnostics";
import { SystemStatus } from "./system-status";

export function DiagnosticPage() {
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

function Diagnostics() {
  const status = useSystemStatus();
  return (
    <AppShell>
      <Link className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground" to="/">
        <ArrowLeft size={16} />
        Kembali ke percakapan
      </Link>
      <div className="mb-9 flex flex-col items-start justify-between gap-5 min-[701px]:flex-row min-[701px]:items-center [&_h1]:text-3xl [&_p]:mt-3 [&_p]:max-w-[60ch] [&_p]:text-muted-foreground">
        <div>
          <span className="mb-3.5 inline-block text-sm font-extrabold text-muted-foreground">
            Development · Fondasi #02
          </span>
          <h1>Periksa fondasi aplikasi.</h1>
          <p>Jalankan alur nyata, lihat statusnya, dan lanjutkan setelah gangguan.</p>
        </div>
        <Button
          variant="outline"
          type="button"
          onClick={() => status.refetch()}
          disabled={status.isFetching}
        >
          <RefreshCw
            size={16}
            className={status.isFetching ? "animate-spin motion-reduce:animate-none" : ""}
          />
          Segarkan status
        </Button>
      </div>
      <SystemStatus data={status.data} error={status.error} />
      <DiagnosticAccount />
    </AppShell>
  );
}

function DiagnosticAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p>Memuat sesi…</p>;
  if (isSignedIn)
    return (
      <>
        <AccountDiagnostics />
        <ProactivityInspector />
      </>
    );
  return (
    <div className="my-6 flex flex-col items-start justify-between gap-4 rounded-xl bg-secondary px-5 py-4 text-sm min-[701px]:flex-row min-[701px]:items-center">
      <p>Masuk untuk memeriksa akun, menjalankan pekerjaan, dan mencoba storage.</p>
      <Button asChild>
        <Link to="/sign-in">Masuk ke akun</Link>
      </Button>
    </div>
  );
}
