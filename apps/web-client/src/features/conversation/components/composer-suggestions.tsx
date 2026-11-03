import { PuzzleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { LexicalTypeaheadMenuPlugin, MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  HISTORY_PUSH_TAG,
} from "lexical";
import {
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type InlineReference,
  referenceTarget,
} from "@/features/conversation/lib/inline-references";
import { AgentAvatar } from "./identity";
import { useInlineReferences } from "./inline-references";
import { ReferenceNode } from "./reference-node";

class ReferenceOption extends MenuOption {
  reference: InlineReference;
  description: string;
  icon: ReactElement;
  constructor(reference: InlineReference, description: string, icon: ReactElement) {
    super(
      `${reference.kind}:${reference.kind === "skill" ? `${reference.agentId}:${reference.source}:` : ""}${reference.id}`,
    );
    this.reference = reference;
    this.description = description;
    this.icon = icon;
  }
}

function SuggestionPanel({
  children,
  id,
  panelRef,
}: {
  children: ReactNode;
  id: string;
  panelRef: Ref<HTMLDivElement>;
}) {
  const [editor] = useLexicalComposerContext();
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    const form = editor.getRootElement()?.closest("form");
    if (!form) return;
    const position = () => {
      const rect = form.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      setStyle({
        left: Math.max(12, rect.left),
        bottom: window.innerHeight - rect.top + 8,
        width: Math.min(rect.width, (viewport?.width ?? window.innerWidth) - 24),
        maxHeight: Math.max(100, Math.min(320, rect.top - top - 16)),
      });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(form);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    window.visualViewport?.addEventListener("scroll", position);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
      window.visualViewport?.removeEventListener("scroll", position);
    };
  }, [editor]);
  return (
    // biome-ignore lint/a11y/useSemanticElements: This ARIA-owned group contains listbox options, not form controls.
    <div id={id} role="group" ref={panelRef} className="composer-suggestions" style={style}>
      {children}
    </div>
  );
}

