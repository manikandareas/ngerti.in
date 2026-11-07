import { Skeleton } from "@/components/ui/skeleton";

export function ConversationIdentitySkeleton() {
  return (
    <div
      aria-hidden="true"
      className="header-action header-identity flex max-w-full min-w-0 items-center gap-2"
    >
      <Skeleton className="size-6 shrink-0 rounded-full" />
      <Skeleton className="h-3.5 w-20 min-w-0" />
    </div>
  );
}

export function ConversationActionsSkeleton() {
  return (
    <>
      <Skeleton aria-hidden="true" className="h-[39px] w-24 max-w-full rounded-full" />
      <Skeleton aria-hidden="true" className="hidden size-[39px] shrink-0 rounded-full sm:block" />
    </>
  );
}

export function ConversationRowSkeleton({ width = "w-24" }: { width?: string }) {
  return (
    <div className="my-0.5 flex min-h-[60px] items-center gap-3 px-2 py-2">
      <Skeleton className="size-11 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className={`h-3.5 max-w-full ${width}`} />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

export function ConversationListSkeleton() {
  return (
    <div role="status" aria-label="Memuat percakapan">
      <span className="sr-only">Memuat percakapan…</span>
      <div aria-hidden="true">
        {["w-20", "w-28", "w-24", "w-16"].map((width) => (
          <ConversationRowSkeleton key={width} width={width} />
        ))}
      </div>
    </div>
  );
}

export function ConversationLoading({ error }: { error: string }) {
  return (
    <>
      <div
        className="conversation-loading [max-width:var(--chat-column-max)] [margin:auto] [padding:60px_24px] w-full flex-1"
        role="status"
        aria-label={error ? "Percakapan belum terhubung" : "Membuka percakapan"}
      >
        {error ? (
          <p className="text-sm text-muted-foreground">
            Percakapan akan tersedia setelah koneksi pulih.
          </p>
        ) : (
          <>
            <div aria-hidden="true">
              <Skeleton className="mb-6 h-12 w-3/5 rounded-2xl" />
              <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
              <Skeleton className="mt-6 h-24 w-4/5 rounded-2xl" />
            </div>
            <span className="sr-only">Membuka percakapan…</span>
          </>
        )}
      </div>
      {!error && (
        <div
          aria-hidden="true"
          className="composer-dock [max-width:calc(var(--chat-column-max)_+_40px)] [margin:auto] [padding:12px_20px_16px] w-full shrink-0"
        >
          <Skeleton className="h-16 w-full rounded-2xl" />
        </div>
      )}
    </>
  );
}
