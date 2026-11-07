import { type ReactNode, useId } from "react";
import { AssistantMessageAuthor } from "./assistant-message";
import { InlineReferenceText } from "./inline-references";
import { MessageTime } from "./message-time";
import "./conversation-interactions.css";

/** One presentation for product and harness questions or decisions. */
export function InteractionCard({
  title,
  author,
  at,
  children,
  footer,
  busy = false,
  settled = false,
}: {
  title: string;
  author: string;
  at?: string;
  children?: ReactNode;
  footer?: ReactNode;
  busy?: boolean;
  settled?: boolean;
}) {
  const titleId = useId();
  return (
    <section
      className="conversation-interaction"
      aria-labelledby={titleId}
      data-interaction-author={author}
      aria-busy={busy}
      data-interaction-state={settled ? "settled" : "pending"}
    >
      <AssistantMessageAuthor name={author} />
      <h3 id={titleId}>
        <InlineReferenceText text={title} />
      </h3>
      {children && <div className="conversation-interaction-body">{children}</div>}
      {footer && <footer>{footer}</footer>}
      <MessageTime at={at} className="interaction-time" />
    </section>
  );
}
