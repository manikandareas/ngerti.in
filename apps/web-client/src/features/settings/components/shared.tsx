import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { ProviderBrandMark } from "@/features/settings/components/provider-mark";
import { type HarnessId, harnesses, harnessIds } from "@/lib/harnesses";
import type { Connection } from "@/types/workspace";

export const providers = harnessIds.map((id) => ({
  id,
  name: harnesses[id].accountName,
  runtime: harnesses[id].name,
  description: harnesses[id].nativeLogin
    ? "Gunakan akun atau API key yang dipilih."
    : "Gunakan API key dari provider yang dipilih.",
}));
export type ProviderId = HarnessId;
export function ProviderMark({ id }: { id: ProviderId }) {
  return (
    <span
      className="provider-mark inline-flex size-4 shrink-0 items-center justify-center text-foreground"
      data-provider={id}
      aria-hidden="true"
    >
      <ProviderBrandMark provider={id} />
    </span>
  );
}
export function SettingsSection({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      <div className="settings-group">{children}</div>
    </section>
  );
}
export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <Item role="group" aria-labelledby={titleId} className="settings-row">
      <ItemContent className="settings-row-copy">
        <ItemTitle id={titleId} className="line-clamp-none break-words">
          {title}
        </ItemTitle>
        {description && (
          <ItemDescription className="line-clamp-none break-words">{description}</ItemDescription>
        )}
      </ItemContent>
      {children && <ItemActions className="settings-row-control">{children}</ItemActions>}
    </Item>
  );
}
export function SettingsDisclosure({
  title,
  subtitle,
  trailing,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const region = useId();
  return (
    <section className="settings-disclosure">
      <div className="settings-group">
        <button
          type="button"
          className="settings-disclosure-trigger"
          aria-expanded={open}
          aria-controls={region}
          onClick={onToggle}
        >
          <span className="settings-disclosure-copy">
            <span>{title}</span>
            {subtitle && <span>{subtitle}</span>}
          </span>
          <span className="settings-disclosure-trailing">
            {trailing}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              aria-hidden="true"
              className={`settings-disclosure-chevron ${open ? "rotate-90" : ""}`}
            />
          </span>
        </button>
      </div>
      <div id={region} className="settings-disclosure-content" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
export function connectionLabel(connection: Connection) {
  if (connection.state === "revoked") return "Diputus";
  if (connection.login === "rejected") return "Login ditolak";
  if (connection.login !== "authenticated") return "Belum terverifikasi";
  if (connection.effective_billing_source !== connection.authentication.billing_source)
    return "Periksa sumber biaya";
  return "Terhubung";
}
export function ConnectionBadge({ connection }: { connection: Connection }) {
  const label = connectionLabel(connection);
  return (
    <Badge
      variant="outline"
      className={
        label === "Terhubung" ? "provider-connected [color:var(--success-foreground)]" : ""
      }
    >
      <span className="provider-state-dot w-1.5 h-1.5 [border-radius:50%] [background:currentColor]" />
      {label}
    </Badge>
  );
}
export function billingLabel(value: string) {
  return value === "free"
    ? "Free"
    : value === "api_key"
      ? "API key"
      : value === "subscription"
        ? "Subscription"
        : "Belum diketahui";
}
