import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { AgentsPage } from "@/features/agents/agents-page";
import { AuthPage } from "@/features/auth/components/auth-page";
export const Route = createFileRoute("/agents")({ component: AgentsRoute });
function AgentsRoute() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <main aria-busy="true">Memuat agent…</main>;
  if (!isSignedIn) return <AuthPage />;
  return <AgentsPage key={userId} />;
}
