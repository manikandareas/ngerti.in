import { type Dispatch, type SetStateAction, useState } from "react";
import type { HumanRequest } from "@/types/work";
import { ApprovalDetails } from "./approval-details";
import { CustomQuestionOption } from "./custom-question-option";
import { InteractionCard } from "./interaction-card";

/** Product interaction presentation shared by conversations and the local Studio. */
export function HumanReplyCard({
  request,
  author,
  question,
  selected,
  text,
  busy,
  uncertain,
  error,
  setSelected,
  setText,
  submit,
}: {
  request: Pick<HumanRequest, "id" | "created_at" | "state" | "purpose" | "options" | "action">;
  author: string;
  question?: string;
  selected: string[];
  text: string;
  busy: boolean;
  uncertain: boolean;
  error: string;
  setSelected: Dispatch<SetStateAction<string[]>>;
  setText: Dispatch<SetStateAction<string>>;
  submit: (decision?: "approve" | "reject" | null) => unknown;
}) {
  const [customSelected, setCustomSelected] = useState(!!text.trim());
  if (request.purpose !== "approval" && !request.options) return null;
  const title =
    question || (request.purpose === "approval" ? "Setujui permintaan ini?" : "Pilih jawaban");
  if (request.state !== "pending")
    return <InteractionCard title={title} author={author} at={request.created_at} settled />;
  const options = request.options;
  const count = selected.length + (customSelected && text.trim() ? 1 : 0);
  return (
    <InteractionCard
      title={title}
      author={author}
      at={request.created_at}
      busy={busy}
      footer={
        <div className="interaction-actions">
          {uncertain ? (
            <button
              type="button"
              className="interaction-action"
              disabled={busy}
              onClick={() => void submit()}
            >
              Periksa status
            </button>
          ) : request.purpose === "approval" ? (
            <>
              <button
                type="button"
                className="interaction-action"
                data-outline="true"
                disabled={busy}
                onClick={() => void submit("reject")}
              >
                Tolak
              </button>
              <button
                type="button"
                className="interaction-action"
                data-primary="true"
                disabled={busy}
                onClick={() => void submit("approve")}
              >
                Setujui
              </button>
            </>
          ) : (
            <button
              type="button"
              className="interaction-action"
              data-primary="true"
              disabled={
                busy ||
                !options ||
                count < options.min ||
                count > options.max ||
                (customSelected && !text.trim())
              }
              onClick={() => void submit()}
            >
              Lanjut
            </button>
          )}
        </div>
      }
    >
      {request.action && <ApprovalDetails values={request.action.arguments} />}
      {options && (
        <fieldset disabled={busy || uncertain} className="interaction-options">
          {options.choices.map((option) => (
            <label key={option.id} className="interaction-option">
              <input
                type={options.max === 1 ? "radio" : "checkbox"}
                name={`question-${request.id}`}
                value={option.id}
                checked={selected.includes(option.id)}
                onChange={() => {
                  setSelected((values) =>
                    options.max === 1
                      ? [option.id]
                      : values.includes(option.id)
                        ? values.filter((id) => id !== option.id)
                        : [...values, option.id],
                  );
                  if (options.max === 1) {
                    setText("");
                    setCustomSelected(false);
                  }
                }}
              />
              {option.label}
            </label>
          ))}
          {options.allow_custom && (
            <CustomQuestionOption
              mode={options.max === 1 ? "single" : "multiple"}
              name={`question-${request.id}`}
              checked={customSelected}
              text={text}
              disabled={busy || uncertain}
              maxLength={16000}
              onCheckedChange={(checked) => {
                setCustomSelected(checked);
                if (checked && options.max === 1) setSelected([]);
                if (!checked) setText("");
              }}
              onTextChange={setText}
            />
          )}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="interaction-error">
          {error}
        </p>
      )}
    </InteractionCard>
  );
}
