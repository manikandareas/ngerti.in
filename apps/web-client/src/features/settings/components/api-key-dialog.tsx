import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { type ProviderId, providers } from "@/features/settings/components/shared";
import { ApiError, request } from "@/lib/api-client";
import type { Connection } from "@/types/workspace";

export function ApiKeyDialog({
  provider,
  close,
  saved,
}: {
  provider: ProviderId;
  close: () => void;
  saved: (connection: Connection) => Promise<void>;
}) {
  const [key, setKey] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const operation = useRef(crypto.randomUUID());
  const lock = useRef(false);
  const company = provider === "codex" ? "OpenAI" : "Meta";
  const name = providers.find((p) => p.id === provider)?.name;
  async function save() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Secrets stay in memory. Retries reuse this operation; never put a key in browser storage.
      const result = await request<Connection>(
        "/v1/connections/api-key",
        { harness: provider, api_key: key.trim() },
        operation.current,
      );
      setKey("");
      await saved(result);
      close();
    } catch (failure) {
      const definitive =
        failure instanceof ApiError &&
        ["INVALID_REQUEST", "UNAUTHORIZED", "SCOPE_DENIED", "CONFLICT"].includes(failure.code);
      setUncertain(!definitive);
      setError(
        definitive
          ? failure.message
          : "Penyimpanan belum dapat dipastikan. Periksa lagi dengan key dan permintaan yang sama.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent
        className="sm:max-w-[400px]"
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        showCloseButton={!busy}
      >
        <DialogHeader>
          <DialogTitle>
            {company} API key untuk {name}
          </DialogTitle>
          <DialogDescription>
            Tempel API key untuk menggunakan {name}. Pemakaian ditagih oleh {company} melalui API,
            terpisah dari subscription.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="provider-api-key">API key</Label>
            <InputGroup>
              <InputGroupInput
                id="provider-api-key"
                autoFocus
                type={visible ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                maxLength={16384}
                value={key}
                disabled={busy || uncertain}
                onChange={(event) => {
                  setKey(event.target.value);
                  operation.current = crypto.randomUUID();
                }}
                placeholder={provider === "codex" ? "sk-…" : "Tempel Meta API key"}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton onClick={() => setVisible(!visible)} aria-pressed={visible}>
                  {visible ? "Sembunyikan" : "Lihat"}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <p className="text-caption text-muted-foreground">
              Key disimpan di host backend dan tidak ditampilkan kembali.
            </p>
          </div>
          {error && (
            <Alert
              variant="destructive"
              className="settings-alert mt-4 [&>button]:mt-3 [&>button]:justify-self-start"
            >
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <DialogFooter className="m-0 border-0 bg-transparent p-0">
            <Button type="button" variant="ghost" disabled={busy} onClick={close}>
              Batal
            </Button>
            <Button type="submit" disabled={busy || !key.trim()}>
              {busy && <Spinner />}
              {uncertain ? "Periksa penyimpanan" : "Simpan key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
