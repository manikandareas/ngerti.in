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
        <CardTitle className="text-lg font-extrabold">Simpan tujuan Course ini?</CardTitle>
        <CardDescription>Tujuannya disimpan dulu. Sumber dan outline belum dibuat.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="font-bold">{approval.action.args.goal}</p>
        {approval.action.args.background ? (
          <p className="text-sm text-muted-foreground">
            Pengetahuan awal: {approval.action.args.background}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
      {pending ? (
        <CardFooter className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button type="button" disabled={sending} onClick={() => respond(true)}>
            {sending ? <LoaderCircle className="animate-spin" /> : <Check />} Ya, simpan
          </Button>
          <Button type="button" variant="ghost" disabled={sending} onClick={() => respond(false)}>
            <X /> Lewati dulu
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
