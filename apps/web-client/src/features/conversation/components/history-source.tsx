import { type ReactNode, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useApiResource } from "@/hooks/use-api-resource";

const historyUrl = /^ngertiin:\/\/history\/([\da-f-]{36})\/([\da-f-]{36})$/i;

export function historySourceFromUrl(url: string | undefined) {
  const match = url?.match(historyUrl);
  return match ? { source_thread_id: match[1], message_id: match[2] } : null;
}

type HistorySource = {
  conversation: string;
  author: "user" | "agent";
  created_at: string;
  text: string;
  truncated: boolean;
};

export function HistorySourceLink({
  context,
  source,
  children,
}: {
  context: { thread_id: string; agent_id: string };
  source: NonNullable<ReturnType<typeof historySourceFromUrl>>;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const show = useApiResource<HistorySource>(
    open
      ? `/v1/conversations/history/source?${new URLSearchParams({ ...context, ...source })}`
      : null,
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="text-link underline underline-offset-2">
          {children}
        </button>
      </DialogTrigger>
      <DialogContent aria-describedby={undefined} className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conversation source</DialogTitle>
        </DialogHeader>
        {show.error ? (
          <p role="alert">This message is unavailable.</p>
        ) : show.data ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              {show.data.conversation} · {show.data.author === "user" ? "You" : "Agent"} ·{" "}
              <time dateTime={show.data.created_at}>
                {new Date(show.data.created_at).toLocaleString()}
              </time>
            </p>
            <p className="whitespace-pre-wrap break-words">{show.data.text}</p>
            {show.data.truncated && (
              <p className="text-muted-foreground">Showing the start of this message.</p>
            )}
          </div>
        ) : (
          <p role="status">Loading message…</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
