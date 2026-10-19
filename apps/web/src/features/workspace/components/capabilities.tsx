import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { api } from "@/lib/api";

interface Capability {
  id: string;
  title: string;
  description: string;
  example: string;
  available: boolean;
}
export function Capabilities() {
  const { getToken, userId } = useAuth();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["capabilities", userId],
    queryFn: async () =>
      api<{ capabilities: Capability[] }>("/library/capabilities", await getToken()),
    enabled: Boolean(userId),
    staleTime: 30000,
  });
  return (
    <div className="space-y-6">
      <p className="max-w-prose text-sm">
        Mulai dari chat dan ceritakan kebutuhanmu. Gwen akan menyiapkan pekerjaan dan meminta
        keputusan ketika diperlukan.
      </p>
      {query.isPending ? (
        <WorkspaceState kind="loading" title="Memuat kemampuan Gwen…" />
      ) : query.isError ? (
        <WorkspaceState
          kind="error"
          title="Kemampuan belum dapat dimuat"
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ul className="divide-y">
          {query.data.capabilities.map((item) => (
            <li key={item.id} className="space-y-2 py-5">
              <h2 className="text-base">{item.title}</h2>
              <p className="text-sm text-muted-foreground">{item.description}</p>
              {item.available ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto max-w-full justify-start whitespace-normal text-left"
                  onClick={() =>
                    void navigate({
                      to: "/",
                      search: (previous) => ({
                        ...previous,
                        view: undefined,
                        prompt: item.example,
                      }),
                    })
                  }
                >
                  Coba: {item.example}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Belum tersedia saat ini.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
