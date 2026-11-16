import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { useApiResource } from "@/hooks/use-api-resource";
import { durableCommand, request } from "@/lib/api-client";
import { assertScope, clientScope } from "@/lib/client-scope";
import type { Connection } from "@/types/workspace";
import { AccountField, useAccountAction } from "./account-forms";
import { ConnectionRow } from "./connection-row";
import { useAccount } from "./session";
import type { Audience, Workgroup } from "./types";

export function ScopedProviderSettings() {
  const account = useAccount();
  const workspace = useSettingsWorkspace();
  const [adding, setAdding] = useState(false);
  const [harness, setHarness] = useState<"codex" | "muse">("codex");
  const [method, setMethod] = useState("native_login");
  const [ownership, setOwnership] = useState("personal");
  const [audience, setAudience] = useState("all_members");
  const [secret, setSecret] = useState("");
  const scope = useRef(clientScope()).current;
  const action = useAccountAction();
  const operation = useRef(crypto.randomUUID());
  const groups = useApiResource<{ workgroups: Workgroup[] }>(
    account?.access?.capabilities.manage_organization
      ? `/v1/organizations/${account.organization?.id}/workgroups`
      : null,
  );
  return (
    <div className="organization-settings">
      <section>
        <div className="organization-toolbar">
          <h2>AI connections</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAdding(!adding);
              setSecret("");
            }}
          >
            Add connection
          </Button>
        </div>
        {adding && (
          <form
            className="organization-inline-form"
            onSubmit={(event) => {
              event.preventDefault();
              void action.run(async () => {
                let audienceId: string | null = null;
                if (ownership === "organization") {
                  const result = await durableCommand<{ audience: Audience }>(
                    "provider-audience",
                    `/v1/organizations/${account?.organization?.id}/audiences`,
                    audience === "all_members"
                      ? { mode: "all_members" }
                      : { mode: "workgroups", workgroup_ids: [audience] },
                  );
                  audienceId = result.audience.id;
                }
                assertScope(scope);
                const connection = await request<Connection>(
                  method === "api_key" ? "/v1/connections/api-key" : "/v1/connections",
                  {
                    harness,
                    ownership,
                    audience_id: audienceId,
                    ...(method === "api_key"
                      ? { api_key: secret }
                      : {
                          authentication: {
                            method: "native_login",
                            billing_source: "subscription",
                          },
                        }),
                  },
                  operation.current,
                  undefined,
                  30_000,
                  scope,
                );
                operation.current = crypto.randomUUID();
                setSecret("");
                setAdding(false);
                await workspace.refresh();
                if (connection.login !== "authenticated" && method === "api_key")
                  toast.info(
                    "Key saved. Refresh this connection to verify its models and billing.",
                  );
              });
            }}
          >
            <AccountField label="Provider">
              <select
                className="settings-select"
                value={harness}
                onChange={(event) => {
                  setHarness(event.target.value as typeof harness);
                  setMethod(event.target.value === "muse" ? "api_key" : "native_login");
                }}
              >
                <option value="codex">ChatGPT</option>
                <option value="muse">Muse Code</option>
              </select>
            </AccountField>
            <AccountField label="Connect with">
              <select
                className="settings-select"
                value={method}
                onChange={(event) => {
                  setMethod(event.target.value);
                  setSecret("");
                }}
              >
                <option value="native_login">Account sign in</option>
                <option value="api_key">API key</option>
              </select>
            </AccountField>
            {method === "api_key" && (
              <AccountField label="API key">
                <Input
                  type="password"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  autoComplete="off"
                  required
                  maxLength={16384}
                />
                <span className="account-muted">
                  API usage is billed separately from your subscription.
                </span>
              </AccountField>
            )}
            {account?.access?.capabilities.manage_organization && (
              <AccountField label="Owned by">
                <select
                  className="settings-select"
                  value={ownership}
                  onChange={(event) => setOwnership(event.target.value)}
                >
                  <option value="personal">Me</option>
                  <option value="organization">Organization</option>
                </select>
              </AccountField>
            )}
            {ownership === "organization" && (
              <AccountField label="Available to">
                <select
                  className="settings-select"
                  value={audience}
                  onChange={(event) => setAudience(event.target.value)}
                >
                  <option value="all_members">All members</option>
                  {groups.data?.workgroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </AccountField>
            )}
            <div className="account-actions">
              <Button disabled={action.busy || (method === "api_key" && !secret.trim())}>
                {action.busy ? "Saving…" : "Add connection"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setSecret("");
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
        {workspace.connections
          .filter((connection) => connection.state === "active")
          .map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              refresh={workspace.refresh}
            />
          ))}
        {!workspace.connections.some((connection) => connection.state === "active") && !adding && (
          <p className="account-muted">Connect an AI account to start working with your agents.</p>
        )}
      </section>
    </div>
  );
}
