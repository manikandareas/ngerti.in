import { MessageScroller } from "@shadcn/react/message-scroller";
import { RefreshCw, WifiOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { activeStatuses } from "@/features/chat/constants";
import { useOnline } from "@/features/chat/hooks/use-online";
import { useThread } from "@/features/chat/hooks/use-thread";
import { useThreadActions } from "@/features/chat/hooks/use-thread-actions";
import { useThreadComposer } from "@/features/chat/hooks/use-thread-composer";
import { SelectedResource } from "@/features/library/components/selected-resource";
import { ProactivityScopeControl } from "@/features/proactivity/components/proactivity-scope";
import { ProactivityOnboarding } from "@/features/proactivity/components/proactivity-settings";
import { QuotaSummary } from "@/features/quotas/components/quota-summary";
import { useQuota } from "@/features/quotas/hooks/use-quota";
import { ChatComposer } from "./chat-composer";
import { ThreadTranscript } from "./thread-transcript";

interface ThreadProps {
  threadId: string;
  draftRequest?: { id: string; text: string };
  onDraftRequestConsumed?: () => void;
}

export function Thread({ threadId, draftRequest, onDraftRequestConsumed }: ThreadProps) {
  const { snapshot, connection, error, refresh, loadEarlier } = useThread(threadId);
  const online = useOnline();
  const input = useRef<HTMLTextAreaElement>(null);
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
  const appliedDraft = useRef<string | null>(null);
  useEffect(() => {
    if (!draftRequest) {
      appliedDraft.current = null;
      return;
    }
    if (appliedDraft.current === draftRequest.id) return;
    appliedDraft.current = draftRequest.id;
    composer.appendDraft(draftRequest.text);
    onDraftRequestConsumed?.();
    input.current?.focus();
  }, [draftRequest, composer.appendDraft, onDraftRequestConsumed]);
  const sendError = composer.sendError;
  if (error && !snapshot)
    return (
      <WorkspaceState
        kind="error"
        title="Percakapan belum dapat dibuka"
        description="Percakapan mungkin tidak tersedia atau koneksi sedang terganggu. Coba muat kembali."
        onRetry={refresh}
      />
    );
  if (!snapshot) return <WorkspaceState kind="loading" title="Membuka percakapan…" />;
  const empty = snapshot.messages.length === 0;
  return (
    <MessageScroller.Provider autoScroll defaultScrollPosition={empty ? "start" : "end"}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto w-full max-w-[800px] shrink-0 px-4 min-[701px]:px-6">
          {snapshot.thread.kind === "main" ? <ProactivityOnboarding /> : null}
          <ProactivityScopeControl key={threadId} scope="thread" id={threadId} />
        </div>
        <ThreadTranscript
          snapshot={snapshot}
          active={active}
          loadEarlier={loadEarlier}
          onHistoryError={composer.setSendError}
          hasDraft={composer.draft.length > 0}
          onDraftChange={(value) => {
            if (composer.draft.length > 0) return;
            composer.updateDraft(value);
            input.current?.focus();
          }}
          onRetry={actions.retry}
          decide={actions.decide}
        />
        <div className="relative z-10 mx-auto w-full max-w-[800px] shrink-0 px-3 pb-[max(8px,env(safe-area-inset-bottom))] min-[701px]:px-6 min-[701px]:pb-3">
          {!online || connection === "reconnecting" ? (
            <p
              role="status"
              className="my-2.5 flex items-center gap-2 text-xs text-muted-foreground"
            >
              <WifiOff size={14} />{" "}
              {!online
                ? "Kamu sedang offline. Lanjutkan draft; kirim saat koneksi kembali."
                : "Menyambungkan kembali. Riwayat akan disinkronkan; draftmu tetap ada."}
            </p>
          ) : null}
          {error ? (
            <div
              role="alert"
              className="my-2.5 rounded-xl bg-warning p-3 text-sm text-warning-foreground"
            >
              <p>{error}</p>
              <Button type="button" variant="outline" className="mt-2" onClick={refresh}>
                <RefreshCw /> Sinkronkan percakapan
              </Button>
            </div>
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
          <SelectedResource threadId={threadId} />
          <ChatComposer
            draft={composer.draft}
            empty={empty}
            sending={composer.sending}
            active={active}
            blocked={blocked}
            offline={!online}
            inputRef={input}
            onDraftChange={composer.updateDraft}
            onSend={() => {
              if (online) void composer.send();
            }}
            onStop={actions.cancel}
            attachments={composer.attachments}
            outputs={composer.outputs}
            onOutputs={composer.setOutputs}
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