export function ComposerSuggestions({ value, readOnly }: { value: string; readOnly: boolean }) {
  const [editor] = useLexicalComposerContext();
  const { agents, skills, group, loading, error, refresh } = useInlineReferences();
  const [query, setQuery] = useState<string | null>(null);
  const panelId = useId();
  const mode = query?.[0];
  const search = query?.slice(1).toLocaleLowerCase() ?? "";
  const target =
    referenceTarget(value) ??
    agents.find((agent) => value.trimStart().startsWith(`@${agent.handle} `))?.id;
  const options = useMemo(() => {
    if (!mode) return [];
    if (mode === "@")
      return agents
        .filter(
          (agent) =>
            agent.handle && `${agent.name} ${agent.handle}`.toLocaleLowerCase().includes(search),
        )
        .map(
          (agent) =>
            new ReferenceOption(
              { kind: "agent", id: agent.id, label: `@${agent.name}` },
              "Agent di percakapan ini",
              <AgentAvatar
                agent={agent}
                animated={false}
                showActivityLabel={false}
                className="size-6"
              />,
            ),
        );
    return skills
      .filter(
        (skill) =>
          (!target || skill.agent.id === target) &&
          `${skill.reference.label} ${skill.description} ${skill.agent.name}`
            .toLocaleLowerCase()
            .includes(search),
      )
      .map(
        (skill) =>
          new ReferenceOption(
            skill.reference,
            [
              skill.description || "Skill",
              skill.reference.source === "application" ? "Aplikasi" : "Harness",
              group ? skill.agent.name : "",
            ]
              .filter(Boolean)
              .join(" · "),
            <HugeiconsIcon
              icon={PuzzleIcon}
              size={17}
              strokeWidth={1.5}
              className="text-(--identity-purple)"
              aria-hidden="true"
            />,
          ),
      );
  }, [agents, skills, mode, search, target, group]);
  const menu = useRef<HTMLDivElement | null>(null);
  const trigger = useCallback(
    (text: string) => {
      if (!editor.isEditable() || editor.isComposing()) return null;
      const match = /(?:^|\s|\()([@/][\w-]*)$/.exec(text);
      if (!match || (match[1][0] === "@" && !group)) return null;
      return {
        leadOffset: text.length - match[1].length,
        matchingString: match[1],
        replaceableString: match[1],
      };
    },
    [editor, group],
  );
  const setOpen = useCallback(
    (open: boolean) => {
      const root = editor.getRootElement();
      if (!root) return;
      root.setAttribute("aria-expanded", String(open));
      root.dataset.suggestionsOpen = String(open);
    },
    [editor],
  );
  useEffect(() => () => setOpen(false), [setOpen]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        !(event.target instanceof Node) ||
        menu.current?.contains(event.target) ||
        editor.getRootElement()?.closest("form")?.contains(event.target)
      )
        return;
      editor.getRootElement()?.blur();
      setQuery(null);
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [editor, setOpen]);
  if (readOnly) return null;
  return (
    <LexicalTypeaheadMenuPlugin<ReferenceOption>
      commandPriority={COMMAND_PRIORITY_CRITICAL}
      anchorClassName="composer-typeahead-anchor"
      onQueryChange={setQuery}
      onOpen={() => setOpen(true)}
      onClose={() => {
        setOpen(false);
        setQuery(null);
      }}
      options={options}
      triggerFn={trigger}
      onSelectOption={(option, node, close) => {
        if (editor.isComposing()) return;
        editor.update(
          () => {
            const reference = new ReferenceNode(option.reference);
            if (node) node.replace(reference);
            else {
              const selection = $getSelection();
              if ($isRangeSelection(selection)) selection.insertNodes([reference]);
            }
            const space = $createTextNode(" ");
            reference.insertAfter(space);
            space.select(1, 1);
          },
          { tag: HISTORY_PUSH_TAG },
        );
        close();
      }}
      menuRenderFn={(anchor, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) => {
        if (!anchor.current || !query) return null;
        // Lexical reattaches its caret anchor for every query. Keep the visible portal
        // under body so filtering never detaches the panel or restarts its animation.
        // aria-owns preserves the anchor listbox's relationship with these options.
        anchor.current.setAttribute("aria-owns", panelId);
        return createPortal(
          <SuggestionPanel id={panelId} panelRef={menu}>
            <div className="composer-suggestion-list">
              {options.map((option, index) => (
                <div
                  key={option.key}
                  ref={option.setRefElement}
                  id={`typeahead-item-${index}`}
                  role="option"
                  aria-selected={selectedIndex === index}
                  className="composer-suggestion"
                  onPointerMove={() => setHighlightedIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOptionAndCleanUp(option)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") selectOptionAndCleanUp(option);
                  }}
                  tabIndex={-1}
                >
                  <span className="composer-suggestion-icon">{option.icon}</span>
                  <span className="composer-suggestion-name">
                    {option.reference.kind === "agent"
                      ? agents.find((agent) => agent.id === option.reference.id)?.name
                      : option.reference.label}
                  </span>
                  <span className="composer-suggestion-description">{option.description}</span>
                </div>
              ))}
              {!options.length && (
                <p role="status" className="composer-suggestion-empty">
                  {mode === "/" && loading
                    ? "Memuat skills…"
                    : search
                      ? `Tidak ada hasil untuk “${query?.slice(1)}”.`
                      : mode === "@"
                        ? "Belum ada agent yang dapat disebut."
                        : "Belum ada skill aktif untuk percakapan ini."}
                </p>
              )}
              {mode === "/" && error && (
                <p role="status" className="composer-suggestion-empty">
                  {error}{" "}
                  <button
                    type="button"
                    className="text-link underline underline-offset-2"
                    onClick={refresh}
                  >
                    Coba lagi
                  </button>
                </p>
              )}
            </div>
            <div className="composer-suggestion-footer">
              <span>
                {mode === "@" ? "Ketik untuk mencari anggota grup" : "Ketik untuk mencari skills"}
              </span>
              <span aria-hidden="true">
                ↑↓ <span className="mx-1">pilih</span> ↵
              </span>
            </div>
          </SuggestionPanel>,
          document.body,
          "composer-reference-suggestions",
        );
      }}
    />
  );
}
