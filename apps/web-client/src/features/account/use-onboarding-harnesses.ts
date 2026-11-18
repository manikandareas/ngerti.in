import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useApiResource } from "@/hooks/use-api-resource";
import { useFeedbackToast } from "@/hooks/use-feedback-toast";
import { ApiError, request } from "@/lib/api-client";
import { clientScope } from "@/lib/client-scope";
import { isHarness } from "@/lib/harnesses";
import type { Availability } from "@/types/workspace";
import { useAccountAction } from "./account-forms";
import type { Maintenance, MaintenanceJob } from "./harness-maintenance";
import { type OnboardingHarness, onboardingHarnessName } from "./onboarding-harnesses";

type Pending = Pick<MaintenanceJob, "id" | "harness" | "operation" | "expected_version">;

export function useOnboardingHarnesses() {
  const scope = useRef(clientScope()).current;
  const storageKey = `${scope?.key ?? "ngertiin:"}onboarding-maintenance`;
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<Pending | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Pending | null;
      return saved &&
        /^[0-9a-f-]{36}$/i.test(saved.id) &&
        isHarness(saved.harness) &&
        ["install", "update"].includes(saved.operation) &&
        (saved.expected_version === null || typeof saved.expected_version === "string")
        ? saved
        : null;
    } catch {
      return null;
    }
  });
  const lock = useRef(false);
  const action = useAccountAction();
  const versions = useApiResource<Availability[]>("/v1/harnesses", revision);
  const maintenance = useApiResource<Maintenance>("/v1/harnesses/maintenance", revision);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useFeedbackToast(versions.error || maintenance.error, { retry: refresh });

  const remember = useCallback(
    (value: Pending | null) => {
      if (value) localStorage.setItem(storageKey, JSON.stringify(value));
      else localStorage.removeItem(storageKey);
      setPending(value);
    },
    [storageKey],
  );
  const observed = pending && maintenance.data?.operations?.find((job) => job.id === pending.id);
  const activeUpdate = pending?.harness ?? maintenance.data?.updating[0] ?? null;

  useEffect(() => {
    const focused = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    return () => {
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
    };
  }, [refresh]);
  useEffect(() => {
    if (!activeUpdate) return;
    const timer = setInterval(refresh, 4000);
    return () => clearInterval(timer);
  }, [activeUpdate, refresh]);
  useEffect(() => {
    if (!observed || observed.status === "running") return;
    if (observed.status === "succeeded")
      toast.success(
        `${onboardingHarnessName(observed.harness)} ${observed.operation === "install" ? "installed" : "updated"} to ${observed.version}.`,
        { id: observed.id, duration: 5000, action: undefined },
      );
    else
      toast.error(observed.error ?? "Installation could not finish. Try again.", {
        id: observed.id,
        duration: 8000,
        action: undefined,
      });
    remember(null);
    refresh();
  }, [observed, remember, refresh]);

  async function submit(operation: Pending) {
    try {
      const job = await request<MaintenanceJob>(
        `/v1/harnesses/${operation.harness}/update`,
        { expected_version: operation.expected_version },
        operation.id,
        undefined,
        15_000,
        scope,
      );
      remember({ ...operation, id: job.id, operation: job.operation });
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        !["API_UNAVAILABLE", "INVALID_RESPONSE", "INTERNAL_ERROR"].includes(failure.code)
      ) {
        remember(null);
        throw failure;
      }
      if (scope?.abort.signal.aborted) return;
      toast.info("Connection interrupted. Checking the installation status…", {
        id: operation.id,
        duration: Infinity,
        action: { label: "Retry", onClick: () => void action.run(() => submit(operation)) },
      });
    } finally {
      refresh();
    }
  }

  async function update(harness: OnboardingHarness) {
    if (lock.current || activeUpdate) return;
    lock.current = true;
    try {
      await action.run(async () => {
        const before = versions.data?.find((item) => item.harness === harness);
        if (!before) throw new Error("Check this harness version before updating.");
        const operation: Pending = {
          id: crypto.randomUUID(),
          harness,
          operation: before.state === "missing" ? "install" : "update",
          expected_version: before.version,
        };
        if (!maintenance.data?.can_update)
          throw new Error(`Only the server owner can ${operation.operation} this harness.`);
        remember(operation);
        await submit(operation);
      });
    } finally {
      lock.current = false;
    }
  }

  return {
    availability: versions.data ?? [],
    loading: (!versions.data || !maintenance.data) && !versions.error && !maintenance.error,
    error: versions.error || maintenance.error,
    updating: activeUpdate,
    operation:
      pending?.operation ??
      maintenance.data?.operations?.find((job) => job.status === "running")?.operation,
    nativeLogin: maintenance.data?.native_login ?? [],
    canUpdate: maintenance.data?.can_update ?? false,
    busy: !!activeUpdate || action.busy,
    refresh,
    update,
  };
}
