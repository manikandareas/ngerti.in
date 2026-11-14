import {
  Children,
  cloneElement,
  isValidElement,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, durableCommand } from "@/lib/api-client";
import type { Organization } from "./types";

const accountErrors: Record<string, string> = {
  AUTHENTICATION_FAILED: "Check your email and password. Verify your email before signing in.",
  UNAUTHORIZED: "Sign in again to continue.",
  SCOPE_DENIED: "Your access changed. Refresh and try again.",
  CONFLICT: "This changed elsewhere. Refresh and try again.",
  INVALID_REQUEST: "Check the details and try again.",
  NOT_FOUND: "This item is no longer available.",
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
export function useAccountAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function run(action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === "AbortError"))
        setError(
          failure instanceof ApiError
            ? (accountErrors[failure.code] ?? failure.message)
            : failure instanceof Error
              ? failure.message
              : "Could not save. Try again.",
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}
export function CreateOrganization({
  created,
  cancel,
}: {
  created: (id: string) => Promise<void>;
  cancel?: () => void;
}) {
  const [name, setName] = useState("");
  const operation = useAccountAction();
  const suffix = useRef(crypto.randomUUID().slice(0, 6));
  return (
    <form
      className="account-form"
      onSubmit={(event) => {
        event.preventDefault();
        void operation.run(async () => {
          const base =
            name
              .toLowerCase()
              .normalize("NFKD")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")
              .slice(0, 70) || "workspace";
          const result = await durableCommand<{ organization: Organization }>(
            "create-organization",
            "/v1/organizations",
            { name: name.trim(), slug: `${base}-${suffix.current}` },
          );
          await created(result.organization.id);
        });
      }}
    >
      <AccountField label="Organization name">
        <Input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={120}
          required
          autoFocus
          autoComplete="organization"
          disabled={operation.busy}
        />
      </AccountField>
      {operation.error && (
        <p role="alert" className="account-error">
          {operation.error}
        </p>
      )}
      <div className="account-actions">
        <Button disabled={operation.busy || !name.trim()}>
          {operation.busy ? "Creating…" : "Create organization"}
        </Button>
        {cancel && (
          <Button type="button" variant="ghost" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
