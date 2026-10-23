import { Check, LoaderCircle, X } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useExpired } from "@/features/chat/hooks/use-expired";
import type { Approval } from "@/features/chat/types";

const statusLabels: Record<string, string> = {
  approved: "Disetujui",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
};

interface ApprovalCardProps {
  approval: Approval;
  decide: (approval: Approval, approved: boolean) => Promise<void>;
}

export function ApprovalCard({ approval, decide }: ApprovalCardProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const expired = useExpired(approval.expires_at);
  const pending = approval.status === "pending" && !expired;
  async function respond(approved: boolean) {
    if (sending || !pending) return;
    setSending(true);
    setError("");
    try {
      await decide(approval, approved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Keputusan belum tersimpan.");
    } finally {
      setSending(false);
    }
  }
  const label = pending
    ? "Perlu keputusanmu"
    : approval.status === "pending" && expired
      ? "Kedaluwarsa"
      : (statusLabels[approval.status] ?? approval.status);
  const content = (
    <Card className="my-5 border border-border shadow-none ring-0">
      <CardHeader>
        <div className="mb-2">
          <Badge variant="secondary">{label}</Badge>
        </div>
        <CardTitle className="text-lg font-extrabold">
          {pending ? "Izinkan tindakan ini?" : "Riwayat keputusan"}
        </CardTitle>
        <CardDescription>
          {pending
            ? "Gwen menunggu keputusan ini sebelum melanjutkan respons. Draft pesanmu tetap tersimpan."
            : "Permintaan ini sudah tidak dapat diputuskan. Lihat status respons untuk melanjutkan percakapan."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-bold">{approval.action.name}</p>
        <p className="text-sm text-muted-foreground">
          Izin berlaku hanya untuk tindakan dan parameter di bawah, bukan izin untuk tindakan
          berikutnya.
        </p>
        <dl className="space-y-2 text-sm">
          {Object.entries(approval.action.args).map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs text-muted-foreground">{key}</dt>
              <dd className="max-h-40 overflow-auto whitespace-pre-wrap wrap-anywhere">
                {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">
          Batas keputusan: {new Date(approval.expires_at).toLocaleString("id-ID")}
        </p>
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer py-2">Detail teknis</summary>
          <p>
            Permintaan {approval.id} · versi {approval.revision}
          </p>
        </details>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
      {pending ? (
        <CardFooter className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="button" disabled={sending} onClick={() => respond(true)}>
            {sending ? <LoaderCircle className="animate-spin" /> : <Check />} Setujui
          </Button>
          <Button type="button" variant="ghost" disabled={sending} onClick={() => respond(false)}>
            <X /> Tolak tindakan
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
  return pending ? (
    content
  ) : (
    <details className="my-3 rounded-xl border px-4">
      <summary className="cursor-pointer py-3 text-sm">
        {approval.action.name} · {label}
      </summary>
      {content}
    </details>
  );
}
