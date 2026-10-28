import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AuthPage } from "@/features/auth/components/auth-page";
import { api } from "@/lib/api";
export const Route = createFileRoute("/")({ component: Home });
type Bootstrap = {
  status: string;
  primary_dm_thread_id?: string;
  last_opened_thread_id?: string;
  error_code?: string;
};
function Home() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const setup = useQuery({
    queryKey: ["account-bootstrap", userId],
    queryFn: async () =>
      api<Bootstrap>("/api/agent-engine/v1/bootstrap", await getToken(), { method: "POST" }),
    enabled: !!isSignedIn,
    refetchInterval: (query) =>
      query.state.data &&
      ["pending", "running", "queued", "provisioning", "retryable_failure"].includes(
        query.state.data.status,
      )
        ? 2000
        : false,
  });
  if (isLoaded && !isSignedIn) return <AuthPage />;
  const threadId = setup.data?.last_opened_thread_id || setup.data?.primary_dm_thread_id;
  if (setup.data?.status === "ready" && threadId)
    return <Navigate to="/conversations/$threadId" params={{ threadId }} replace />;
  const failed =
    setup.error ||
    (setup.data &&
      !["ready", "pending", "running", "queued", "provisioning"].includes(setup.data.status));
  return (
    <main
      id="main"
      className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-2xl font-semibold">
        {failed ? "Tobi belum dapat disiapkan" : "Menyiapkan ruangmu bersama Tobi"}
      </h1>
      <p role={failed ? "alert" : "status"} className="max-w-md text-sm text-muted-foreground">
        {failed
          ? "Persiapan akun belum selesai. Coba kembali untuk melanjutkan."
          : "Sebentar lagi kamu bisa langsung bercerita tentang hal yang ingin dibantu."}
      </p>
      {failed && (
        <Button onClick={() => void setup.refetch()} disabled={setup.isFetching}>
          Coba lagi
        </Button>
      )}
    </main>
  );
}
