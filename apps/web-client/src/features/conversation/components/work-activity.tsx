import { ArrowRight01Icon, LinkSquare02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import type { Message, Run, Snapshot } from "@/types/workspace";

export function WorkActivity({
  message,
  run,
  snapshot,
  retryRoute,
  busy,
}: {
  message: Message;
  run?: Run;
  snapshot: Snapshot;
  retryRoute: (route: Snapshot["routes"][number]) => void;
  busy: boolean;
}) {
  const route = snapshot.routes.find((r) => r.message_id === message.id);
  return (
    <div className="w-full min-w-0 space-y-2 text-caption text-muted-foreground empty:hidden">
      {route?.state === "pending" && (
        <p className="flex items-center gap-1.5">
          <HugeiconsIcon
            icon={Loading03Icon}
            size={13}
            className="motion-safe:animate-spin"
            aria-hidden="true"
          />
          Memilih satu penjawab…
        </p>
      )}
      {route && ["rejected", "unknown"].includes(route.state) && (
        <p role="status">
          {route.state === "unknown"
            ? "Hasil routing belum diketahui. Periksa run sebelum melanjutkan."
            : "Penjawab belum dapat dipilih. Periksa anggota dan koneksinya."}{" "}
          {route.error_code}
        </p>
      )}
      {route?.state === "rejected" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => retryRoute(route)}>
          Coba pilih penjawab lagi
        </Button>
      )}
      {!!run?.sources?.length && (
        <details className="group/sources w-fit max-w-full rounded-xl border border-border/40 bg-panel">
          <summary className="flex min-h-8 cursor-pointer list-none items-center gap-2 rounded-xl px-3 py-1.5 text-[13px] hover:bg-secondary [&::-webkit-details-marker]:hidden">
            <HugeiconsIcon icon={LinkSquare02Icon} size={13} strokeWidth={1.5} aria-hidden="true" />
            Sumber riset · {run.sources.length}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={13}
              strokeWidth={1.5}
              className="ml-auto group-open/sources:rotate-90"
              aria-hidden="true"
            />
          </summary>
          <ul className="space-y-2 border-t border-border/40 p-3 text-[13px]">
            {run.sources
              .filter((s) => /^https?:\/\//i.test(s.url))
              .map((source) => (
                <li key={`${source.operation}:${source.url}`}>
                  <a
                    className="text-link underline"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.title || source.url}
                  </a>
                </li>
              ))}
          </ul>
        </details>
      )}
    </div>
  );
}
