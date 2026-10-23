import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/components/auth-page";
import { LibraryPage } from "@/features/library/components/library-page";

export const Route = createFileRoute("/library/$section")({
  beforeLoad: ({ params }) => {
    if (!["artifacts", "media", "files"].includes(params.section))
      throw redirect({ to: "/library/$section", params: { section: "artifacts" } });
  },
  validateSearch: (search: Record<string, unknown>): { view?: string; q?: string } => ({
    view: typeof search.view === "string" ? search.view : undefined,
    q: typeof search.q === "string" ? search.q.slice(0, 300) : undefined,
  }),
  component: LibraryRoute,
});
function LibraryRoute() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { section } = Route.useParams();
  const { view, q } = Route.useSearch();
  if (!isLoaded)
    return (
      <main id="main" className="grid min-h-dvh place-items-center" aria-busy="true">
        Memuat Library…
      </main>
    );
  if (!isSignedIn) return <AuthPage />;
  return <LibraryPage key={userId} section={section} view={view} query={q ?? ""} />;
}
