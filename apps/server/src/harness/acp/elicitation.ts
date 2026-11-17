import type * as acp from "@agentclientprotocol/sdk/unstable";
import { z } from "zod";
import type { Redactor } from "../context";
import { HarnessError, type interactionAnswer } from "../contracts";
import { userInputDisplay } from "../interaction-contracts";

type Answer = Extract<z.infer<typeof interactionAnswer>, { type: "user_input" }>;
const invalid = () => new HarnessError("NATIVE_REJECTED");
const property = z.object({
  type: z.enum(["string", "number", "integer", "boolean", "array"]),
  title: z.string().max(500).nullish(),
  description: z.string().max(8000).nullish(),
  minLength: z.int().min(0).max(8000).nullish(),
  maxLength: z.int().min(0).max(8000).nullish(),
  minimum: z.number().nullish(),
  maximum: z.number().nullish(),
  format: z.enum(["email", "uri", "date", "date-time"]).nullish(),
  pattern: z.string().nullish(),
  enum: z.array(z.string().max(8000)).max(100).nullish(),
  oneOf: z
    .array(
      z.object({
        const: z.string().max(8000),
        title: z.string().max(1000),
        description: z.string().max(4000).nullish(),
      }),
    )
    .max(100)
    .nullish(),
  minItems: z.int().min(0).max(100).nullish(),
  maxItems: z.int().min(0).max(100).nullish(),
  items: z
    .object({
      type: z.literal("string").optional(),
      enum: z.array(z.string().max(8000)).max(100).optional(),
      anyOf: z
        .array(
          z.object({
            const: z.string().max(8000),
            title: z.string().max(1000),
            description: z.string().max(4000).nullish(),
          }),
        )
        .max(100)
        .optional(),
    })
    .optional(),
});

