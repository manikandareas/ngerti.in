import { CornerDownLeft } from "lucide-react";
import {
  type ComponentProps,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { AgentAvatar } from "@/features/agents/agent-avatar";
import type { Agent } from "@/features/agents/agents-page";
import { insertMention, type MentionQuery, mentionAtCaret } from "./mention-query";

type Props = Omit<ComponentProps<typeof Textarea>, "value" | "onChange" | "ref"> & {
  value: string;
  onValueChange: (value: string) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  agents: Agent[];
};

export function MentionInput({
  value,
  onValueChange,
  inputRef,
  agents,
  onKeyDown,
  disabled,
  ...props
}: Props) {
  const id = useId();
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [active, setActive] = useState(0);
  const [wide, setWide] = useState(false);
  const measure = useRef<HTMLSpanElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const matches = agents.filter(
    (agent) =>
      agent.status === "active" &&
      `${agent.display_name} ${agent.handle}`
        .toLocaleLowerCase()
        .includes(mention?.query.toLocaleLowerCase() ?? ""),
  );
  const open = !!mention && !disabled && agents.length > 0;
  const selected = Math.min(active, Math.max(0, matches.length - 1));

  useLayoutEffect(() => {
    const bar = inputRef.current?.closest(".conversation-composer");
    if (!bar) return;
    const resize = () =>
      setWide(value.includes("\n") || (measure.current?.scrollWidth ?? 0) > bar.clientWidth - 152);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [value, inputRef]);

  useEffect(() => {
    const container = list.current;
    const option = container?.children[selected];
    if (!open || !container || !option) return;
    const bounds = container.getBoundingClientRect();
    const row = option.getBoundingClientRect();
    if (row.top < bounds.top) container.scrollTop -= bounds.top - row.top;
    else if (row.bottom > bounds.bottom) container.scrollTop += row.bottom - bounds.bottom;
  }, [open, selected]);

  function updateMention(element: HTMLTextAreaElement) {
    const next = mentionAtCaret(element.value, element.selectionStart, element.selectionEnd);
    setMention(next);
    if (next?.query !== mention?.query || next?.start !== mention?.start) setActive(0);
  }
  function pick(agent: Agent) {
    if (!mention || disabled || agent.status !== "active") return;
    const next = insertMention(value, mention, agent.handle);
    if (next.text.length > (props.maxLength ?? Infinity)) return;
    onValueChange(next.text);
    setMention(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(next.caret, next.caret);
      setMention(null);
    });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) setMention(null);
      }}
    >
      <PopoverAnchor asChild>
        <div
          className={
            wide
              ? "relative order-first basis-full min-w-0 overflow-hidden px-2 pt-1"
              : "relative order-2 min-w-0 flex-1 overflow-hidden"
          }
        >
          <span
            ref={measure}
            aria-hidden="true"
            className="pointer-events-none invisible absolute max-w-none whitespace-pre text-base leading-6 md:text-[15px]"
          >
            {value}
          </span>
          <Textarea
            {...props}
            ref={inputRef}
            value={value}
            disabled={disabled}
            role={agents.length ? "combobox" : undefined}
            aria-autocomplete={agents.length ? "list" : undefined}
            aria-controls={open ? id : undefined}
            aria-expanded={agents.length ? open : undefined}
            aria-haspopup={agents.length ? "listbox" : undefined}
            aria-activedescendant={
              open && matches[selected] ? `${id}-${matches[selected].agent_id}` : undefined
            }
            className="max-h-48 min-h-10 w-full resize-none rounded-none border-0 bg-transparent px-1 py-2 text-base leading-6 shadow-none focus-visible:ring-0 md:text-[15px]"
            onChange={(event) => {
              onValueChange(event.target.value);
              updateMention(event.target);
            }}
            onClick={(event) => updateMention(event.currentTarget)}
            onKeyUp={(event) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
                updateMention(event.currentTarget);
            }}
            onBlur={() => setMention(null)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (open) {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setMention(null);
                  return;
                }
                if (["ArrowDown", "ArrowUp"].includes(event.key)) {
                  event.preventDefault();
                  if (matches.length)
                    setActive(
                      (selected + (event.key === "ArrowDown" ? 1 : matches.length - 1)) %
                        matches.length,
                    );
                  return;
                }
                if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
                  if (matches[selected]) {
                    event.preventDefault();
                    pick(matches[selected]);
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    return;
                  }
                }
              }
              onKeyDown?.(event);
            }}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={16}
        collisionPadding={12}
        role="presentation"
        className="w-[420px] max-w-[calc(100vw-24px)] gap-0 overflow-hidden rounded-xl p-1 shadow-lg motion-reduce:animate-none"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (event.target === inputRef.current) event.preventDefault();
        }}
      >
        <div className="px-2.5 py-2 text-xs font-medium text-muted-foreground">
          Agent di grup ini
        </div>
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label="Mention agent"
          className="max-h-[min(280px,40dvh)] overflow-y-auto overscroll-contain"
        >
          {matches.map((agent, index) => (
            <div
              key={agent.agent_id}
              id={`${id}-${agent.agent_id}`}
              role="option"
              aria-selected={selected === index}
              tabIndex={-1}
              className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm aria-selected:bg-muted"
              onPointerMove={() => setActive(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => pick(agent)}
              onKeyDown={(event) => {
                if (event.key === "Enter") pick(agent);
              }}
            >
              <AgentAvatar
                name={agent.display_name}
                url={agent.config.avatar_url}
                className="size-7 rounded-lg text-xs"
              />
              <span className="min-w-0 flex-1 truncate font-medium">{agent.display_name}</span>
              <span className="max-w-[45%] truncate text-xs text-muted-foreground">
                @{agent.handle}
              </span>
              {selected === index && (
                <CornerDownLeft
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              )}
            </div>
          ))}
          {!matches.length && (
            <p role="status" className="px-2.5 py-4 text-sm text-muted-foreground">
              Tidak ada agent yang cocok.
            </p>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 border-t px-2.5 py-2 text-xs text-muted-foreground">
          <span>Ketik nama atau handle agent</span>
          <span aria-hidden="true" className="hidden shrink-0 sm:inline">
            ↑↓ pilih · ↵ tag
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
