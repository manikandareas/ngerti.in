import { useAuth } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "@/features/auth/components/auth-page";
import { DirectMessagePage } from "@/features/direct-messages/direct-message-page";
export const Route = createFileRoute("/conversations/$threadId")({ component: ConversationRoute });
function ConversationRoute() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { threadId } = Route.useParams();
  if (!isLoaded) return <main aria-busy="true">Memuat percakapan…</main>;
  if (!isSignedIn) return <AuthPage />;
  return <DirectMessagePage key={`${userId}:${threadId}`} threadId={threadId} />;
}
