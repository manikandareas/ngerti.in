import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/components/auth-page";
import { workspaceLinks } from "@/features/workspace/config/navigation";
import type { WorkspaceView } from "@/features/workspace/types";
import { WorkspacePage } from "@/ui/workspace-page";

export const Route = createFileRoute("/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { thread?: string; view?: WorkspaceView; prompt?: string } => ({
    prompt: typeof search.prompt === "string" ? search.prompt.slice(0, 1000) : undefined,
    thread: typeof search.thread === "string" ? search.thread : undefined,
    view: workspaceLinks.some((item) => item.view === search.view)
      ? (search.view as WorkspaceView)
      : undefined,
  }),
  component: Home,
});

function Home() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { thread, view = "chat", prompt } = Route.useSearch();
  const navigate = useNavigate();
  if (!isLoaded)
    return (
      <main
        id="main"
        className="flex min-h-[80svh] flex-col items-center justify-center gap-5 p-6 text-center"
        aria-busy="true"
      >
        <p>Menyiapkan percakapanmu…</p>
      </main>
    );
  if (!isSignedIn) return <AuthPage />;
  if (view === "files")
    return <Navigate to="/library/$section" params={{ section: "artifacts" }} replace />;
  if (view === "goals") return <Navigate to="/goals" replace />;
  return (
    <WorkspacePage
      key={userId}
      selectedThread={thread}
      prompt={prompt}
      onPromptConsumed={() => void navigate({ to: "/", search: { thread }, replace: true })}
      view={view}
      onNavigate={(next) => {
        if (next === "goals") void navigate({ to: "/goals" });
        else
          void navigate({ to: "/", search: { thread, view: next === "chat" ? undefined : next } });
      }}
      onSelect={(id) => {
        void navigate({ to: "/", search: { thread: id } });
      }}
    />
  );
}
