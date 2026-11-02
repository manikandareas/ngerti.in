import {
  ArrowRight01Icon,
  Loading03Icon,
  Shield01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApiResource } from "@/hooks/use-api-resource";
import { ApiError, request } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type {
  NativeApproval,
  NativeInteraction,
  NativeInteractionAnswer,
  NativeInteractionHistory,
  NativeInteractionSnapshot,
  NativeUserInput,
  NativeQuestion as Question,
} from "@/types/native-interactions";
import type { Agent, Run } from "@/types/workspace";
import { AgentAvatar } from "./identity";
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
}) {
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
    if (sending.current || !canAnswer(key)) return;
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
  }
  const unchecked = [...locked].filter((key) => !byIdentity.get(key)?.submission);
  if (
    !settled.length &&
    !inputs.length &&
    !approvals.length &&
    !unchecked.length &&
    !pending.error &&
    !historyError &&
    !error
  )
    return null;
  return (
    <section aria-label={`Permintaan native ${author}`} className="space-y-3">
      {settled.map((record) => (
        <NativeSettledCard
          key={record.id}
          record={record}
          runStatus={runStatus}
          cancellation={cancellation}
          canObserve={canRespond && liveRun}
          checking={checking}
          check={() => void check(recordIdentity(record))}
        />
      ))}
      {inputs.map((input) => (
        <NativeQuestion
          key={input.userInputId}
          input={input}
          author={author}
          agent={agent}
          busy={busy}
          answer={answer}
        />
      ))}
      {approvals.map((approval) => (
        <NativeApprovalCard
          key={`${approval.approvalId}:${approval.currentRequirementId.sourceIndex}`}
          approval={approval}
          author={author}
          agent={agent}
          busy={busy}
          answer={answer}
        />
      ))}
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

function NativeApprovalCard({
  approval,
  author,
  agent,
  busy,
  answer,
}: {
  approval: NativeApproval;
  author: string;
  agent?: Agent;
  busy: boolean;
  answer: (value: NativeInteractionAnswer) => Promise<void>;
}) {
  return (
    <section className="w-full max-w-[560px] space-y-3 rounded-[20px] bg-card px-4 pb-3.5 pt-3 ring-[0.5px] ring-foreground/10">
      <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
        {agent ? (
          <AgentAvatar agent={agent} state="listening" className="size-4" />
        ) : (
          <HugeiconsIcon icon={Shield01Icon} size={14} strokeWidth={1.5} />
        )}
        {author} meminta keputusan
      </p>
      <h3 className="break-words text-[15px] font-medium leading-[22px]">
        {approval.toolName ?? approval.subject.toolName ?? approval.subject.kind}
      </h3>
      <details className="group/approval text-[13px] text-muted-foreground">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-full px-2 py-1 hover:bg-foreground/[0.05] [&::-webkit-details-marker]:hidden">
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            size={13}
            strokeWidth={1.5}
            className="group-open/approval:rotate-90"
          />
          Rincian tindakan
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-foreground/[0.045] px-3 py-2 font-mono text-[12px] leading-[18px]">
          {approval.subject.command ??
            approval.subject.path ??
            approval.rawArgs ??
            approval.subject.kind}
        </pre>
      </details>
      <div className="flex flex-wrap justify-end gap-2">
        {approval.availableChoices.map((choice) => (
          <Button
            key={choice.choiceId}
            size="sm"
            variant={/allow|approve/i.test(choice.decision) ? "default" : "secondary"}
            className="min-h-9 rounded-full px-4 py-1.5 text-[14px] font-medium touch:min-h-11"
            disabled={busy}
            title={choice.rulePreview ?? choice.scope}
            onClick={() =>
              void answer({
                type: "approval",
                request_id: approval.approvalId,
                source_index: approval.currentRequirementId.sourceIndex,
                choice_id: choice.choiceId,
              })
            }
          >
            {choice.label ?? choice.decision}
          </Button>
        ))}
      </div>
    </section>
  );
}
function NativeQuestion({
  input,
  author,
  agent,
  busy,
  answer,
}: {
  input: NativeUserInput;
  author: string;
  agent?: Agent;
  busy: boolean;
  answer: (value: NativeInteractionAnswer) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, { selected: string[]; text: string }>>({});
  const [active, setActive] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const currentIndex = Math.min(active, input.questions.length - 1);
  const question = input.questions[currentIndex];
  if (!question) return null;
  const answered = (q: Question, drafts = values) => {
    const value = drafts[q.id];
    return (
      !!value &&
      !!(value.text.trim() || value.selected.length >= (q.selection.min ?? 1)) &&
      (!q.selection.max || value.selected.length <= q.selection.max)
    );
  };
  const ready = input.questions.every((q) => answered(q));
  const oneTap =
    input.questions.length === 1 &&
    question.selection.mode === "single" &&
    question.options.length > 0;
  async function submit(drafts = values, label: string | null = null) {
    if (busy || !input.questions.every((q) => answered(q, drafts))) return;
    setSending(label);
    await answer({
      type: "user_input",
      request_id: input.userInputId,
      answers: input.questions.map((q) => {
        const value = drafts[q.id];
        return {
          questionId: q.id,
          ...(value.text.trim()
            ? { freeText: value.text }
            : q.selection.mode === "multiple"
              ? { selectedLabels: value.selected }
              : value.selected[0]
                ? { selectedLabel: value.selected[0] }
                : {}),
        };
      }),
    });
    setSending(null);
  }
  function pick(label: string) {
    const previous = values[question.id] ?? { selected: [], text: "" };
    const selected =
      question.selection.mode === "single"
        ? [label]
        : previous.selected.includes(label)
          ? previous.selected.filter((value) => value !== label)
          : [...previous.selected, label];
    const next = { ...values, [question.id]: { selected, text: "" } };
    setValues(next);
    if (oneTap) {
      void submit(next, label);
      return;
    }
    if (question.selection.mode === "single") {
      const unanswered = input.questions.findIndex(
        (q, index) => index !== currentIndex && !answered(q, next),
      );
      if (unanswered >= 0) setActive(unanswered);
    }
  }
  return (
    <form
      className="w-full max-w-[560px] rounded-[20px] bg-card px-4 pb-3.5 pt-3 text-left ring-[0.5px] ring-foreground/10"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
        {agent && <AgentAvatar agent={agent} state="listening" className="size-4" />}
        {author} menunggu jawaban kamu
      </p>
      <div className="mb-3 flex items-start gap-2">
        <h3 className="min-w-0 flex-1 break-words text-[15px] font-medium leading-[22px]">
          {question.question}
        </h3>
        {input.questions.length > 1 && (
          <span className="mt-0.5 shrink-0 text-[12px] tabular-nums text-muted-foreground">
            {input.questions.filter((q) => answered(q)).length}/{input.questions.length}
          </span>
        )}
      </div>
      {input.questions.length > 1 && (
        <div role="tablist" aria-label="Pertanyaan" className="mb-3 flex flex-wrap gap-1.5">
          {input.questions.map((q, index) => (
            <button
              key={q.id}
              type="button"
              role="tab"
              aria-selected={index === currentIndex}
              onClick={() => setActive(index)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px]",
                index === currentIndex
                  ? "bg-foreground/[0.08]"
                  : "text-muted-foreground hover:bg-foreground/[0.06]",
              )}
            >
              {answered(q) && (
                <HugeiconsIcon icon={Tick02Icon} size={13} className="text-success-foreground" />
              )}
              {q.header || `Pertanyaan ${index + 1}`}
            </button>
          ))}
        </div>
      )}
      {question.selection.mode === "multiple" && (
        <p className="mb-2 text-[12px] text-muted-foreground">Pilih satu atau beberapa jawaban.</p>
      )}
      <fieldset
        role={question.selection.mode === "single" ? "radiogroup" : "group"}
        aria-label={question.question}
        className="flex flex-col gap-1.5"
      >
        {question.options.map((option) => {
          const checked = values[question.id]?.selected.includes(option.label) ?? false;
          return (
            <ChoiceButton
              key={option.label}
              multiple={question.selection.mode === "multiple"}
              checked={checked}
              data-ask-choice=""
              onKeyDown={(event) => {
                if (
                  !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                const choices = Array.from(
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    "[data-ask-choice]:not(:disabled)",
                  ) ?? [],
                );
                const index = choices.indexOf(document.activeElement as HTMLButtonElement);
                const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
                const backward =
                  event.key === "ArrowUp" || event.key === (rtl ? "ArrowRight" : "ArrowLeft");
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? choices.length - 1
                      : (index + (backward ? -1 : 1) + choices.length) % choices.length;
                event.preventDefault();
                choices[next]?.focus();
              }}
              disabled={
                busy ||
                (question.selection.mode === "multiple" &&
                  !!question.selection.max &&
                  !checked &&
                  (values[question.id]?.selected.length ?? 0) >= question.selection.max)
              }
              onClick={() => pick(option.label)}
              className={cn(
                "flex min-h-10 w-full items-center gap-2.5 rounded-[14px] px-3.5 py-2 text-left text-[14px] leading-5 ring-[0.5px] ring-foreground/[0.14] transition-colors disabled:cursor-default disabled:opacity-60 touch:min-h-11",
                checked ? "bg-foreground/[0.08] ring-foreground/25" : "hover:bg-foreground/[0.045]",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block break-words">{option.label}</span>
                {option.description && (
                  <span className="mt-0.5 block text-[13px] leading-[18px] text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
              {sending === option.label ? (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={16}
                  className="shrink-0 motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                checked && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    size={16}
                    strokeWidth={2.4}
                    className="shrink-0"
                    aria-hidden="true"
                  />
                )
              )}
            </ChoiceButton>
          );
        })}
      </fieldset>
      <div className="mt-3 rounded-[16px] bg-foreground/[0.045] px-3 py-1 ring-[0.5px] ring-foreground/[0.14] focus-within:ring-foreground/30">
        <Textarea
          aria-label={`Jawaban: ${question.header || question.question}`}
          maxLength={500}
          placeholder="Atau tulis jawaban…"
          value={values[question.id]?.text ?? ""}
          disabled={busy}
          rows={1}
          className="min-h-8 resize-none border-0 bg-transparent px-0 py-1.5 text-[14px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          onChange={(event) =>
            setValues((previous) => ({
              ...previous,
              [question.id]: { selected: [], text: event.target.value },
            }))
          }
        />
      </div>
      {(!oneTap || values[question.id]?.text.trim()) && (
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            className="min-h-9 rounded-full px-4 text-[14px] touch:min-h-11"
            disabled={!ready || busy}
          >
            {busy ? (
              <HugeiconsIcon icon={Loading03Icon} size={15} className="motion-safe:animate-spin" />
            ) : null}
            Kirim jawaban ke harness
          </Button>
        </div>
      )}
    </form>
  );
}

function ChoiceButton({
  multiple,
  checked,
  ...props
}: ComponentProps<"button"> & { multiple: boolean; checked: boolean }) {
  return multiple ? (
    // biome-ignore lint/a11y/useSemanticElements: preserve the upstream AskChoices multiline button and controlled answer interaction.
    <button {...props} type="button" role="checkbox" aria-checked={checked} />
  ) : (
    // biome-ignore lint/a11y/useSemanticElements: preserve the upstream AskChoices multiline button and one-tap answer interaction.
    <button {...props} type="button" role="radio" aria-checked={checked} />
  );
}
