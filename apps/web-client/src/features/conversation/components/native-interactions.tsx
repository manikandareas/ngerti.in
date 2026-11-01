import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApiResource } from "@/hooks/use-api-resource";
import { request } from "@/lib/api-client";

type Question = {
  id: string;
  header: string;
  question: string;
  options: { label: string; description?: string }[];
  selection: { mode: "single" | "multiple"; min?: number; max?: number };
};
type Input = { userInputId: string; questions: Question[] };
type Approval = {
  approvalId: string;
  toolName?: string;
  rawArgs?: string;
  currentRequirementId: { sourceIndex: number };
  availableChoices: {
    choiceId: string;
    decision: string;
    scope: string;
    label?: string;
    rulePreview?: string;
  }[];
  subject: { kind: string; toolName?: string; command?: string; path?: string };
};
type Interactions = { user_inputs: Input[]; approvals: Approval[] };
export function NativeInteractions({ runId, author }: { runId: string; author: string }) {
  const [tick, setTick] = useState(0);
  const pending = useApiResource<Interactions>(`/v1/runs/${runId}/interactions`, tick);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 3000);
    return () => clearInterval(timer);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function answer(value: unknown) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/v1/runs/${runId}/interactions`, value);
      setNotice("Jawaban diterima harness. Hasil pekerjaan mengikuti status run.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Jawaban belum terkonfirmasi; periksa permintaan terbaru.",
      );
    } finally {
      setBusy(false);
      pending.retry();
    }
  }
  return (
    <section aria-label={`Permintaan native ${author}`} className="space-y-3">
      {pending.error && (
        <p className="text-caption text-muted-foreground">
          Permintaan input belum dapat diperiksa.{" "}
          <button type="button" className="text-link underline" onClick={pending.retry}>
            Periksa lagi
          </button>
        </p>
      )}
      {pending.data?.user_inputs.map((input) => (
        <NativeQuestion
          key={input.userInputId}
          input={input}
          author={author}
          busy={busy}
          answer={answer}
        />
      ))}
      {pending.data?.approvals.map((approval) => (
        <section key={approval.approvalId} className="max-w-lg space-y-3 rounded-xl border p-4">
          <h3 className="text-sm font-medium">{author} meminta keputusan</h3>
          <p className="text-sm">
            {approval.toolName ?? approval.subject.toolName ?? approval.subject.kind}
          </p>
          <details className="text-caption">
            <summary className="cursor-pointer">Rincian tindakan</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">
              {approval.subject.command ??
                approval.subject.path ??
                approval.rawArgs ??
                approval.subject.kind}
            </pre>
          </details>
          <div className="flex flex-wrap gap-2">
            {approval.availableChoices.map((choice) => (
              <Button
                key={choice.choiceId}
                size="sm"
                variant="outline"
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
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-caption text-muted-foreground">
          {notice}
        </p>
      )}
    </section>
  );
}
function NativeQuestion({
  input,
  author,
  busy,
  answer,
}: {
  input: Input;
  author: string;
  busy: boolean;
  answer: (value: unknown) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, { selected: string[]; text: string }>>({});
  const ready = input.questions.every((q) => {
    const v = values[q.id];
    return (
      v &&
      (v.text.trim() || v.selected.length >= (q.selection.min ?? 1)) &&
      (!q.selection.max || v.selected.length <= q.selection.max)
    );
  });
  return (
    <form
      className="max-w-lg space-y-4 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || busy) return;
        void answer({
          type: "user_input",
          request_id: input.userInputId,
          answers: input.questions.map((q) => {
            const value = values[q.id];
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
      }}
    >
      <p className="text-caption text-muted-foreground">{author} menunggu jawaban kamu</p>
      {input.questions.map((q) => (
        <fieldset key={q.id} className="space-y-2" disabled={busy}>
          <legend className="mb-2 text-sm font-medium">{q.question}</legend>
          {q.options.map((option) => (
            <label key={option.label} className="flex min-h-10 items-start gap-2 text-sm">
              <input
                type={q.selection.mode === "multiple" ? "checkbox" : "radio"}
                name={`${input.userInputId}:${q.id}`}
                className="mt-1 size-4 shrink-0"
                checked={values[q.id]?.selected.includes(option.label) ?? false}
                onChange={(e) =>
                  setValues((current) => {
                    const v = current[q.id] ?? { text: "", selected: [] };
                    return {
                      ...current,
                      [q.id]: {
                        ...v,
                        text: "",
                        selected:
                          q.selection.mode === "single"
                            ? [option.label]
                            : e.target.checked
                              ? [...v.selected, option.label]
                              : v.selected.filter((s) => s !== option.label),
                      },
                    };
                  })
                }
              />
              <span>
                {option.label}
                {option.description && (
                  <span className="block text-caption text-muted-foreground">
                    {option.description}
                  </span>
                )}
              </span>
            </label>
          ))}
          <Textarea
            aria-label={`Jawaban: ${q.header || q.question}`}
            maxLength={500}
            placeholder="Atau tulis jawaban…"
            value={values[q.id]?.text ?? ""}
            onChange={(e) =>
              setValues((current) => ({
                ...current,
                [q.id]: { selected: [], text: e.target.value },
              }))
            }
          />
        </fieldset>
      ))}
      <Button size="sm" disabled={!ready || busy}>
        Kirim jawaban ke harness
      </Button>
    </form>
  );
}
