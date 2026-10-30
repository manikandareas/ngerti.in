import { createFileRoute } from "@tanstack/react-router";
import { DirectMessagePage } from "@/features/direct-messages/direct-message-page";
export const Route = createFileRoute("/_authenticated/_workspace/conversations/$threadId")({
  component: ConversationRoute,
});
function ConversationRoute() {
  const { threadId } = Route.useParams();
  return <DirectMessagePage key={threadId} threadId={threadId} />;
}
