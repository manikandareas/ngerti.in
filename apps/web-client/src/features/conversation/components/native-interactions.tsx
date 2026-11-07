import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError, request } from "@/lib/api-client";
import type {
  NativeApproval,
  NativeInteraction,
  NativeInteractionAnswer,
  NativeInteractionHistory,
  NativeInteractionSnapshot,
  NativeUserInput,
} from "@/types/native-interactions";
import type { Agent, Run } from "@/types/workspace";
import { AssistantMessage } from "./assistant-message";
import { useInlineReferences } from "./inline-references";
import { NativeApprovalCard } from "./native-approval-card";
import { NativeQuestion } from "./native-question";
import { NativeSettledCard } from "./native-settled-card";

function identity(type: string, requestId: string, sourceIndex: number | null) {
  return JSON.stringify([type, requestId, sourceIndex]);
}
function recordIdentity(record: NativeInteraction) {
  return identity(record.type, record.request_id, record.source_index);
}
function answerIdentity(answer: NativeInteractionAnswer) {
  return identity(
    answer.type,
    answer.request_id,
    answer.type === "approval" ? answer.source_index : null,
  );
}
function snapshotHas(snapshot: NativeInteractionSnapshot, key: string) {
  return (
    snapshot.user_inputs.some((input) => identity("user_input", input.userInputId, null) === key) ||
    snapshot.approvals.some(
      (approval) =>
        identity("approval", approval.approvalId, approval.currentRequirementId.sourceIndex) ===
        key,
    )
  );
}
/** Snapshots and the pure history read may arrive in either order. Never regress an acknowledgement. */
function mergeRecords(...sources: (NativeInteraction[] | undefined)[]) {
  const records = new Map<string, NativeInteraction>();
  const stamp = (record: NativeInteraction) =>
    Math.max(
      Date.parse(record.last_observed_at),
      Date.parse(record.submission?.updated_at ?? record.observed_at),
    );
  for (const source of sources)
    for (const record of source ?? []) {
      const previous = records.get(record.id);
      if (!previous) {
        records.set(record.id, record);
        continue;
      }
      const latest = stamp(record) >= stamp(previous) ? record : previous;
      const oldSubmission = previous.submission;
      const nextSubmission = record.submission;
      let submission = latest.submission ?? oldSubmission ?? nextSubmission;
      if (oldSubmission && nextSubmission) {
        if (oldSubmission.state === "submitted") submission = oldSubmission;
        else if (nextSubmission.state === "submitted") submission = nextSubmission;
        else if (oldSubmission.attempt_id === nextSubmission.attempt_id) {
          const rank = { submitting: 0, unknown: 1, not_dispatched: 1, submitted: 2 };
          submission =
            nextSubmission.updated_at > oldSubmission.updated_at ||
            (nextSubmission.updated_at === oldSubmission.updated_at &&
              rank[nextSubmission.state] >= rank[oldSubmission.state])
              ? nextSubmission
              : oldSubmission;
        } else {
          submission =
            nextSubmission.started_at >= oldSubmission.started_at ? nextSubmission : oldSubmission;
        }
      }
      records.set(record.id, { ...latest, submission });
    }
  return [...records.values()].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
}

