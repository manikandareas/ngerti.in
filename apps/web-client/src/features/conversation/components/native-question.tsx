import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import type {
  NativeInteractionAnswer,
  NativeUserInput,
  NativeQuestion as Question,
} from "@/types/native-interactions";
import { useComposerRequest, useComposerScope } from "../lib/composer-requests";
import { nativeQuestionAnswered } from "../lib/native-answer";
import { CustomQuestionOption } from "./custom-question-option";
import { InteractionCard } from "./interaction-card";
import { MessageTime } from "./message-time";

export function NativeQuestion({
  input,
  author,
  at,
  busy,
  answer,
  canRespond = true,
  scopeId,
  error = "",
  check,
}: {
  input: NativeUserInput;
  author: string;
  at?: string;
  busy: boolean;
  canRespond?: boolean;
  scopeId?: string;
  error?: string;
  check?: () => Promise<unknown>;
  answer: (value: NativeInteractionAnswer) => Promise<unknown>;
}) {
  const [values, setValues] = useState<Record<string, { selected: string[]; text: string }>>({});
  const [active, setActive] = useState(0);
  const [customChoices, setCustomChoices] = useState<Record<string, boolean>>({});
  const scope = useComposerScope();
  const currentIndex = Math.min(active, input.questions.length - 1);
  const question = input.questions[currentIndex];
  function answered(q: Question, drafts = values) {
    return nativeQuestionAnswered(q, drafts[q.id], !!customChoices[q.id]);
  }
  async function submit(drafts = values) {
    if (busy || !canRespond || !input.questions.every((q) => answered(q, drafts))) return false;
    return (
      (await answer({
        type: "user_input",
        request_id: input.userInputId,
        answers: input.questions.map((q) => {
          const value = drafts[q.id] ?? { selected: [], text: "" };
          if (
            value.text.trim() ||
            (q.input?.type === "string" &&
              !q.input.choices_only &&
              !!drafts[q.id] &&
              (q.input.required || !!value.text))
          )
            return { questionId: q.id, freeText: value.text };
          if (q.selection.mode === "multiple")
            return { questionId: q.id, selectedLabels: value.selected };
          if (value.selected[0]) return { questionId: q.id, selectedLabel: value.selected[0] };
          return { questionId: q.id };
        }),
      })) !== false
    );
  }
  const direct = !!question && question.options.length === 0 && !question.input;
  const bound = useComposerRequest(
    direct
      ? {
          id: `native:${input.userInputId}:${question.id}`,
          scope: scopeId ?? scope,
          author,
          question: question.question,
          maxLength: 500,
          busy,
          locked: !canRespond,
          error,
          check,
          submit: async (text) => {
            if (!canRespond || busy || !text.trim() || text.length > 500) return false;
            const next = { ...values, [question.id]: { selected: [], text } };
            setValues(next);
            const unanswered = input.questions.findIndex((candidate) => !answered(candidate, next));
            if (unanswered >= 0) {
              setActive(unanswered);
              return true;
            }
            return submit(next);
          },
        }
      : null,
  );
  if (!question || !canRespond) return null;
  if (direct && bound)
    return (
      <Bubble variant="secondary" className="chat-agent-bubble">
        <BubbleContent className="chat-bubble-content text-[15px] leading-[22px]">
          <p>{question.question}</p>
          <MessageTime at={at} />
        </BubbleContent>
      </Bubble>
    );
  const current = values[question.id] ?? { selected: [], text: "" };
  const optional = question.input ? !question.input.required : question.selection.min === 0;
  const last = currentIndex === input.questions.length - 1;
  function pick(label: string) {
    setCustomChoices((previous) => ({ ...previous, [question.id]: false }));
    let selected = [label];
    if (question.selection.mode === "multiple") {
      selected = current.selected.includes(label)
        ? current.selected.filter((value) => value !== label)
        : [...current.selected, label];
    }
    setValues((previous) => ({ ...previous, [question.id]: { selected, text: "" } }));
  }
  function advance() {
    if (last) void submit();
    else setActive((index) => index + 1);
  }
  function skip() {
    const next = { ...values, [question.id]: { selected: [], text: "" } };
    setValues(next);
    setCustomChoices((previous) => ({ ...previous, [question.id]: false }));
    if (last) void submit(next);
    else setActive((index) => index + 1);
  }
  return (
    <form
      className="w-full"
      onSubmit={(event) => {
        event.preventDefault();
        advance();
      }}
    >
      <InteractionCard
        title={question.question}
        author={author}
        at={at}
        busy={busy}
        footer={
          <>
            <div className="interaction-progress">
              {input.questions.length > 1 && (
                <button
                  type="button"
                  className="interaction-back"
                  aria-label="Pertanyaan sebelumnya"
                  disabled={busy || currentIndex === 0}
                  onClick={() => setActive((index) => index - 1)}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={15} />
                </button>
              )}
              <span>
                {currentIndex + 1}/{input.questions.length}
              </span>
            </div>
            <div className="interaction-actions">
              {input.elicitation && (
                <button
                  type="button"
                  className="interaction-action"
                  disabled={busy}
                  onClick={() =>
                    void answer({
                      type: "user_input",
                      request_id: input.userInputId,
                      action: "decline",
                      answers: [],
                    })
                  }
                >
                  Tolak
                </button>
              )}
              {optional && (
                <button type="button" className="interaction-action" disabled={busy} onClick={skip}>
                  Lewati
                </button>
              )}
              <button
                type="submit"
                className="interaction-action"
                data-primary="true"
                disabled={
                  busy ||
                  !answered(question) ||
                  (last && !input.questions.every((q) => answered(q)))
                }
              >
                {busy ? "Mengirim…" : last ? "Kirim jawaban" : "Lanjut"}
              </button>
            </div>
          </>
        }
      >
        {question.selection.mode === "multiple" && (
          <p className="interaction-notice mb-2">Pilih satu atau beberapa jawaban.</p>
        )}
        {question.options.length > 0 && (
          <fieldset className="interaction-options" aria-label={question.question}>
            {question.options.map((option) => {
              const checked = current.selected.includes(option.label);
              return (
                <label key={option.label} className="interaction-option">
                  <input
                    type={question.selection.mode === "multiple" ? "checkbox" : "radio"}
                    name={`native-${input.userInputId}-${question.id}`}
                    checked={checked}
                    disabled={
                      busy ||
                      (question.selection.mode === "multiple" &&
                        question.selection.max !== undefined &&
                        !checked &&
                        current.selected.length >= question.selection.max)
                    }
                    onChange={() => pick(option.label)}
                  />
                  <span>
                    {option.label}
                    {option.description && <small>{option.description}</small>}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        {question.options.length > 0 ? (
          !question.input?.choices_only && (
            <CustomQuestionOption
              mode={question.selection.mode}
              name={`native-${input.userInputId}-${question.id}`}
              checked={customChoices[question.id] || !!current.text.trim()}
              text={current.text}
              disabled={busy}
              maxLength={question.input?.max_length ?? 500}
              inputLabel={`Jawaban: ${question.header || question.question}`}
              onCheckedChange={(checked) => {
                setCustomChoices((previous) => ({ ...previous, [question.id]: checked }));
                setValues((previous) => ({
                  ...previous,
                  [question.id]: { selected: [], text: checked ? current.text : "" },
                }));
              }}
              onTextChange={(text) =>
                setValues((previous) => ({ ...previous, [question.id]: { selected: [], text } }))
              }
            />
          )
        ) : question.input &&
          (question.input.type !== "string" ||
            question.input.format === "email" ||
            question.input.format === "uri" ||
            question.input.format === "date") ? (
          <input
            className="interaction-other"
            aria-label={`Jawaban: ${question.header || question.question}`}
            type={
              question.input.type === "number" || question.input.type === "integer"
                ? "number"
                : question.input.format === "email"
                  ? "email"
                  : question.input.format === "uri"
                    ? "url"
                    : question.input.format === "date"
                      ? "date"
                      : "text"
            }
            min={question.input.minimum}
            max={question.input.maximum}
            step={question.input.type === "integer" ? 1 : "any"}
            value={current.text}
            disabled={busy}
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                [question.id]: { selected: [], text: event.target.value },
              }))
            }
          />
        ) : (
          <textarea
            className="interaction-other"
            aria-label={`Jawaban: ${question.header || question.question}`}
            maxLength={question.input?.max_length ?? 500}
            rows={1}
            placeholder={direct ? "Tulis jawabanmu…" : "Pilihan lain…"}
            value={current.text}
            disabled={busy}
            onChange={(event) =>
              setValues((previous) => ({
                ...previous,
                [question.id]: { selected: [], text: event.target.value },
              }))
            }
          />
        )}
        {question.input && (
          <p className="mt-2 text-xs text-muted-foreground">
            {optional ? "Opsional." : "Wajib diisi."}{" "}
            {question.input.minimum !== undefined && `Minimum ${question.input.minimum}. `}
            {question.input.maximum !== undefined && `Maksimum ${question.input.maximum}. `}
            {question.input.min_length !== undefined &&
              question.input.min_length > 0 &&
              `Minimal ${question.input.min_length} karakter. `}
            {question.input.format === "date-time" &&
              "Gunakan waktu ISO dengan zona waktu, misalnya 2026-11-16T10:00:00Z."}
          </p>
        )}
      </InteractionCard>
    </form>
  );
}
