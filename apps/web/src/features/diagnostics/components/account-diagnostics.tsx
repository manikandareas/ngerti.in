import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/features/diagnostics/hooks/use-account";
import { AccessPanel } from "./access-panel";
import { FilePanel } from "./file-panel";
import { RunPanel } from "./run-panel";

export function AccountDiagnostics() {
  const account = useAccount();
  return (
    <>
      <section className="my-7 flex flex-wrap items-start gap-3.5 border-y py-6 [&>svg]:mt-0.5 [&>svg]:shrink-0 [&>svg]:text-ring [&>div]:min-w-0 [&>div]:flex-1 [&_p]:mt-1 [&_p]:text-xs [&_p]:text-muted-foreground">
        <CheckCircle2 size={20} />
        <div>
          <h2>Identitas dari server</h2>
          {account.data ? (
            <>
              <p>Akun aplikasi terhubung dengan sesi Clerk.</p>
              <dl className="mt-3.5 flex flex-wrap gap-7 [&_div]:min-w-0 [&_dt]:mb-1 [&_dt]:text-[11px] [&_dt]:text-muted-foreground [&_dd]:font-mono [&_dd]:text-xs [&_dd]:wrap-anywhere">
                <div>
                  <dt>Account ID</dt>
                  <dd>{account.data.id}</dd>
                </div>
                <div>
                  <dt>Clerk user</dt>
                  <dd>{account.data.clerk_user_id}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p role={account.error ? "alert" : undefined}>
              {account.error ? account.error.message : "Memverifikasi sesi dengan backend…"}
            </p>
          )}
        </div>
        {account.error ? (
          <Button type="button" variant="outline" onClick={() => account.refetch()}>
            Coba lagi
          </Button>
        ) : null}
      </section>
      {account.data ? (
        <div className="grid items-start gap-6 min-[1001px]:grid-cols-2">
          <RunPanel />
          <FilePanel />
          <AccessPanel />
        </div>
      ) : null}
    </>
  );
}
