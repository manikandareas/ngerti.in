import { z } from "zod";
import { HarnessError, interactionAnswer } from "../contracts";
import { approval, userInput } from "./protocol";
import type { MuseTransport } from "./transport";

/** Retain native stage identities; a stale or invented choice never becomes a permission grant. */
export class MuseInteractions {
  readonly approvals = new Map<string, z.infer<typeof approval>>();
  readonly questions = new Map<string, z.infer<typeof userInput>>();
  get pending() {
    return this.approvals.size > 0 || this.questions.size > 0;
  }
  clear() {
    this.approvals.clear();
    this.questions.clear();
  }
  replacePending(raw: unknown) {
    const snapshot = z
      .object({ approvals: z.array(approval), userInputs: z.array(userInput) })
      .parse(raw);
    this.clear();
    for (const value of snapshot.approvals) this.approvals.set(value.approvalId, value);
    for (const value of snapshot.userInputs) this.questions.set(value.userInputId, value);
  }
  snapshot() {
    return { approvals: [...this.approvals.values()], user_inputs: [...this.questions.values()] };
  }
  receive(method: string, raw: unknown, params: Record<string, unknown>) {
    if (method === "approval/requested" || method === "approval/updated") {
      const value = approval.parse(raw);
      this.approvals.set(value.approvalId, value);
      return true;
    }
    if (method === "userInput/requested") {
      const value = userInput.parse(raw);
      this.questions.set(value.userInputId, value);
      return true;
    }
    if (method === "approval/resolved") {
      this.approvals.delete(String(params.approvalId));
      return true;
    }
    if (method === "userInput/settled") {
      this.questions.delete(String(params.userInputId));
      return true;
    }
    return false;
  }
  async respond(sessionId: string, raw: unknown, transport: MuseTransport) {
    const answer = interactionAnswer.parse(raw);
    if (answer.type === "approval") {
      const pending = this.approvals.get(answer.request_id);
      if (
        !pending ||
        pending.currentRequirementId.sourceIndex !== answer.source_index ||
        !pending.availableChoices.some((c) => c.choiceId === answer.choice_id)
      )
        throw new HarnessError("NATIVE_REJECTED");
      return await transport.command("approval/decide", {
        sessionId: sessionId,
        approvalId: pending.approvalId,
        requirementId: pending.currentRequirementId,
        choiceId: answer.choice_id,
      });
    }
    const pending = this.questions.get(answer.request_id);
    if (
      !pending ||
      answer.answers.length !== pending.questions.length ||
      new Set(answer.answers.map((a) => a.questionId)).size !== answer.answers.length
    )
      throw new HarnessError("NATIVE_REJECTED");
    for (const value of answer.answers) {
      const question = pending.questions.find((q) => q.id === value.questionId);
      if (
        !question ||
        [value.freeText, value.selectedLabel, value.selectedLabels].filter((v) => v !== undefined)
          .length !== 1
      )
        throw new HarnessError("NATIVE_REJECTED");
      if (
        value.selectedLabel !== undefined &&
        (question.selection.mode !== "single" ||
          !question.options.some((o) => o.label === value.selectedLabel))
      )
        throw new HarnessError("NATIVE_REJECTED");
      if (
        value.selectedLabels &&
        (question.selection.mode !== "multiple" ||
          new Set(value.selectedLabels).size !== value.selectedLabels.length ||
          value.selectedLabels.some((v) => !question.options.some((o) => o.label === v)) ||
          value.selectedLabels.length < (question.selection.min ?? 0) ||
          value.selectedLabels.length > (question.selection.max ?? question.options.length))
      )
        throw new HarnessError("NATIVE_REJECTED");
    }
    return await transport.command("userInput/answer", {
      sessionId: sessionId,
      userInputId: pending.userInputId,
      answers: answer.answers,
    });
  }
}
