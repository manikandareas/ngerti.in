import type { NativeQuestion } from "@/types/native-interactions";

export type NativeAnswerDraft = { selected: string[]; text: string };
export function nativeQuestionAnswered(
  question: NativeQuestion,
  value: NativeAnswerDraft | undefined,
  custom: boolean,
) {
  const field = question.input;
  if (!field) {
    if (question.selection.min === 0 && !value?.text.trim() && !value?.selected.length) return true;
    if (custom && !value?.text.trim()) return false;
    const count = value?.selected.length ?? 0;
    return (
      !!value?.text.trim() ||
      (count >= (question.selection.min ?? 1) &&
        (question.selection.max === undefined || count <= question.selection.max))
    );
  }
  if (!value || (!value.text && !value.selected.length)) {
    if (!field.required) return true;
    if (field.type === "array") return (question.selection.min ?? 0) === 0;
    return (
      !!value && field.type === "string" && !field.choices_only && (field.min_length ?? 0) === 0
    );
  }
  if (field.choices_only)
    return (
      !value.text &&
      value.selected.length >= (question.selection.min ?? 0) &&
      value.selected.length <= (question.selection.max ?? 100) &&
      value.selected.every((label) => question.options.some((option) => option.label === label))
    );
  if (field.type === "number" || field.type === "integer") {
    const number = Number(value.text);
    return (
      !!value.text.trim() &&
      Number.isFinite(number) &&
      (field.type !== "integer" || Number.isInteger(number)) &&
      (field.minimum === undefined || number >= field.minimum) &&
      (field.maximum === undefined || number <= field.maximum)
    );
  }
  if (value.text.length < (field.min_length ?? 0) || value.text.length > (field.max_length ?? 8000))
    return false;
  if (field.format === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.text);
  if (field.format === "uri") {
    try {
      return !!new URL(value.text).protocol;
    } catch {
      return false;
    }
  }
  if (field.format === "date")
    return /^\d{4}-\d{2}-\d{2}$/.test(value.text) && !Number.isNaN(Date.parse(value.text));
  if (field.format === "date-time")
    return (
      /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value.text) &&
      !Number.isNaN(Date.parse(value.text))
    );
  return true;
}
