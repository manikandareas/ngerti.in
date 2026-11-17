import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { type ExternalToast, toast } from "sonner";
import { ApiError, durableCommand } from "@/lib/api-client";
import type { Organization } from "./types";

const accountErrors: Record<string, string> = {
  AUTHENTICATION_FAILED: "Check your email and password. Verify your email before signing in.",
  UNAUTHORIZED: "Sign in again to continue.",
  SCOPE_DENIED: "Your access changed. Refresh and try again.",
  CONFLICT: "This changed elsewhere. Refresh and try again.",
  INVALID_REQUEST: "Check the details and try again.",
  NOT_FOUND: "This item is no longer available.",
  EXECUTABLE_MISSING: "This harness is not installed on the server.",
  VERSION_TOO_OLD: "Update this harness to a supported version before connecting.",
  CAPABILITY_UNSUPPORTED: "This installation does not support that action yet.",
  NATIVE_STORAGE_REQUIRED:
    "The server owner needs to configure encrypted account storage before connecting Codex.",
  SERVICE_UNAVAILABLE: "The operation could not finish. Check the server connection and try again.",
  PROTOCOL_ERROR: "The harness could not connect. Check its version and try again.",
  NATIVE_REJECTED: "The harness did not accept the connection. Try signing in again.",
  PROVIDER_LIMIT: "Usage limit reached. Wait for quota to reset or choose another connection.",
  BILLING_MISMATCH:
    "This account uses a different billing method. Manage its connection in Settings.",
};

export function AccountField({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="account-field">
      <label htmlFor={id}>{label}</label>
      {Children.map(children, (child, index) =>
        index === 0 && isValidElement<{ id?: string }>(child) ? cloneElement(child, { id }) : child,
      )}
    </div>
  );
}
export function useAccountAction(
  options: { id?: string; errorAction?: (failure: unknown) => ExternalToast["action"] } = {},
) {
  const [busy, setBusy] = useState(false);
  const id = useId();
  const lock = useRef(false);
  async function run(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError")) {
        const errorAction = options.errorAction?.(failure);
        toast.error(
          failure instanceof ApiError
            ? (accountErrors[failure.code] ?? failure.message)
            : failure instanceof Error
              ? failure.message
              : "Could not save. Try again.",
          {
            id: options.id ?? id,
            duration: errorAction ? Infinity : 8000,
            action: errorAction,
          },
        );
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}
export function createOrganization(name: string) {
  const base =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 70)
      .replace(/^-|-$/g, "") || "workspace";
  return durableCommand<{ organization: Organization }>(
    "create-organization",
    "/v1/organizations",
    { name: name.trim(), slug: `${base}-${crypto.randomUUID().slice(0, 6)}` },
  );
}
