import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { durableCommand, request } from "@/lib/api-client";
import type { Connection } from "@/types/workspace";
import { AccountField, useAccountAction } from "./account-forms";
import { useAccount } from "./session";

export function ConnectionRow({
  connection,
  refresh,
}: {
  connection: Connection;
  refresh: () => Promise<unknown>;
}) {
  const account = useAccount();
  const workspace = useSettingsWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [defaultModel, setDefaultModel] = useState("");
  const myDefault = workspace.selections?.find(
    (row) => row.scope === "user" && row.harness === connection.harness,
  )?.selection;
  const selectable =
    connection.actor_id !== null ||
    workspace.allowedOrganizationConnectionIds?.includes(connection.id);
  const [removing, setRemoving] = useState(false);
  const [login, setLogin] = useState<{ auth_url?: string; user_code?: string } | null>(null);
  const action = useAccountAction();
  const manageable =
    connection.actor_id === account?.session?.user.id ||
    !!account?.access?.capabilities.manage_organization;
  const billing =
    connection.effective_billing_source === "subscription"
      ? "Subscription"
      : connection.effective_billing_source === "api_key"
        ? "API billing"
        : "Billing unverified";
  const loginUrl = (() => {
    try {
      const url = new URL(login?.auth_url ?? "");
      return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch {
      return null;
    }
  })();
  return (
    <div>
      <div className="organization-settings-row">
        <div className="organization-row-copy">
          <span className="text-sm">
            {connection.account_id ?? (connection.harness === "codex" ? "ChatGPT" : "Muse Code")}
          </span>
          <p>
            {connection.ownership === "organization" ? "Organization" : "Personal"} · {billing}
            {connection.login !== "authenticated" ? " · Sign in needed" : ""}
          </p>
        </div>
        {manageable && (
          <>
            <Button
              size="sm"
              variant="ghost"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await request(`/v1/connections/${connection.id}/inspect`, {});
                  await refresh();
                })
              }
            >
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Done" : "Manage"}
            </Button>
          </>
        )}
      </div>
      {manageable && expanded && (
        <div className="organization-inline-form">
          {selectable && connection.login === "authenticated" && connection.models.length > 0 && (
            <form
              className="account-form max-w-sm"
              onSubmit={(event) => {
                event.preventDefault();
                void action.run(async () => {
                  await durableCommand(
                    `default-provider:${connection.harness}`,
                    "/v1/ai/selections",
                    {
                      scope: "user",
                      harness: connection.harness,
                      selection: {
                        connection_id: connection.id,
                        model_id: defaultModel,
                        reasoning: null,
                      },
                    },
                  );
                  await refresh();
                });
              }}
            >
              <AccountField label="Default model">
                <select
                  className="settings-select"
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.target.value)}
                  required
                >
                  <option value="">Choose a model</option>
                  {connection.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.id}
                    </option>
                  ))}
                </select>
              </AccountField>
              <Button size="sm" variant="outline" disabled={action.busy || !defaultModel}>
                Use as my default
              </Button>
              {myDefault?.connection_id === connection.id && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(async () => {
                      await durableCommand(
                        `default-provider:${connection.harness}`,
                        "/v1/ai/selections",
                        { scope: "user", harness: connection.harness, selection: null },
                      );
                      await refresh();
                    })
                  }
                >
                  Clear my default
                </Button>
              )}
            </form>
          )}
          {connection.authentication.method === "native_login" &&
            connection.login !== "authenticated" && (
              <Button
                variant="outline"
                className="self-start"
                size="sm"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    setLogin(await request(`/v1/connections/${connection.id}/login`, {}));
                    await refresh();
                  })
                }
              >
                Sign in
              </Button>
            )}
          {login && (
            <Button
              variant="ghost"
              size="sm"
              disabled={action.busy}
              onClick={() =>
                void action.run(async () => {
                  await request(`/v1/connections/${connection.id}/login/cancel`, {});
                  setLogin(null);
                })
              }
            >
              Cancel sign in
            </Button>
          )}
          {removing ? (
            <div className="account-actions">
              <Button
                variant="destructive"
                size="sm"
                disabled={action.busy}
                onClick={() =>
                  void action.run(async () => {
                    await durableCommand(
                      `disconnect:${connection.id}`,
                      `/v1/connections/${connection.id}/revoke`,
                      {},
                    );
                    await refresh();
                  })
                }
              >
                Confirm disconnect
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="self-start text-destructive"
              onClick={() => setRemoving(true)}
            >
              Disconnect
            </Button>
          )}
        </div>
      )}
      {loginUrl && (
        <div className="organization-inline-form">
          {login?.user_code && (
            <p className="text-sm">
              Code: <strong>{login.user_code}</strong>
            </p>
          )}
          <Button asChild className="self-start">
            <a href={loginUrl} target="_blank" rel="noreferrer">
              Continue sign in
            </a>
          </Button>
        </div>
      )}
    </div>
  );
}
