import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/components/auth-page";
import { GoalsPage } from "@/features/goals/components/goals-page";
export const Route = createFileRoute("/goals")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === "string" ? search.thread : undefined,
  }),
  component: GoalsRoute,
});
function GoalsRoute() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { thread } = Route.useSearch();
  if (!isLoaded)
    return (
      <main id="main" className="grid min-h-dvh place-items-center" aria-busy="true">
        Memuat Goals…
      </main>
    );
  if (!isSignedIn) return <AuthPage />;
  return <GoalsPage key={userId} initialThread={thread} />;
}
