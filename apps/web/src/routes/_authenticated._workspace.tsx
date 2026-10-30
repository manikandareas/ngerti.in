import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
export const Route = createFileRoute("/_authenticated/_workspace")({
  component: WorkspaceLayout,
});
function WorkspaceLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
