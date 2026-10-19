import { Button } from "@/components/ui/button";
import { useWorkEstimate } from "../hooks/use-compute-usage";
import { formatCredits } from "../utils/format";

export function WorkEstimate({
  runtimeKind,
  inputs = [],
  perRunCap,
  scheduled = false,
}: {
  runtimeKind: string;
  inputs?: string[];
  perRunCap?: number;
  scheduled?: boolean;
}) {
  const estimate = useWorkEstimate(runtimeKind, runtimeKind === "browser" ? [] : inputs, perRunCap);
  if (!estimate.data)
    return (
      <div className="text-sm text-muted-foreground" role="status">
        {estimate.isError ? (
          <>
            Batas penggunaan belum dapat dimuat. Saldo tetap diperiksa saat pekerjaan dimulai.{" "}
            <Button type="button" variant="link" onClick={() => void estimate.refetch()}>
              Coba lagi
            </Button>
          </>
        ) : (
          "Menghitung batas penggunaan…"
        )}
      </div>
    );
  return (
    <div className="space-y-1 rounded-xl bg-secondary p-4 text-sm" role="status">
      <p className="font-bold">
        Batas {scheduled ? "per eksekusi" : "pekerjaan"}: {formatCredits(estimate.data.maximum)}
      </p>
      <p className="text-muted-foreground">
        {scheduled
          ? "Saldo diperiksa dan dicadangkan pada setiap eksekusi, termasuk saat kamu offline. "
          : "Dicadangkan saat dimulai; sisa yang tidak terpakai dikembalikan. "}
        Termasuk batas model
        {runtimeKind === "text"
          ? " dan OCR yang diperlukan"
          : runtimeKind === "code"
            ? ", Python dan OCR yang diperlukan"
            : ", komputer dan penyimpanan profil"}
        .
      </p>
      {!estimate.data.available && (
        <p className="text-danger">
          Sisa {formatCredits(estimate.data.remaining)} belum cukup. Periksa cadangan aktif atau
          tunggu reset.
        </p>
      )}
      {estimate.isError && (
        <p>Pembaruan terhenti. Batas di atas berasal dari pembaruan terakhir.</p>
      )}
    </div>
  );
}
