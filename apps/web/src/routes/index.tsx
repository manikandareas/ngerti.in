import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChatPage } from "@/features/chat/chat-page";
import { AuthPage } from "@/ui/auth-page";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { thread?: string } => ({
    thread: typeof search.thread === "string" ? search.thread : undefined,
  }),
  component: Home,
});

function Home() {
  const { isLoaded, isSignedIn } = useAuth();
  const { thread } = Route.useSearch();
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
  return (
    <ChatPage
      selectedThread={thread}
      onSelect={(id) => {
        void navigate({ to: "/", search: { thread: id } });
      }}
    />
  );
}
