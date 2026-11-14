import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { durableCommand, request } from "@/lib/api-client";
import { useAccountAction } from "./account-forms";
import { useAccount } from "./session";
import type { Invitation, Organization } from "./types";

export function InvitationReview({ id }: { id: string }) {
  const account = useAccount();
  const [review, setReview] = useState<{
    organization: Organization;
    invitation: Invitation;
  } | null>(null);
  const operation = useAccountAction();
  const [failure, setFailure] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    void request<typeof review>(`/v1/invitations/${id}`, undefined, undefined, abort.signal)
      .then(setReview)
      .catch((error) => {
        if (!abort.signal.aborted) setFailure(error.message);
      });
    return () => abort.abort();
  }, [id]);
  return (
    <>
      <h1>{review ? `Join ${review.organization.name}` : "Your invitation"}</h1>
      {failure ? (
        <p role="alert">This invitation is unavailable. Ask the organization to send a new one.</p>
      ) : review ? (
        <>
          <p className="account-muted">
            {review.invitation.email} · {review.invitation.role === "admin" ? "Admin" : "Member"}
          </p>
          {operation.error && (
            <p role="alert" className="account-error">
              {operation.error}
            </p>
          )}
          <Button
            disabled={operation.busy}
            onClick={() =>
              void operation.run(async () => {
                await durableCommand(`accept-invitation:${id}`, `/v1/invitations/${id}/accept`, {});
                await account?.select(review.organization.id);
                window.location.assign("/");
              })
            }
          >
            {operation.busy ? "Joining…" : "Accept invitation"}
          </Button>
        </>
      ) : (
        <div role="status" aria-label="Loading invitation" className="account-loading-row" />
      )}
      <Button variant="ghost" onClick={() => window.location.assign("/")}>
        Back
      </Button>
    </>
  );
}
