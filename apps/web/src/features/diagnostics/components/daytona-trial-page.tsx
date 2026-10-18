import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DaytonaWorkbench } from "./daytona-workbench";

export function DaytonaTrialPage() {
  const { userId, isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <p>Memuat sesi…</p>;
  return (
    <AppShell>
      <Link to="/">Kembali ke percakapan</Link>
      <h1 className="mt-6 text-2xl font-bold">Trial desktop Daytona</h1>
      <p className="my-4 text-muted-foreground">
        NG-031 · Satu sandbox aktif, TTL maksimal 30 menit, plafon reservasi US$1.
      </p>
      {isSignedIn ? (
        <DaytonaWorkbench key={userId} />
      ) : (
        <Link to="/sign-in">Masuk untuk menguji</Link>
      )}
    </AppShell>
  );
}
