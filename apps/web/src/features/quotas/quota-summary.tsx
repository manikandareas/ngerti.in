import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { QuotaUsage } from "./use-quota";

const labels = {
  chat: "Pesan pengguna",
} as const;
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

interface QuotaSummaryProps {
  usage?: QuotaUsage;
  failed: boolean;
  onRefresh: () => void;
}

export function QuotaSummary({ usage, failed, onRefresh }: QuotaSummaryProps) {
  if (!usage) {
    return (
      <div className="flex min-h-8 items-center justify-center text-xs text-muted-foreground">
        {failed ? (
          <button type="button" onClick={onRefresh} className="rounded px-2 py-1 underline">
            Kuota belum termuat. Coba lagi
          </button>
        ) : (
          <span>Memuat kuota…</span>
        )}
      </div>
    );
  }
  const reset = dateFormat.format(new Date(usage.period.ends_at));
  const chat = usage.meters.chat;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-muted-foreground">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 px-2 text-xs font-normal text-muted-foreground"
            aria-label="Lihat kuota paket"
          >
            {usage.plan === "plus" ? "Plus" : "Free"} · {chat.remaining} pesan tersisa
            <ChevronDown className="size-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="center" className="w-72 space-y-4 rounded-2xl p-4">
          <div>
            <p className="font-semibold">Paket {usage.plan === "plus" ? "Plus" : "Free"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Kuota tersedia kembali {reset}</p>
          </div>
          <dl className="space-y-3 text-sm">
            {Object.entries(labels).map(([meter, label]) => {
              const value = usage.meters[meter as keyof typeof labels];
              return (
                <div key={meter}>
                  <div className="flex justify-between gap-3">
                    <dt>{label}</dt>
                    <dd className="tabular-nums">
                      {value.remaining} / {value.limit} tersisa
                    </dd>
                  </div>
                  {value.reserved > 0 ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {value.reserved} sedang dipakai pekerjaan berjalan
                    </p>
                  ) : null}
                </div>
              );
            })}
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Batas development sementara. Penggunaan komputasi akan diukur terpisah.
          </p>
          {failed ? (
            <button type="button" onClick={onRefresh} className="text-xs underline">
              Pembaruan kuota terhenti. Coba lagi
            </button>
          ) : null}
        </PopoverContent>
      </Popover>
      {chat.remaining === 0 ? (
        <p role="status" className="pb-1 text-center">
          Chat tersedia kembali {reset}. Draftmu tetap tersimpan.
        </p>
      ) : null}
    </div>
  );
}
