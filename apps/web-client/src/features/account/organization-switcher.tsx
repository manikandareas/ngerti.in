import { Add01Icon, ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { useAccountAction } from "./account-forms";
import { useAccount } from "./session";

export function OrganizationSwitcher() {
  const account = useAccount();
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const action = useAccountAction();
  if (!account?.organization) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="organization-switcher"
          type="button"
          aria-label={`Organization: ${account.organization.name}`}
        >
          <span>{account.organization.name}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={14} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="organization-menu w-64 gap-1 p-1.5">
        {account.list.organizations.map((organization) => (
          <Button
            key={organization.id}
            variant="ghost"
            className="w-full justify-between"
            disabled={action.busy}
            aria-pressed={organization.id === account.organization?.id}
            onClick={() => {
              setOpen(false);
              void action.run(() => account.select(organization.id));
            }}
          >
            <span className="truncate">{organization.name}</span>
            {organization.id === account.organization?.id && (
              <HugeiconsIcon icon={Tick02Icon} size={14} aria-hidden="true" />
            )}
          </Button>
        ))}
        {account.list.created_count < account.list.creation_limit && (
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground"
            onClick={() => {
              setOpen(false);
              void settings.open("organization");
            }}
          >
            <HugeiconsIcon icon={Add01Icon} size={14} aria-hidden="true" />
            New organization
          </Button>
        )}
        <div className="my-1 border-t border-border" />
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setOpen(false);
            void settings.open("account");
          }}
        >
          {account.session?.user.name ?? "Account"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
