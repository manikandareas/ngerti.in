import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { billingLabel, ConnectionBadge } from "@/features/settings/components/shared";
import { observedStates } from "@/features/settings/utils/provider-state";
import type { Connection } from "@/types/workspace";

export function ProviderStatus({ connection }: { connection: Connection }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="provider-status-trigger h-auto rounded-full p-0"
          aria-label="Status & kemampuan"
        >
          <ConnectionBadge connection={connection} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-32px))] p-4">
        <PopoverHeader>
          <PopoverTitle>
            <span className="flex items-center gap-2">
              <HugeiconsIcon icon={InformationCircleIcon} size={16} />
              Status & kemampuan
            </span>
          </PopoverTitle>
        </PopoverHeader>
        <dl className="provider-status-list grid gap-3 text-sm [&>div]:grid [&>div]:grid-cols-2 [&>div]:gap-4 [&_dt]:text-muted-foreground [&_dd]:text-right [&_dd]:break-words">
          <div>
            <dt>Login</dt>
            <dd>{observedStates[connection.login] ?? connection.login}</dd>
          </div>
          <div>
            <dt>Biaya dipilih</dt>
            <dd>{billingLabel(connection.authentication.billing_source)}</dd>
          </div>
          <div>
            <dt>Biaya terverifikasi</dt>
            <dd>{billingLabel(connection.effective_billing_source)}</dd>
          </div>
          <div>
            <dt>Penemuan model</dt>
            <dd>
              {observedStates[connection.discovery] ?? connection.discovery}
              {connection.models.length > 0 && ` · ${connection.models.length} model`}
            </dd>
          </div>
          <div>
            <dt>Inference</dt>
            <dd>{observedStates[connection.inference] ?? connection.inference}</dd>
          </div>
        </dl>
        <Separator />
        <dl className="provider-status-list grid gap-3 text-sm [&>div]:grid [&>div]:grid-cols-2 [&>div]:gap-4 [&_dt]:text-muted-foreground [&_dd]:text-right [&_dd]:break-words">
          {Object.entries(connection.capabilities).map(([name, state]) => (
            <div key={name}>
              <dt>{name.replaceAll("_", " ")}</dt>
              <dd>
                {state === "supported"
                  ? "Didukung"
                  : state === "unsupported"
                    ? "Tidak didukung"
                    : "Belum diketahui"}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
