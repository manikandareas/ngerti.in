import type { NativeApproval, NativeInteractionAnswer } from "@/types/native-interactions";
import { ApprovalDetails } from "./approval-details";
import { InteractionCard } from "./interaction-card";

export function NativeApprovalCard({
  approval,
  author,
  at,
  busy,
  answer,
}: {
  approval: NativeApproval;
  author: string;
  at?: string;
  busy: boolean;
  answer: (value: NativeInteractionAnswer) => Promise<unknown>;
}) {
  let argumentsValue: unknown = approval.rawArgs;
  if (approval.rawArgs) {
    try {
      argumentsValue = JSON.parse(approval.rawArgs);
    } catch {
      /* Plain-text arguments remain readable as supplied. */
    }
  }
  const isAllow = (decision: string) => /^(allow|approve|accept)(?:$|[-_ ])/i.test(decision);
  const choices = [...approval.availableChoices].sort(
    (left, right) => Number(isAllow(left.decision)) - Number(isAllow(right.decision)),
  );
  return (
    <InteractionCard
      title="Izinkan tindakan ini?"
      author={author}
      at={at}
      busy={busy}
      footer={
        <div className="interaction-actions">
          {choices.map((choice) => (
            <button
              key={choice.choiceId}
              type="button"
              className="interaction-action"
              data-primary={isAllow(choice.decision) || undefined}
              data-outline={!isAllow(choice.decision) || undefined}
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
              {choice.scope !== "once" && (
                <span className="ms-1 text-[12px] opacity-80">· {choice.scope}</span>
              )}
            </button>
          ))}
        </div>
      }
    >
      <p className="text-[14px] leading-6 text-muted-foreground">
        {approval.toolName ?? approval.subject.toolName ?? approval.subject.kind}
      </p>
      <ApprovalDetails
        values={Object.fromEntries(
          Object.entries({
            command: approval.subject.command,
            path: approval.subject.path,
            arguments: argumentsValue,
          }).filter(([, value]) => value !== undefined),
        )}
      />
    </InteractionCard>
  );
}
