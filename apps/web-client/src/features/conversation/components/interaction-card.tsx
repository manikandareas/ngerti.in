import { type ReactNode, useId } from "react";
import { InlineReferenceText } from "./inline-references";
import "./conversation-interactions.css";

/** One presentation for product and harness questions or decisions. */
export function InteractionCard({
  title,
  author,
  children,
  footer,
  busy = false,
  settled = false,
}: {
  title: string;
  author: string;
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
      <h3 id={titleId}>
        <InlineReferenceText text={title} />
      </h3>
      {children && <div className="conversation-interaction-body">{children}</div>}
      {footer && <footer>{footer}</footer>}
    </section>
  );
}
