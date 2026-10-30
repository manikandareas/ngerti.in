import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AgentsPage } from "@/features/agents/agents-page";
export const Route = createFileRoute("/_authenticated/_workspace/agents")({
  component: AgentsRoute,
});
function AgentsRoute() {
  const cache = useQueryClient();
  useEffect(
    () => () => {
      for (const key of [
        "navigation-threads",
        "navigation-agent-profiles",
        "navigation-group-members",
      ]) {
        void cache.invalidateQueries({ queryKey: [key] });
      }
    },
    [cache],
  );
  return (
    <main id="main" className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
      <AgentsPage />
    </main>
  );
}
