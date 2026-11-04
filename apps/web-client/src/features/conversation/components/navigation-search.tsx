import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactElement, useState } from "react";

import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

interface NavigationSearchProps {
  value: string;
  onValueChange: (value: string) => void;
}

function focusSearchInput(input: HTMLInputElement | null): void {
  input?.focus();
}

export function NavigationSearch({ value, onValueChange }: NavigationSearchProps): ReactElement {
  const [focused, setFocused] = useState(false);
  const expanded = focused || value.length > 0;

  return (
    <div
      className={cn(
        "navigation-search min-w-0 basis-10 transition-[flex-grow] duration-200 ease-out motion-reduce:transition-none md:basis-8",
        expanded ? "grow" : "grow-0",
      )}
    >
      {expanded ? (
        <InputGroup className="h-10! md:h-8!">
          <InputGroupInput
            ref={focusSearchInput}
            type="search"
            aria-label="Search conversations"
            placeholder="Who’s on your mind?"
            autoComplete="off"
            className="h-full md:text-[13px]"
            value={value}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(event) => onValueChange(event.target.value)}
          />
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} size={16} strokeWidth={1.5} aria-hidden="true" />
          </InputGroupAddon>
        </InputGroup>
      ) : (
        <Button
          size="icon"
          variant="secondary"
          className="navigation-search-trigger size-8 rounded-lg text-muted-foreground"
          aria-label="Search conversations"
          onFocus={() => setFocused(true)}
          onClick={() => setFocused(true)}
        >
          <HugeiconsIcon icon={Search01Icon} size={17} strokeWidth={1.5} />
        </Button>
      )}
    </div>
  );
}
