import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { type ExampleProps, type ExampleSet, renderExample } from "./shared";

function ProgressExample() {
  const [value, setValue] = useState(64);
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <div className="flex justify-between text-sm">
        <span>Mengunggah file</span>
        <output>{value}%</output>
      </div>
      <Progress value={value} aria-label="Kemajuan unggahan" />
      <Button
        variant="outline"
        size="sm"
        onClick={() => setValue((current) => (current >= 100 ? 0 : Math.min(100, current + 12)))}
      >
        {value >= 100 ? "Mulai ulang" : "Tambah progress"}
      </Button>
    </div>
  );
}

const examples = {
  accordion: () => (
    <Accordion type="single" collapsible defaultValue="theme">
      <AccordionItem value="theme">
        <AccordionTrigger>Apakah tema gelap tersedia?</AccordionTrigger>
        <AccordionContent>
          Ya. Seluruh primitive mengikuti tema light, dark, atau system di header.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="tokens">
        <AccordionTrigger>Dari mana token berasal?</AccordionTrigger>
        <AccordionContent>
          Dari design system Page 1, dengan semantic tokens yang sama di aplikasi.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
  alert: () => (
    <div className="space-y-4">
      <Alert variant="success">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} aria-hidden="true" />
        <AlertTitle>Berhasil disimpan</AlertTitle>
        <AlertDescription>Perubahan sudah diterapkan.</AlertDescription>
      </Alert>
      <Alert variant="warning">
        <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} aria-hidden="true" />
        <AlertTitle>Perlu diperiksa</AlertTitle>
        <AlertDescription>Ada detail yang memerlukan perhatian.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTitle>Proses gagal</AlertTitle>
        <AlertDescription>Coba lagi setelah koneksi tersedia.</AlertDescription>
      </Alert>
    </div>
  ),
  badge: () => (
    <div className="flex flex-wrap gap-3">
      {(["default", "secondary", "outline", "success", "warning", "destructive"] as const).map(
        (variant) => (
          <Badge key={variant} variant={variant}>
            {variant}
          </Badge>
        ),
      )}
    </div>
  ),
  collapsible: () => (
    <Collapsible className="space-y-3">
      <CollapsibleTrigger asChild>
        <Button variant="outline">Tampilkan detail</Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          Detail tambahan dibuka sesuai kebutuhan pengguna.
        </p>
      </CollapsibleContent>
    </Collapsible>
  ),
  empty: () => (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>Belum ada percakapan</EmptyTitle>
        <EmptyDescription>Mulai percakapan pertama bersama agent.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => toast("Ini contoh empty state.")}>Percakapan baru</Button>
      </EmptyContent>
    </Empty>
  ),
  progress: ProgressExample,
  skeleton: () => (
    <div
      className="mx-auto flex max-w-sm items-start gap-4"
      role="status"
      aria-label="Memuat konten"
    >
      <Skeleton className="size-12 shrink-0 rounded-full" />
      <div className="flex-1 space-y-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  ),
  sonner: () => (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => toast.success("Perubahan berhasil disimpan.")}>Success toast</Button>
      <Button variant="secondary" onClick={() => toast.warning("Periksa kembali data Anda.")}>
        Warning toast
      </Button>
      <Button variant="outline" onClick={() => toast.error("Koneksi terputus.")}>
        Error toast
      </Button>
    </div>
  ),
  spinner: () => (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <Spinner className="size-4" />
      <Spinner className="size-6 text-link" />
      <Spinner className="size-8 text-muted-foreground" />
      <Button disabled aria-busy="true">
        <Spinner />
        Memproses
      </Button>
    </div>
  ),
} satisfies ExampleSet;

export default function FeedbackExamples({ name }: ExampleProps) {
  return renderExample(examples, name);
}
