import { ArrowLeft01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function SettingsSearch({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="settings-search-field">
      <HugeiconsIcon icon={Search01Icon} size={16} aria-hidden="true" />
      <Input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="search"
      />
    </div>
  );
}
export function SettingsEmpty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="settings-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function SettingsError({ message, retry }: { message: string; retry?: () => void }) {
  if (!message) return null;
  return (
    <div role="alert" className="settings-error">
      <p>{message}</p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function SettingsDialog({
  title,
  description,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function SettingsBackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="settings-back"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <HugeiconsIcon icon={ArrowLeft01Icon} size={18} aria-hidden="true" />
    </Button>
  );
}
export function SettingsTabs<Id extends string>({
  value,
  items,
  onChange,
}: {
  value: string;
  items: { id: Id; label: string; count?: number }[];
  onChange: (id: Id) => void;
}) {
  return (
    <nav aria-label="Page sections" className="settings-tabs">
      {items.map((item) => (
        <button
          type="button"
          key={item.id}
          aria-current={value === item.id ? "page" : undefined}
          onClick={() => onChange(item.id)}
        >
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
        </button>
      ))}
    </nav>
  );
}
export function MemberIdentity({
  name,
  email,
  you,
}: {
  name: string;
  email?: string;
  you?: boolean;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className="settings-identity">
      <span className="settings-person-avatar" aria-hidden="true">
        {initials}
      </span>
      <div>
        <span>
          {name}
          {you && <span className="settings-you">you</span>}
        </span>
        {email && <p>{email}</p>}
      </div>
    </div>
  );
}
export function RoleLabel({ role }: { role: string }) {
  return <span className="settings-badge">{role.charAt(0).toUpperCase() + role.slice(1)}</span>;
}
export function matchesSearch(query: string, ...values: (string | null | undefined)[]) {
  const text = values.filter(Boolean).join(" ").toLocaleLowerCase();
  return query
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .every((part) => text.includes(part));
}