/** A bounded form projection into the existing durable question/answer journal. Native keys stay private. */
export function elicitationForm(request: acp.CreateElicitationRequest, redactor: Redactor) {
  const parsed = z
    .object({
      mode: z.literal("form"),
      message: z.string().max(8000),
      requestedSchema: z.object({
        type: z.literal("object").optional(),
        properties: z.record(z.string().min(1).max(1000), property),
        required: z.array(z.string()).max(100).nullish(),
      }),
    })
    .safeParse(request);
  if (!parsed.success) throw invalid();
  const schema = parsed.data.requestedSchema;
  const entries = Object.entries(schema.properties);
  if (
    !entries.length ||
    entries.length > 100 ||
    schema.required?.some((key) => !Object.hasOwn(schema.properties, key))
  )
    throw invalid();
  const fields = entries.map(([key, field], index) => {
    // Do not execute an agent-supplied regular expression on the server's event loop.
    // Unsupported schemas receive an explicit negative response, never an incorrectly validated answer.
    if (field.pattern) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const required = schema.required?.includes(key) ?? false;
    const rawChoices =
      field.type === "boolean"
        ? [
            { const: "true", title: "Yes" },
            { const: "false", title: "No" },
          ]
        : field.type === "array"
          ? (field.items?.anyOf ??
            field.items?.enum?.map((value) => ({ const: value, title: value })) ??
            [])
          : (field.oneOf ?? field.enum?.map((value) => ({ const: value, title: value })) ?? []);
    const choices = rawChoices.map((choice) => ({
      value: choice.const,
      label: redactor.text(choice.title),
      description:
        "description" in choice && typeof choice.description === "string"
          ? redactor.text(choice.description)
          : undefined,
    }));
    if (
      new Set(choices.map((choice) => choice.label)).size !== choices.length ||
      new Set(choices.map((choice) => choice.value)).size !== choices.length ||
      (field.type === "array" && !choices.length)
    )
      throw invalid();
    let validator: z.ZodType;
    if (field.type === "string") {
      const text = z
        .string()
        .min(field.minLength ?? 0)
        .max(field.maxLength ?? 8000);
      validator = text;
      if (field.format === "email")
        validator = text.refine((value) => z.email().safeParse(value).success);
      if (field.format === "uri")
        validator = text.refine((value) => z.url().safeParse(value).success);
      if (field.format === "date")
        validator = text.refine((value) => z.iso.date().safeParse(value).success);
      if (field.format === "date-time")
        validator = text.refine(
          (value) => z.iso.datetime({ offset: true }).safeParse(value).success,
        );
      if (choices.length)
        validator = validator.refine((value) => choices.some((choice) => choice.value === value));
    } else if (field.type === "number" || field.type === "integer") {
      let number = field.type === "integer" ? z.int() : z.number();
      if (field.minimum != null) number = number.min(field.minimum);
      if (field.maximum != null) number = number.max(field.maximum);
      validator = number;
    } else if (field.type === "boolean") validator = z.boolean();
    else
      validator = z
        .array(z.string().refine((value) => choices.some((choice) => choice.value === value)))
        .min(field.minItems ?? 0)
        .max(field.maxItems ?? 100)
        .refine((values) => new Set(values).size === values.length);
    const id = `field-${index}`;
    const question = {
      id,
      header: redactor.text(field.title ?? key),
      question: redactor.text(
        [request.message, field.title ?? key, field.description].filter(Boolean).join("\n\n"),
      ),
      options: choices.map(({ label, description }) => ({
        label,
        ...(description ? { description } : {}),
      })),
      selection: {
        mode: field.type === "array" ? ("multiple" as const) : ("single" as const),
        min: required ? (field.type === "array" ? (field.minItems ?? 0) : 1) : 0,
        max: field.type === "array" ? (field.maxItems ?? 100) : 1,
      },
      input: {
        type: field.type,
        required,
        choices_only: !!choices.length,
        ...(field.type === "string"
          ? { min_length: field.minLength ?? 0, max_length: field.maxLength ?? 8000 }
          : {}),
        ...(field.minimum != null ? { minimum: field.minimum } : {}),
        ...(field.maximum != null ? { maximum: field.maximum } : {}),
        ...(field.format ? { format: field.format } : {}),
      },
    };
    return { key, field, id, required, choices, validator, question };
  });
  const view = userInputDisplay.parse({
    userInputId: crypto.randomUUID(),
    elicitation: true,
    questions: fields.map((field) => field.question),
  });
  if (Buffer.byteLength(JSON.stringify(view)) > 128 * 1024) throw invalid();
  return {
    view,
    answer(answer: Answer): acp.CreateElicitationResponse {
      if (answer.action === "cancel" || answer.action === "decline") {
        if (answer.answers.length) throw invalid();
        return { action: answer.action };
      }
      if (
        new Set(answer.answers.map((value) => value.questionId)).size !== answer.answers.length ||
        answer.answers.some((value) => !fields.some((field) => field.id === value.questionId))
      )
        throw invalid();
      const content: Record<string, acp.ElicitationContentValue> = Object.create(null);
      for (const entry of fields) {
        const input = answer.answers.find((value) => value.questionId === entry.id);
        if (
          !input ||
          (input.freeText === undefined &&
            input.selectedLabel === undefined &&
            !input.selectedLabels?.length)
        ) {
          if (
            entry.field.type === "array" &&
            entry.required &&
            entry.validator.safeParse([]).success
          ) {
            content[entry.key] = [];
            continue;
          }
          if (entry.required) throw invalid();
          continue;
        }
        if (
          [
            input.freeText !== undefined,
            input.selectedLabel !== undefined,
            input.selectedLabels !== undefined,
          ].filter(Boolean).length !== 1
        )
          throw invalid();
        let value: unknown = input.freeText;
        if (entry.choices.length) {
          const labels =
            input.selectedLabels ??
            (input.selectedLabel !== undefined ? [input.selectedLabel] : []);
          if (
            !labels.length ||
            labels.some((label) => !entry.choices.some((choice) => choice.label === label))
          )
            throw invalid();
          const values = labels.map(
            (label) => entry.choices.find((choice) => choice.label === label)?.value,
          );
          if (entry.field.type !== "array" && values.length !== 1) throw invalid();
          value = entry.field.type === "array" ? values : values[0];
          if (entry.field.type === "boolean") value = value === "true";
        } else if (entry.field.type === "number" || entry.field.type === "integer") {
          if (!input.freeText?.trim()) throw invalid();
          value = Number(input.freeText);
        }
        const validated = entry.validator.safeParse(value);
        if (!validated.success) throw invalid();
        content[entry.key] = validated.data as acp.ElicitationContentValue;
      }
      return { action: "accept", content };
    },
  };
}
