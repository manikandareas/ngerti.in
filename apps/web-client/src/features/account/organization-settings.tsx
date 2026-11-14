import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { command, durableCommand } from "@/lib/api-client";
import { AccountField, CreateOrganization, useAccountAction } from "./account-forms";
import { useAccount } from "./session";

export function OrganizationSettings() {
  const account = useAccount();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const action = useAccountAction();
  if (!account?.organization || !account.access) return null;
  const organization = account.organization;
  return (
    <div className="organization-settings">
      <section>
        <h2>{organization.name}</h2>
        <p className="account-muted">
          {account.access.role === "owner"
            ? "Owner"
            : account.access.role === "admin"
              ? "Admin"
              : "Member"}
        </p>
        {account.access.capabilities.manage_organization &&
          (editing ? (
            <form
              className="organization-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                const name = String(new FormData(event.currentTarget).get("name"));
                void action.run(async () => {
                  await durableCommand(
                    "rename-organization",
                    `/v1/organizations/${organization.id}`,
                    { name, slug: organization.slug },
                  );
                  setEditing(false);
                  await account.refresh();
                });
              }}
            >
              <AccountField label="Name">
                <Input name="name" defaultValue={organization.name} required maxLength={120} />
              </AccountField>
              <div className="account-actions">
                <Button disabled={action.busy}>Save</Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setEditing(true)}>
              Rename
            </Button>
          ))}
      </section>
      {account.access.private_work_suspended && (
        <section>
          <h2>Paused responsibilities</h2>
          <Button
            disabled={action.busy}
            onClick={() =>
              void action.run(async () => {
                await command(`/v1/organizations/${organization.id}/private-work/resume`);
                await account.refresh();
              })
            }
          >
            Resume my work
          </Button>
        </section>
      )}
      {account.list.created_count < account.list.creation_limit && (
        <section>
          {creating ? (
            <>
              <h2>New organization</h2>
              <CreateOrganization created={account.select} cancel={() => setCreating(false)} />
            </>
          ) : (
            <Button variant="outline" onClick={() => setCreating(true)}>
              New organization
            </Button>
          )}
        </section>
      )}
      {action.error && (
        <p role="alert" className="account-error">
          {action.error}
        </p>
      )}
    </div>
  );
}
