import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/components/auth-page";

export const Route = createFileRoute("/_authenticated")({ component: AuthenticatedLayout });
function AuthenticatedLayout() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded)
    return (
      <main id="main" aria-busy="true">
        Memuat…
      </main>
    );
  if (!isSignedIn) return <AuthPage />;
  return <Outlet key={userId} />;
}
