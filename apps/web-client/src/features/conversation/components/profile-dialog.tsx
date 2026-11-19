import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAccountAction } from "@/features/account/account-forms";
import { request } from "@/lib/api-client";
import type { Thread } from "@/types/workspace";

export type ProfileOperation =
  | { kind: "import" }
  | { kind: "clone"; threadId: string; name: string };

export function ProfileDialog({
  operation,
  close,
  opened,
}: {
  operation: ProfileOperation;
  close: () => void;
  opened: (id: string) => void;
}) {
  const [name, setName] = useState(
    operation.kind === "clone" ? `${operation.name.slice(0, 195)} Copy` : "",
  );
  const [file, setFile] = useState<File | null>(null);
  const key = useRef(crypto.randomUUID());
  const field = useId();
  const action = useAccountAction();
  const clone = operation.kind === "clone";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !action.busy) close();
      }}
    >
      <DialogContent>
        <DialogTitle>{clone ? "Clone agent profile" : "Import agent profile"}</DialogTitle>
        <DialogDescription>
          {clone
            ? "Copy this agent’s persona and assigned skills into a new chat. Choose a connection for the new agent. Scheduled work stays with the source agent."
            : "Choose a Ngertiin profile or backup JSON file. Any Routines in a backup start paused and need a connection in this workspace."}
        </DialogDescription>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void action.run(async () => {
              if (file && file.size > 950_000) throw new Error("This profile file is too large.");
              const body = clone ? { name } : file ? JSON.parse(await file.text()) : null;
              if (!body) return;
              const result = await request<{ thread: Thread }>(
                clone ? `/v1/threads/${operation.threadId}/clone-profile` : "/v1/profiles/import",
                body,
                key.current,
              );
              toast.success(clone ? "Agent profile cloned." : "Agent profile imported.");
              opened(result.thread.id);
            });
          }}
        >
          <label htmlFor={field} className="grid gap-2 text-sm">
            {clone ? "Agent name" : "Profile file"}
            {clone ? (
              <Input
                id={field}
                required
                value={name}
                maxLength={200}
                disabled={action.busy}
                onChange={(event) => {
                  setName(event.target.value);
                  key.current = crypto.randomUUID();
                }}
              />
            ) : (
              <Input
                id={field}
                required
                type="file"
                accept="application/json,.json"
                disabled={action.busy}
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  key.current = crypto.randomUUID();
                }}
              />
            )}
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close} disabled={action.busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={action.busy || (clone ? !name.trim() : !file)}>
              {clone ? "Clone profile" : "Import profile"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
