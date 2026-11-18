"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  CapabilityChips,
  EffortMeter,
  THINKING_LABEL,
  ThinkingTrack,
} from "./model-picker-controls";
import { ProviderGlyph } from "./model-picker-icons";
import type { ModelPickerProps, ModelPickerProvider, ThinkingEffort } from "./model-picker-types";

export { defaultModelProviders } from "./model-picker-data";
export { ClaudeIcon, GeminiIcon, GrokIcon, type IconProps, OpenAIIcon } from "./model-picker-icons";
export type {
  ModelCapability,
  ModelPickerModel,
  ModelPickerProps,
  ModelPickerProvider,
  ThinkingEffort,
} from "./model-picker-types";

function findModel(providers: readonly ModelPickerProvider[], id?: string | null) {
  if (!id) return;
  for (const provider of providers) {
    const model = provider.models.find((item) => item.id === id && item.available !== false);
    if (model) return { provider, model };
  }
}

export function ModelPicker({
  providers,
  activeProvider: providerId,
  onProviderChange,
  showEmptyProviders = false,
  value,
  defaultValue,
  onValueChange,
  thinking,
  defaultThinking,
  open,
  defaultOpen = false,
  onOpenChange,
  side = "top",
  align = "start",
  placeholder = "Select a model",
  className,
  inline = false,
  hideTrigger = false,
  disabled = false,
  ariaLabel,
  dropdownIcon,
  railFooter,
  footer,
  emptyProvider,
}: ModelPickerProps) {
  const id = useId();
  const listId = `${id}-models`;
  const panelId = `${id}-panel`;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedId = value !== undefined ? value : internalValue;
  const selected = findModel(providers, selectedId);
  const isOpen = open ?? internalOpen;
  const rails = useMemo(
    () =>
      providers.filter(
        (provider) =>
          showEmptyProviders ||
          provider.id === providerId ||
          provider.models.some((model) => model.available !== false),
      ),
    [providers, providerId, showEmptyProviders],
  );
  const [activeProviderId, setActiveProviderId] = useState(
    () => selected?.provider.id ?? rails[0]?.id ?? "",
  );
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const searching = search.length > 0;
  const activeProvider =
    rails.find((provider) => provider.id === (providerId ?? activeProviderId)) ?? rails[0];
  const rows = useMemo(() => {
    const owners = searching ? rails : activeProvider ? [activeProvider] : [];
    return owners.flatMap((provider) =>
      provider.models
        .filter(
          (model) =>
            model.available !== false &&
            (!searching ||
              [model.name, model.id, model.description ?? "", provider.name].some((field) =>
                field.toLowerCase().includes(search),
              )),
        )
        .map((model) => ({ provider, model })),
    );
  }, [activeProvider, rails, search, searching]);

  const [internalThinking, setInternalThinking] = useState({
    modelId: selectedId,
    effort: defaultThinking as ThinkingEffort | null | undefined,
  });
  const levels = selected?.model.thinking;
  const requestedThinking =
    thinking !== undefined
      ? thinking
      : internalThinking.modelId === selectedId
        ? internalThinking.effort
        : undefined;
  const selectedThinking =
    requestedThinking === null
      ? undefined
      : levels?.length
        ? requestedThinking && levels.includes(requestedThinking)
          ? requestedThinking
          : selected?.model.defaultThinking && levels.includes(selected.model.defaultThinking)
            ? selected.model.defaultThinking
            : levels[0]
        : undefined;
  const activeModelIndex = Math.max(
    0,
    rows.findIndex((row) => row.model.id === selectedId),
  );
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);
  const providerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const modelRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedProviderId = selected?.provider.id;

  useEffect(() => {
    if (!isOpen || searching) return;
    const index = rails.findIndex((provider) => provider.id === selectedProviderId);
    if (index < 0) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const button = providerRefs.current[index];
        const rail = railRef.current;
        if (!button || !rail || rail.scrollHeight <= rail.clientHeight) return;
        rail.scrollTop = Math.max(
          0,
          button.offsetTop - (rail.clientHeight - button.offsetHeight) / 2,
        );
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [isOpen, rails, searching, selectedProviderId]);

  const changeOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
      setQuery("");
      if (next) {
        const owner = findModel(providers, selectedId)?.provider.id;
        if (owner) setActiveProviderId(owner);
      }
    },
    [onOpenChange, providers, selectedId],
  );

  function selectModel(modelId: string, providerId: string) {
    const model = findModel(providers, modelId)?.model;
    if (!model) return;
    if (disabled) return;
    const effort =
      thinking !== undefined
        ? thinking && model.thinking?.includes(thinking)
          ? thinking
          : null
        : (model.defaultThinking ?? model.thinking?.[0]);
    setInternalValue(modelId);
    setInternalThinking({ modelId, effort });
    setActiveProviderId(providerId);
    onProviderChange?.(providerId);
    onValueChange?.(modelId, providerId, effort);
  }

  function selectThinking(effort: ThinkingEffort) {
    if (disabled || !selected || !levels?.includes(effort)) return;
    setInternalThinking({ modelId: selected.model.id, effort });
    onValueChange?.(selected.model.id, selected.provider.id, effort);
  }

  function focusProvider(index: number) {
    if (rails.length) providerRefs.current[(index + rails.length) % rails.length]?.focus();
  }
  function focusModel(index: number) {
    if (rows.length) modelRefs.current[(index + rows.length) % rows.length]?.focus();
  }
  function closeInline(event: KeyboardEvent<HTMLElement>) {
    if (inline && event.key === "Escape") {
      event.preventDefault();
      changeOpen(false);
      triggerRef.current?.focus();
    }
  }
  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusModel(0);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (rows[0]) selectModel(rows[0].model.id, rows[0].provider.id);
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    } else closeInline(event);
  }
  function onRailKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusProvider(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusProvider(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusProvider(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusProvider(rails.length - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusModel(0);
    } else closeInline(event);
  }
  function onListKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusModel(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusModel(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusModel(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusModel(rows.length - 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusProvider(rails.findIndex((provider) => provider.id === activeProvider?.id));
    } else closeInline(event);
  }

  const triggerLabel = selected?.model.name ?? placeholder;
  const trigger = (
    <button
      ref={triggerRef}
      type="button"
      aria-label={ariaLabel ?? triggerLabel}
      disabled={disabled}
      aria-expanded={isOpen}
      aria-controls={panelId}
      onClick={inline ? () => changeOpen(!isOpen) : undefined}
      className={cn(
        "inline-flex h-11 max-w-full touch-manipulation items-center gap-3 rounded-full bg-muted/80 px-5 text-base font-medium tracking-tight text-foreground ring-1 ring-border/80 ring-inset transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        className,
      )}
    >
      {selected && <ProviderGlyph provider={selected.provider} className="size-5" />}
      <span className="min-w-0 truncate" translate="no">
        {triggerLabel}
      </span>
      {levels?.length && selectedThinking && selectedThinking !== "none" ? (
        <span className="ml-1 inline-flex shrink-0 items-center">
          <EffortMeter levels={levels} value={selectedThinking} />
          <span className="sr-only">
            {THINKING_LABEL[selectedThinking] ?? selectedThinking} thinking
          </span>
        </span>
      ) : null}
      {dropdownIcon ?? (
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none",
            isOpen && "rotate-180",
          )}
        />
      )}
    </button>
  );

  const panel = (
    <div className="@container/modelpicker flex min-w-0 flex-col bg-popover">
      {!rails.length || !activeProvider ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">No models available</p>
      ) : (
        <div className="flex min-h-72 min-w-0 bg-muted">
          <div className="relative w-14 shrink-0 bg-muted @min-[380px]/modelpicker:w-16">
            <div className="absolute inset-0 flex flex-col">
              <div
                role="tablist"
                aria-label="Harnesses"
                aria-orientation="vertical"
                ref={railRef}
                className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {rails.map((provider, index) => (
                  <Tooltip key={provider.id}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        role="tab"
                        id={`${id}-tab-${provider.id}`}
                        aria-label={provider.name}
                        aria-selected={provider.id === activeProvider.id}
                        aria-controls={`${id}-provider-panel`}
                        tabIndex={provider.id === activeProvider.id ? 0 : -1}
                        ref={(node) => {
                          providerRefs.current[index] = node;
                        }}
                        onClick={() => {
                          setQuery("");
                          setActiveProviderId(provider.id);
                          onProviderChange?.(provider.id);
                        }}
                        onKeyDown={(event) => onRailKeyDown(event, index)}
                        className={cn(
                          "inline-flex size-10 shrink-0 touch-manipulation items-center justify-center rounded-2xl text-muted-foreground transition-colors duration-150 hover:bg-popover/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none @min-[380px]/modelpicker:size-12",
                          provider.id === activeProvider.id &&
                            !searching &&
                            "bg-popover text-foreground",
                        )}
                      >
                        <ProviderGlyph provider={provider} className="size-5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" translate="no">
                      {provider.name}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
              {railFooter && <div className="shrink-0 px-2 pt-1 pb-2">{railFooter}</div>}
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-12 shrink-0 items-center gap-2.5 bg-muted px-3.5">
              <Search aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search models"
                aria-label="Search models"
                aria-controls={listId}
                autoComplete="off"
                spellCheck={false}
                className="h-full w-full min-w-0 bg-transparent text-base tracking-tight text-foreground caret-foreground outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-popover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring touch:size-9"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              )}
            </div>
            <div
              role="tabpanel"
              id={`${id}-provider-panel`}
              aria-labelledby={`${id}-tab-${activeProvider.id}`}
              className="flex min-w-0 flex-1 flex-col rounded-tl-2xl bg-popover p-2"
            >
              <p
                className="px-3 pt-1.5 pb-2 text-[13px] text-muted-foreground"
                translate="no"
                aria-live="polite"
              >
                {searching
                  ? `${rows.length} ${rows.length === 1 ? "result" : "results"}`
                  : activeProvider.name}
              </p>
              <div
                role="listbox"
                id={listId}
                aria-label={searching ? "Search results" : `${activeProvider.name} models`}
                className="flex max-h-[min(18rem,42dvh)] min-w-0 flex-col gap-0.5 overflow-y-auto overscroll-contain [scrollbar-color:var(--border)_transparent] [scrollbar-width:thin]"
              >
                {!rows.length && (
                  <p className="px-2.5 py-6 text-center text-xs text-muted-foreground">
                    {searching
                      ? `No models match "${query.trim()}"`
                      : (emptyProvider?.(activeProvider.id) ?? "No models available")}
                  </p>
                )}
                {rows.map(({ provider, model }, index) => (
                  <button
                    key={`${provider.id}:${model.id}`}
                    type="button"
                    role="option"
                    aria-selected={model.id === selectedId}
                    tabIndex={index === activeModelIndex ? 0 : -1}
                    ref={(node) => {
                      modelRefs.current[index] = node;
                    }}
                    onClick={() => selectModel(model.id, provider.id)}
                    onKeyDown={(event) => onListKeyDown(event, index)}
                    className={cn(
                      "flex min-h-16 w-full min-w-0 touch-manipulation items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset motion-reduce:transition-none",
                      model.id === selectedId && "bg-muted",
                    )}
                  >
                    {searching && <ProviderGlyph provider={provider} className="size-4" />}
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="min-w-0 truncate text-base font-semibold tracking-tight"
                          translate="no"
                        >
                          {model.name}
                        </span>
                        {model.id === selectedId && (
                          <Check aria-hidden="true" className="size-4 shrink-0" />
                        )}
                      </span>
                      {model.description && (
                        <span className="truncate text-[13px] leading-snug text-muted-foreground">
                          {model.description}
                        </span>
                      )}
                    </span>
                    <CapabilityChips capabilities={model.capabilities} />
                  </button>
                ))}
              </div>
            </div>
            {!!levels?.length && (
              <div className="flex flex-col gap-2 bg-popover px-3 pt-3 pb-2.5 @min-[440px]/modelpicker:flex-row @min-[440px]/modelpicker:items-center @min-[440px]/modelpicker:gap-3">
                <span className="flex shrink-0 items-center gap-2 px-1">
                  <EffortMeter levels={levels} value={selectedThinking} />
                  <span className="text-[13px] text-muted-foreground">Thinking</span>
                </span>
                <ThinkingTrack levels={levels} value={selectedThinking} onChange={selectThinking} />
              </div>
            )}
          </div>
        </div>
      )}
      {footer}
    </div>
  );

  return (
    <TooltipProvider delayDuration={250}>
      {inline ? (
        <div className="flex w-full min-w-0 flex-col items-center gap-4">
          {!hideTrigger && trigger}
          {isOpen && (
            <div
              id={panelId}
              className="w-full overflow-hidden rounded-2xl bg-popover text-popover-foreground ring-1 ring-border/80"
            >
              <fieldset disabled={disabled} className="contents">
                {panel}
              </fieldset>
            </div>
          )}
        </div>
      ) : (
        <Popover open={isOpen} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            id={panelId}
            data-model-picker-content
            side={side}
            align={align}
            sideOffset={10}
            collisionPadding={12}
            className="max-h-[var(--radix-popover-content-available-height)] w-[min(30rem,calc(100vw-1.5rem))] gap-0 overflow-y-auto overscroll-contain rounded-2xl p-0 shadow-none"
            onEscapeKeyDown={(event) => {
              if (!query) return;
              event.preventDefault();
              setQuery("");
              searchRef.current?.focus();
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => searchRef.current?.focus());
            }}
          >
            <fieldset disabled={disabled} className="contents">
              {panel}
            </fieldset>
          </PopoverContent>
        </Popover>
      )}
    </TooltipProvider>
  );
}
