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
import type { Approval } from "./types";

const statusLabels: Record<string, string> = {
  approved: "Disetujui",
  rejected: "Dilewati",
};

interface ApprovalCardProps {
  approval: Approval;
  decide: (approval: Approval, approved: boolean) => Promise<void>;
}

export function ApprovalCard({ approval, decide }: ApprovalCardProps) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const expired = Date.parse(approval.expires_at) < Date.now();
  const pending = approval.status === "pending" && !expired;
  async function respond(approved: boolean) {
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
  return (
    <Card className="my-5 border border-border shadow-none ring-0">
      <CardHeader>
        <div className="mb-2">
          <Badge variant="secondary">
            {pending ? "Perlu keputusanmu" : (statusLabels[approval.status] ?? "Tidak aktif")}
          </Badge>
        </div>
        <CardTitle className="text-lg font-extrabold">Izinkan tindakan ini?</CardTitle>
        <CardDescription>Periksa tindakan dan detailnya sebelum memberi izin.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-bold">{approval.action.name}</p>
        <pre className="overflow-auto whitespace-pre-wrap break-words text-sm">
          {JSON.stringify(approval.action.args, null, 2)}
        </pre>
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
            <X /> Lewati dulu
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
