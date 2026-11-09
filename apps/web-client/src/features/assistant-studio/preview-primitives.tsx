import type { ReactNode } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import { Answer } from "@/features/conversation/components/answer";
import { AssistantMessage } from "@/features/conversation/components/assistant-message";
import { agentStyle } from "@/features/conversation/components/identity";
import { MessageTime } from "@/features/conversation/components/message-time";
import { sampleSnapshot, sampleTime, tobi } from "./fixtures";

export type OpenSample = (kind: "agent" | "files" | "goals" | "routine", id: string) => void;

export function AssistantRow({
  group,
  children,
  open,
}: {
  group: boolean;
  children: ReactNode;
  open: OpenSample;
}) {
  return (
    <AssistantMessage group={group} agent={tobi} open={() => open("agent", tobi.id)}>
      {children}
    </AssistantMessage>
  );
}

export function SampleAnswer({
  text,
  group,
  open,
  streaming = false,
}: {
  text: string;
  group: boolean;
  open: OpenSample;
  streaming?: boolean;
}) {
  return (
    <Answer
      agentId={tobi.id}
      text={text}
      streaming={streaming}
      sentAt={sampleTime}
      sender={group ? { style: agentStyle(tobi) } : undefined}
      snapshot={sampleSnapshot()}
      openResource={open}
    />
  );
}

export function UserReply({ text }: { text: string }) {
  return (
    <Message align="end" className="conversation-message">
      <MessageContent>
        <Bubble variant="secondary" className="chat-user-bubble">
          <BubbleContent className="chat-bubble-content text-[15px] leading-[22px] whitespace-pre-wrap">
            {text}
            <MessageTime at={sampleTime} />
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
