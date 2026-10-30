import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { Plug } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ResourcePanel } from "@/features/direct-messages/resource-panel";
import { api } from "@/lib/api";
import { AppConnections } from "./app-connections";
import { base, connectionError, type Listing, statuses } from "./client";

export function ConversationConnections() {
  return (
    <ResourcePanel
      title="Koneksi"
      description="Akun AI, aplikasi dan permintaan akses untuk agent."
      icon={<Plug className="size-4" />}
    >
      <ConnectionCards />
    </ResourcePanel>
  );
}

function ConnectionCards() {
  const { getToken } = useAuth();
  const [data, setData] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void getToken()
      .then((token) => api<Listing>(`${base}/connections`, token))
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setError(connectionError(error));
      });
    return () => {
      active = false;
    };
  }, [getToken]);
  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-label="Provider AI">
        <h3 className="text-sm font-semibold">AI providers</h3>
        {error && (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        {!data && !error && <Skeleton className="h-28 w-full" />}
        {data?.items.map((connection) => (
          <article
            key={connection.connection_id}
            className="space-y-3 rounded-xl bg-muted/70 p-4 text-[13px] [overflow-wrap:anywhere]"
          >
            <h4 className="text-sm font-semibold">{connection.label}</h4>
            <p className="text-muted-foreground">
              {statuses[connection.status] ?? connection.status}
            </p>
            <p>
              {connection.models.length} model · {connection.billing}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link to="/connections">
                {connection.status === "reconnect_required" || connection.status === "disconnected"
                  ? "Hubungkan kembali"
                  : "Kelola provider"}
              </Link>
            </Button>
          </article>
        ))}
        <Button asChild size="sm">
          <Link to="/connections">Connect AI provider</Link>
        </Button>
      </section>
      <AppConnections contextual />
    </div>
  );
}
