import { createFileRoute, notFound } from "@tanstack/react-router";
import { DiagnosticPage } from "@/features/diagnostics/components/diagnostic-page";
import { diagnosticsEnabled } from "@/lib/api";

export const Route = createFileRoute("/dev/system")({
  beforeLoad: () => {
    if (!diagnosticsEnabled) throw notFound();
  },
  component: DiagnosticPage,
});