export function NativeInteractions({
  runId,
  run,
  author,
  agent,
  observePending,
  canRespond = observePending,
  recordIds,
  refresh,
  threadId,
  attributed = true,
  openAgent,
}: {
  runId: string;
  run: Run;
  author: string;
  agent?: Agent;
  observePending: boolean;
  /** Responding from an anchored journal fragment does not start another poller. */
  canRespond?: boolean;
  /** The parent's chronological transcript fragment; omitted means this whole run. */
  recordIds?: string[];
  refresh?: () => unknown;
  threadId?: string;
  attributed?: boolean;
  openAgent?: () => void;
}) {
  const { group } = useInlineReferences();
  function attributedCard(key: string, children: ReactNode) {
    return attributed && group ? (
      <AssistantMessage key={key} group agent={agent} open={openAgent}>
        {children}
      </AssistantMessage>
    ) : (
      <Fragment key={key}>{children}</Fragment>
    );
  }
  const [tick, setTick] = useState(0);
  const [read, setRead] = useState<{ revision: number; history: NativeInteractionHistory } | null>(
    null,
  );
  // A later cursor-protected scoped snapshot supersedes a manual history response.
  const observed =
    read?.history.run_id === runId && read.revision === run.revision ? read.history : null;
  const runStatus = ["succeeded", "failed", "cancelled", "unknown"].includes(
    observed?.run_status ?? "",
  )
    ? (observed?.run_status ?? run.status)
    : run.status;
  const cancellation = [run.cancellation, observed?.cancellation].includes("confirmed")
    ? "confirmed"
    : [run.cancellation, observed?.cancellation].includes("requested")
      ? "requested"
      : "none";
  const liveRun = runStatus === "running" && cancellation === "none";
  const active = observePending && liveRun;
  const pending = useApiResource<NativeInteractionSnapshot>(
    active ? `/v1/runs/${runId}/interactions` : null,
    tick,
  );
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState(false);
  // A transient failed HTTP acknowledgement locks its form until an authoritative read.
  // Persisted submission fences, including after reload, always come from the server journal.
  const [locked, setLocked] = useState<Set<string>>(() => new Set());
  const [retryReady, setRetryReady] = useState<Record<string, string>>({});
  const requestedRefresh = useRef("");
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(timer);
  }, [active]);
  const records = mergeRecords(observed?.records, run.native_interactions);
  const selected = recordIds ? new Set(recordIds) : null;
  const byIdentity = new Map(records.map((record) => [recordIdentity(record), record]));
  const canAct = canRespond && liveRun && (!active || !pending.error);
  const known = new Set((run.native_interactions ?? []).map(recordIdentity));
  const missing = pending.data
    ? JSON.stringify(
        [
          ...pending.data.user_inputs.map((input) =>
            identity("user_input", input.userInputId, null),
          ),
          ...pending.data.approvals.map((approval) =>
            identity("approval", approval.approvalId, approval.currentRequirementId.sourceIndex),
          ),
        ].filter((key) => !known.has(key)),
      )
    : "[]";
  useEffect(() => {
    if (!active || !refresh || missing === "[]") return;
    const signature = `${runId}:${missing}`;
    if (requestedRefresh.current === signature) return;
    requestedRefresh.current = signature;
    void Promise.resolve(refresh()).catch(() => {
      requestedRefresh.current = "";
    });
  }, [active, missing, refresh, runId]);
  function canAnswer(key: string) {
    const record = byIdentity.get(key);
    if (
      !canAct ||
      locked.has(key) ||
      (record && record.observed_state !== "pending") ||
      (selected && (!record || !selected.has(record.id)))
    )
      return false;
    if (!record?.submission) return true;
    return (
      record.submission.state === "not_dispatched" &&
      retryReady[key] === record.submission.attempt_id
    );
  }
  const availableInputs = new Map<string, NativeUserInput>();
  const availableApprovals = new Map<string, NativeApproval>();
  for (const record of records) {
    if (record.type === "user_input") availableInputs.set(recordIdentity(record), record.request);
    else availableApprovals.set(recordIdentity(record), record.request);
  }
  if (active) {
    for (const input of pending.data?.user_inputs ?? [])
      availableInputs.set(identity("user_input", input.userInputId, null), input);
    for (const approval of pending.data?.approvals ?? [])
      availableApprovals.set(
        identity("approval", approval.approvalId, approval.currentRequirementId.sourceIndex),
        approval,
      );
  }
  const inputs = [...availableInputs].filter(([key]) => canAnswer(key)).map(([, input]) => input);
  const directInputs = [...availableInputs].filter(([key, input]) => {
    const record = byIdentity.get(key);
    return (
      input.questions.some((question) => question.options.length === 0) &&
      (!selected || (record && selected.has(record.id))) &&
      record?.observed_state !== "not_pending" &&
      record?.submission?.state !== "submitted" &&
      liveRun
    );
  });
  const directKeys = new Set(directInputs.map(([key]) => key));
  const approvals = [...availableApprovals]
    .filter(([key]) => canAnswer(key))
    .map(([, approval]) => approval);
  const interactive = new Set([
    ...inputs.map((input) => identity("user_input", input.userInputId, null)),
    ...approvals.map((approval) =>
      identity("approval", approval.approvalId, approval.currentRequirementId.sourceIndex),
    ),
  ]);
  const settled = records.filter(
    (record) => (!selected || selected.has(record.id)) && !interactive.has(recordIdentity(record)),
  );
  async function readHistory() {
    const value = await request<NativeInteractionHistory>(`/v1/runs/${runId}/interactions/history`);
    setRead({ revision: run.revision, history: value });
    setHistoryError(false);
    return value;
  }
  async function check(key?: string) {
    if (checking) return;
    setChecking(true);
    setError("");
    try {
      // A definitively rejected answer needs a fresh authorized pending observation before retry.
      const existing = key ? byIdentity.get(key) : null;
      const needsFreshPending =
        key &&
        (existing?.submission?.state === "not_dispatched" ||
          (locked.has(key) && !existing?.submission));
      const fresh =
        canRespond && liveRun && needsFreshPending
          ? await request<NativeInteractionSnapshot>(`/v1/runs/${runId}/interactions`).catch(
              () => null,
            )
          : null;
      const latest = await readHistory();
      const record = latest.records.find((item) => recordIdentity(item) === key);
      if (
        key &&
        fresh &&
        snapshotHas(fresh, key) &&
        (!record?.submission || record.submission.state === "not_dispatched")
      ) {
        setLocked((previous) => {
          const next = new Set(previous);
          next.delete(key);
          return next;
        });
        if (record?.submission)
          setRetryReady((previous) => ({
            ...previous,
            [key]: record.submission?.attempt_id ?? "",
          }));
      }
      pending.retry();
      await refresh?.();
    } catch {
      setHistoryError(true);
      setError("Status belum dapat diperiksa. Tidak ada jawaban yang dikirim ulang.");
    } finally {
      setChecking(false);
    }
  }
  async function answer(value: NativeInteractionAnswer) {
    const key = answerIdentity(value);
    if (sending.current || !canAnswer(key)) return false;
    let accepted = false;
    sending.current = true;
    setBusy(true);
    setLocked((previous) => new Set(previous).add(key));
    setError("");
    try {
      await request(`/v1/runs/${runId}/interactions`, value);
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.code === "NATIVE_UNKNOWN"
          ? "Penerimaan jawaban belum terkonfirmasi. Jangan kirim ulang; periksa status."
          : "Jawaban belum terkonfirmasi. Periksa status permintaan sebelum melanjutkan.",
      );
    } finally {
      try {
        const latest = await readHistory();
        accepted =
          latest.records.find((record) => recordIdentity(record) === key)?.submission?.state ===
          "submitted";
        if (latest.records.find((record) => recordIdentity(record) === key)?.submission)
          setError("");
      } catch {
        setHistoryError(true);
        setError(
          "Status jawaban belum dapat diperiksa. Pengiriman ulang dinonaktifkan sampai status diperiksa.",
        );
      }
      pending.retry();
      try {
        await refresh?.();
      } catch {
        setHistoryError(true);
      }
      sending.current = false;
      setBusy(false);
    }
    return accepted;
  }
  const unchecked = [...locked].filter((key) => !byIdentity.get(key)?.submission);
  if (
    !settled.length &&
    !inputs.length &&
    !directInputs.length &&
    !approvals.length &&
    !unchecked.length &&
    !pending.error &&
    !historyError &&
    !error
  )
    return null;
  return (
    <section aria-label={`Permintaan native ${author}`} className="space-y-3">
      {settled.map((record) =>
        attributedCard(
          record.id,
          <NativeSettledCard
            key={record.id}
            record={record}
            author={author}
            runStatus={runStatus}
            cancellation={cancellation}
            canObserve={canRespond && liveRun}
            checking={checking}
            check={() => void check(recordIdentity(record))}
          />,
        ),
      )}
      {inputs
        .filter((input) => !directKeys.has(identity("user_input", input.userInputId, null)))
        .map((input) =>
          attributedCard(
            input.userInputId,
            <NativeQuestion
              key={input.userInputId}
              input={input}
              author={author}
              at={
                byIdentity.get(identity("user_input", input.userInputId, null))?.observed_at ??
                run.created_at
              }
              busy={busy}
              answer={answer}
            />,
          ),
        )}
      {directInputs.map(([key, input]) =>
        attributedCard(
          key,
          <NativeQuestion
            key={input.userInputId}
            input={input}
            author={author}
            at={byIdentity.get(key)?.observed_at ?? run.created_at}
            busy={busy}
            canRespond={canAnswer(key)}
            scopeId={threadId}
            error={error}
            check={canAnswer(key) ? undefined : () => check(key)}
            answer={answer}
          />,
        ),
      )}
      {approvals.map((approval) =>
        attributedCard(
          `${approval.approvalId}:${approval.currentRequirementId.sourceIndex}`,
          <NativeApprovalCard
            key={`${approval.approvalId}:${approval.currentRequirementId.sourceIndex}`}
            approval={approval}
            author={author}
            at={
              byIdentity.get(
                identity(
                  "approval",
                  approval.approvalId,
                  approval.currentRequirementId.sourceIndex,
                ),
              )?.observed_at ?? run.created_at
            }
            busy={busy}
            answer={answer}
          />,
        ),
      )}
      {unchecked.map((key) => (
        <p key={key} role="status" className="text-[13px] leading-[18px] text-muted-foreground">
          Pengiriman sedang diperiksa.{" "}
          <button
            type="button"
            className="text-link underline"
            disabled={checking || busy}
            onClick={() => void check(key)}
          >
            Periksa status
          </button>
        </p>
      ))}
      {(pending.error || historyError) && (
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {pending.error
            ? "Permintaan input belum dapat diperiksa."
            : "Riwayat input belum dapat diperiksa."}{" "}
          <button
            type="button"
            className="text-link underline"
            disabled={checking}
            onClick={() => void check()}
          >
            Periksa lagi
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
