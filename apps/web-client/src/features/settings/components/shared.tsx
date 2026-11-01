import { ChatGptIcon, MetaIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Children, Fragment, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import type { Connection } from "@/types/workspace";

export const providers = [
  {
    id: "codex",
    name: "ChatGPT",
    runtime: "Codex",
    description: "Gunakan akun ChatGPT atau OpenAI API key.",
  },
  {
    id: "muse",
    name: "Muse Code",
    runtime: "Muse Code",
    description: "Gunakan akun Muse atau Meta API key.",
  },
] as const;
export type ProviderId = (typeof providers)[number]["id"];
export function ProviderMark({ id }: { id: ProviderId }) {
  return (
    <span
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground [[data-slot=select-item]_&]:size-4 [[data-slot=select-item]_&]:border-0 [[data-slot=select-trigger]_&]:size-4 [[data-slot=select-trigger]_&]:border-0 [&_svg]:size-4"
      aria-hidden="true"
    >
      <HugeiconsIcon icon={id === "codex" ? ChatGptIcon : MetaIcon} size={24} strokeWidth={1.8} />
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
    <section className="settings-section mt-6 space-y-3">
      <div className="settings-section-heading flex flex-wrap items-center justify-between gap-3 [&>h3]:text-sm [&>h3]:font-medium [&>div]:w-full [&>div]:sm:w-56">
        <h3>{title}</h3>
        {action}
      </div>
      <ItemGroup className="settings-group gap-0 overflow-hidden rounded-xl border bg-card text-card-foreground">
        {Children.toArray(children).map((child, index) => (
          <Fragment key={child && typeof child === "object" && "key" in child ? child.key : index}>
            {index > 0 && <ItemSeparator className="settings-divider my-0" role="presentation" />}
            {child}
          </Fragment>
        ))}
      </ItemGroup>
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
  return (
    <Item role="listitem" className="settings-row min-h-20 gap-4 rounded-none border-0 p-4">
      <ItemContent className="settings-row-copy min-w-0 basis-48">
        <ItemTitle className="line-clamp-none break-words">{title}</ItemTitle>
        {description && (
          <ItemDescription className="line-clamp-none break-words">{description}</ItemDescription>
        )}
      </ItemContent>
      {children && (
        <ItemActions className="settings-row-control max-w-full flex-wrap gap-2 sm:ml-auto">
          {children}
        </ItemActions>
      )}
    </Item>
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
  return value === "api_key"
    ? "API key"
    : value === "subscription"
      ? "Subscription"
      : "Belum diketahui";
}
