import { useRef } from "react";

/** An editable alternative uses the same choice control as the predefined answers. */
export function CustomQuestionOption({
  mode,
  name,
  checked,
  text,
  disabled,
  maxLength,
  inputLabel = "Isi jawaban lain",
  onCheckedChange,
  onTextChange,
}: {
  mode: "single" | "multiple";
  name: string;
  checked: boolean;
  text: string;
  disabled: boolean;
  maxLength: number;
  inputLabel?: string;
  onCheckedChange: (checked: boolean) => void;
  onTextChange: (text: string) => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="interaction-option interaction-custom-option">
      <input
        type={mode === "multiple" ? "checkbox" : "radio"}
        name={name}
        aria-label="Jawaban lain"
        checked={checked}
        disabled={disabled}
        onChange={(event) => {
          onCheckedChange(event.target.checked);
          if (event.target.checked) input.current?.focus();
        }}
      />
      <textarea
        ref={input}
        className="interaction-custom-input"
        rows={1}
        aria-label={inputLabel}
        placeholder="Jawaban lain…"
        value={text}
        maxLength={maxLength}
        disabled={disabled}
        onFocus={() => {
          if (!checked) onCheckedChange(true);
        }}
        onChange={(event) => {
          if (!checked) onCheckedChange(true);
          onTextChange(event.target.value);
        }}
      />
    </div>
  );
}
