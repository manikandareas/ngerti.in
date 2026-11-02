import { Search } from "lucide-react";

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
    <div className="settings-search">
      <Search size={15} aria-hidden="true" />
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !value) return;
          event.preventDefault();
          event.stopPropagation();
          onChange("");
        }}
      />
    </div>
  );
}
