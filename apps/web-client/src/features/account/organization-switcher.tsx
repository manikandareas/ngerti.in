import { Add01Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAccountAction } from "./account-forms";
import { organizationLogo } from "./organization-branding";
import { OrganizationLogo } from "./organization-logo";
import { useAccount } from "./session";

export function OrganizationSwitcher({ compact = false }: { compact?: boolean }) {
  const account = useAccount();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const action = useAccountAction();
  if (!account?.organization || !account.session) return null;
  const userId = account.session.user.id;
  const canCreate = account.list.created_count < account.list.creation_limit;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`organization-switcher${compact ? " organization-switcher-compact" : ""}`}
          type="button"
          aria-label={`Organization: ${account.organization.name}`}
        >
          <span className="organization-switcher-identity">
            <OrganizationLogo
              name={account.organization.name}
              src={organizationLogo({
                server: account.server,
                user: account.session.user.id,
                organization: account.organization.id,
              })}
            />
            <span>{account.organization.name}</span>
          </span>
          <HugeiconsIcon icon={UnfoldMoreIcon} size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={compact ? "bottom" : "right"}
        align="start"
        sideOffset={8}
        className="organization-menu"
        role="menu"
        aria-label="Organizations"
        onKeyDown={(event) => {
          const items = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)'),
          );
          const activeElement = document.activeElement;
          const current = activeElement instanceof HTMLElement ? items.indexOf(activeElement) : -1;
          const next =
            event.key === "ArrowDown"
              ? (current + 1) % items.length
              : event.key === "ArrowUp"
                ? (current - 1 + items.length) % items.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : null;
          if (next !== null && items[next]) {
            event.preventDefault();
            items[next].focus();
          }
        }}
      >
        <div className="organization-menu-label">Organizations</div>
        {account.list.organizations.map((organization) => (
          <Button
            key={organization.id}
            variant="ghost"
            className="organization-menu-item"
            role="menuitemradio"
            disabled={action.busy}
            aria-checked={organization.id === account.organization?.id}
            onClick={() => {
              setOpen(false);
              void action.run(() => account.select(organization.id));
            }}
          >
            <OrganizationLogo
              name={organization.name}
              src={organizationLogo({
                server: account.server,
                user: userId,
                organization: organization.id,
              })}
            />
            <span className="organization-menu-name">{organization.name}</span>
          </Button>
        ))}
        <div className="organization-menu-separator" />
        <Button
          role="menuitem"
          variant="ghost"
          className="organization-menu-item organization-menu-create"
          disabled={!canCreate || action.busy}
          onClick={() => {
            setOpen(false);
            void navigate({ to: "/onboarding", search: { create: true } });
          }}
        >
          <span className="organization-menu-add">
            <HugeiconsIcon icon={Add01Icon} size={16} aria-hidden="true" />
          </span>
          <span className="organization-menu-name">Add organization</span>
        </Button>
      </PopoverContent>
    </Popover>
  );
}
