import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResourceSelection } from "../hooks/use-library";
import { useResourceContext } from "./resource-context";
export function SelectedResource({ threadId }: { threadId: string }) {
  const query = useResourceSelection(threadId);
  const context = useResourceContext();
  const item = query.selection;
  if (!item) return null;
  return (
    <div className="my-2 flex min-w-0 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left underline-offset-4 hover:underline"
        onClick={() => context.open(item.ref)}
      >
        Pilihan: {item.title}
        {item.ref.revision ? ` · v${item.ref.revision}` : ""}
        {item.unavailable ? " · pilih ulang" : ""}
      </button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Lepaskan pilihan"
        disabled={query.select.isPending}
        onClick={() => query.select.mutate(null)}
      >
        <X />
      </Button>
      {query.select.isError ? (
        <span role="alert" className="text-danger">
          Coba lepaskan kembali.
        </span>
      ) : null}
    </div>
  );
}
