import { MessageScroller } from "@shadcn/react/message-scroller";
import { LoaderCircle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuotaSummary } from "@/features/quotas/quota-summary";
import { useQuota } from "@/features/quotas/use-quota";
import { ChatComposer } from "./chat-composer";
import { ThreadTranscript } from "./thread-transcript";
import { activeStatuses } from "./types";
import { useThread } from "./use-thread";
import { useThreadActions } from "./use-thread-actions";
import { useThreadComposer } from "./use-thread-composer";

interface ThreadProps {
  threadId: string;
}

export function Thread({ threadId }: ThreadProps) {
  const { snapshot, connection, error, refresh, loadEarlier } = useThread(threadId);
  const quota = useQuota();
  const blocked = quota.data?.meters.chat.remaining === 0;
  const run = snapshot?.run;
  const active = run ? activeStatuses.has(run.status) : false;
  const composer = useThreadComposer({
    threadId,
    active,
    blocked,
    acceptedRequestKey: run?.request_key,
  });
  const actions = useThreadActions(run, composer.setSendError);
  const sendError = composer.sendError;
  if (error)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-7 text-center text-muted-foreground">
        <p role="alert">{error}</p>
        <Button variant="outline" onClick={refresh}>
          <RefreshCw /> Muat ulang
        </Button>
      </div>
    );
  if (!snapshot)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-7 text-center text-muted-foreground">
        <LoaderCircle className="animate-spin" />
        <p>Membuka percakapan…</p>
      </div>
    );
  const empty = snapshot.messages.length === 0;
  return (
    <MessageScroller.Provider autoScroll defaultScrollPosition={empty ? "start" : "end"}>
      <div className="flex min-h-0 flex-1 flex-col">
        <ThreadTranscript
          snapshot={snapshot}
          active={active}
          loadEarlier={loadEarlier}
          onHistoryError={composer.setSendError}
          onDraftChange={composer.updateDraft}
          onRetry={actions.retry}
          decide={actions.decide}
        />
        <div className="relative z-10 mx-auto w-full max-w-[800px] shrink-0 px-3 pb-[max(8px,env(safe-area-inset-bottom))] min-[701px]:px-6 min-[701px]:pb-3">
          {connection === "reconnecting" ? (
            <p
              role="status"
              className="my-2.5 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <WifiOff size={14} /> Menyambungkan kembali. Pesanmu tetap tersimpan.
            </p>
          ) : null}
          {sendError ? (
            <p
              role="alert"
              className="my-2.5 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger"
            >
              {sendError}
            </p>
          ) : null}
          {run?.status === "waiting_approval" ? (
            <p
              className="my-2.5 flex items-center gap-2 text-xs text-muted-foreground"
              role="status"
            >
              Gwen menunggu keputusanmu di atas. Kamu juga bisa membuka chat baru.
            </p>
          ) : null}
          <ChatComposer
            draft={composer.draft}
            empty={empty}
            sending={composer.sending}
            active={active}
            blocked={blocked}
            onDraftChange={composer.updateDraft}
            onSend={() => void composer.send()}
            onStop={actions.cancel}
          />
          <QuotaSummary
            usage={quota.data}
            failed={quota.isError}
            onRefresh={() => void quota.refetch()}
          />
        </div>
      </div>
    </MessageScroller.Provider>
  );
}
