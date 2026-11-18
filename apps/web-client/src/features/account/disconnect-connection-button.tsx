import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { SettingsError } from "@/features/settings/components/settings-ui";
import { useSettingsAction } from "@/features/settings/hooks/use-settings-action";
import { durableCommand } from "@/lib/api-client";
import { harnesses, modelProviderName } from "@/lib/harnesses";
import type { Connection } from "@/types/workspace";

export function DisconnectConnectionButton({
  connection,
  refresh,
  disabled,
}: {
  connection: Connection;
  refresh: () => Promise<unknown>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = useSettingsAction();
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!action.busy) {
          action.clearError();
          setOpen(next);
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled || action.busy}>
          Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect {harnesses[connection.harness].name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the{" "}
            {modelProviderName(connection.provider_id ?? harnesses[connection.harness].providerId)}{" "}
            connection. Agents using it will need another connection to continue. Conversations and
            history are kept.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <SettingsError message={action.error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={action.busy}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await durableCommand(
                  `disconnect:${connection.id}`,
                  `/v1/connections/${connection.id}/revoke`,
                  {},
                );
                await refresh();
                setOpen(false);
              }, "Connection disconnected.")
            }
          >
            {action.busy ? "Disconnecting…" : "Disconnect"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
