import type { OnboardingHarness } from "./onboarding-harnesses";

export type MaintenanceJob = {
  id: string;
  harness: OnboardingHarness;
  operation: "install" | "update";
  status: "running" | "succeeded" | "failed";
  expected_version: string | null;
  version: string | null;
  error: string | null;
};
export type Maintenance = {
  can_update: boolean;
  updating: OnboardingHarness[];
  operations: MaintenanceJob[];
  native_login: { harness: OnboardingHarness; ready: boolean; reason: string | null }[];
};
