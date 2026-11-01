import { Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

export function SettingsSearch({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <InputGroup className="settings-search w-full bg-background">
      <InputGroupAddon>
        <HugeiconsIcon icon={Search01Icon} strokeWidth={1.5} />
      </InputGroupAddon>
      <InputGroupInput
        className="h-full min-w-0 bg-transparent dark:bg-transparent"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  );
}
