import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/components/auth-page";
import { ConnectionsPage } from "@/features/connections/connections-page";

export const Route = createFileRoute("/connections")({ component: ConnectionsRoute });
function ConnectionsRoute() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <main aria-busy="true">Memuat koneksi…</main>;
  if (!isSignedIn) return <AuthPage />;
  return <ConnectionsPage key={userId} />;
}
