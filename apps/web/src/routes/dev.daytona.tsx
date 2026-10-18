import { createFileRoute, notFound } from "@tanstack/react-router";
import { DaytonaTrialPage } from "@/features/diagnostics/components/daytona-trial-page";
import { diagnosticsEnabled } from "@/lib/api";

export const Route = createFileRoute("/dev/daytona")({
  beforeLoad: () => {
    if (!diagnosticsEnabled) throw notFound();
  },
  component: DaytonaTrialPage,
});
