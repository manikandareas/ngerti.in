import {
  ArrowRight02Icon,
  MoreHorizontalIcon,
  RefreshIcon,
  UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { ProviderStatus } from "@/features/settings/components/provider-status";
import { billingLabel, type ProviderId, providers } from "@/features/settings/components/shared";
import type {
  ProviderAccountActions,
  ProviderLogin,
} from "@/features/settings/hooks/use-provider-accounts";
import { harnesses, modelProviderName } from "@/lib/harnesses";
import type { Agent, Connection } from "@/types/workspace";

export function ProviderAccount({
  provider,
  connection,
  agents,
  login,
  busy,
  ready,
  supportsLogin,
  actions,
  reportNotice,
}: {
  provider: ProviderId;
  connection: Connection;
  agents: Agent[];
  login?: ProviderLogin;
  busy: string | null;
  ready: boolean;
  supportsLogin: boolean;
  actions: ProviderAccountActions;
  reportNotice: (message: string) => void;
}) {
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const definition = providers.find((item) => item.id === provider) ?? providers[0];
  const users = agents.filter((agent) => agent.connection_id === connection.id);
  const native = connection.authentication.method === "native_login";
  const label =
    connection.authentication.method === "none"
      ? `${definition.name} Free`
      : connection.authentication.method === "harness_config"
        ? `${definition.name} · ${modelProviderName(connection.provider_id)} setup`
        : native
          ? `Akun ${definition.name}`
          : `${modelProviderName(connection.provider_id ?? harnesses[provider].providerId)} API key`;
  return (
    <div className="provider-account">
      <Item className="settings-row provider-account-row min-h-20 gap-4 rounded-none border-0 p-4 flex-wrap">
        <ItemMedia className="provider-account-avatar text-muted-foreground">
          <HugeiconsIcon icon={UserCircleIcon} size={24} aria-hidden="true" />
        </ItemMedia>
        <ItemContent className="min-w-0 basis-40">
          <ItemTitle className="line-clamp-none break-words">{label}</ItemTitle>
          <ItemDescription className="line-clamp-none break-words">
            {users.length
              ? `Digunakan oleh ${users.map((agent) => agent.name).join(", ")}`
              : "Belum digunakan agent"}{" "}
            · {billingLabel(connection.authentication.billing_source)}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="w-full justify-end sm:w-auto">
          <ProviderStatus connection={connection} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={`Kelola ${label}`} disabled={!!busy}>
                {busy === connection.id ? (
                  <Spinner />
                ) : (
                  <HugeiconsIcon icon={MoreHorizontalIcon} size={16} aria-hidden="true" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                disabled={!!busy || !ready}
                onSelect={() => void actions.inspect(connection)}
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} aria-hidden="true" />
                Periksa akun & model
              </DropdownMenuItem>
              {native && (
                <>
                  <DropdownMenuItem
                    disabled={!!busy || !ready || !supportsLogin}
                    onSelect={() => void actions.restartLogin(connection)}
                  >
                    Login ulang
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!!busy}
                    onSelect={() => void actions.cancelLogin(connection)}
                  >
                    Batalkan login
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={!!busy}
                onSelect={() => setConfirmRevoke(true)}
              >
                Putuskan
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ItemActions>
      </Item>
      {login && (
        <Alert role="status" className="provider-login-alert mx-4 mb-4 w-auto">
          <AlertTitle>Selesaikan login di browser</AlertTitle>
          <AlertDescription>
            <p>Buka halaman login, lalu kembali untuk memeriksa akun.</p>
            {login.user_code && (
              <div className="flex flex-wrap items-center gap-2">
                <code className="provider-login-code rounded-md bg-muted px-2 py-1 font-mono text-lg tracking-widest select-all break-all">
                  {login.user_code}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(login.user_code ?? "")
                      .then(() => reportNotice("Kode disalin."))
                      .catch(() => reportNotice("Salin kode yang ditampilkan secara manual."))
                  }
                >
                  Salin kode
                </Button>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {login.auth_url && /^https:\/\//.test(login.auth_url) && (
                <Button asChild>
                  <a href={login.auth_url} target="_blank" rel="noreferrer">
                    Lanjutkan login
                    <HugeiconsIcon icon={ArrowRight02Icon} size={14} aria-hidden="true" />
                  </a>
                </Button>
              )}
              <Button
                variant="outline"
                disabled={!!busy || !ready}
                onClick={() => void actions.inspect(connection)}
              >
                Periksa akun & model
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => void actions.cancelLogin(connection)}
              >
                Batalkan login
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Putuskan koneksi?</AlertDialogTitle>
            <AlertDialogDescription>
              {users.length
                ? `${users.map((agent) => agent.name).join(", ")} perlu memilih koneksi lain sebelum melanjutkan.`
                : "Kamu dapat menambahkan akun lagi nanti."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Batal</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!!busy}
              onClick={() =>
                void actions.revoke(connection).then((success) => {
                  if (success) setConfirmRevoke(false);
                })
              }
            >
              Ya, putuskan
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
