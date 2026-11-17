import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PiConfigurationInput } from "@/features/settings/components/pi-configuration-input";
import { useSettingsWorkspace } from "@/hooks/settings-workspace";
import { useApiResource } from "@/hooks/use-api-resource";
import { durableCommand, request } from "@/lib/api-client";
import { assertScope, clientScope } from "@/lib/client-scope";
import {
  type HarnessId,
  harnesses,
  harnessIds,
  providerConnectionMethod,
  providersForHarness,
} from "@/lib/harnesses";
import type { Connection } from "@/types/workspace";
import { AccountField, useAccountAction } from "./account-forms";
import { ConnectionRow } from "./connection-row";
import { useAccount } from "./session";
import type { Audience, Workgroup } from "./types";

export function ScopedProviderSettings() {
  const account = useAccount();
  const workspace = useSettingsWorkspace();
  const [adding, setAdding] = useState(false);
  const [harness, setHarness] = useState<HarnessId>("codex");
  const [provider, setProvider] = useState("");
  const [method, setMethod] = useState("native_login");
  const [ownership, setOwnership] = useState("personal");
  const [audience, setAudience] = useState("all_members");
  const [secret, setSecret] = useState("");
  const [nativeConfiguration, setNativeConfiguration] = useState<Record<string, unknown> | null>(
    null,
  );
  const source = providerConnectionMethod(harness, harnesses[harness].providerId ?? provider);
  const effectiveMethod = source === "api_key" ? method : source;
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
            disabled={action.busy}
            onClick={() => {
              setAdding(!adding);
              setSecret("");
              setNativeConfiguration(null);
              operation.current = crypto.randomUUID();
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
                const operationId = operation.current;
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
                  effectiveMethod === "api_key"
                    ? "/v1/connections/api-key"
                    : effectiveMethod === "harness_config"
                      ? "/v1/connections/native-configuration"
                      : "/v1/connections",
                  {
                    harness,
                    provider_id: harnesses[harness].providerId ?? provider,
                    ownership,
                    audience_id: audienceId,
                    ...(effectiveMethod === "harness_config"
                      ? { configuration: nativeConfiguration }
                      : effectiveMethod === "api_key"
                        ? { api_key: secret }
                        : {
                            authentication: {
                              method: effectiveMethod === "none" ? "none" : "native_login",
                              billing_source: effectiveMethod === "none" ? "free" : "subscription",
                            },
                          }),
                  },
                  operationId,
                  undefined,
                  30_000,
                  scope,
                );
                operation.current = crypto.randomUUID();
                setSecret("");
                setNativeConfiguration(null);
                setAdding(false);
                await workspace.refresh();
                if (connection.login !== "authenticated" && effectiveMethod !== "native_login")
                  toast.info("Connection saved. Refresh it to load its available models.");
              });
            }}
          >
            <AccountField label="AI harness">
              <select
                className="settings-select"
                value={harness}
                disabled={action.busy}
                onChange={(event) => {
                  const next = event.target.value as HarnessId;
                  setHarness(next);
                  setMethod(
                    harnesses[next].nativeLogin && next !== "muse" ? "native_login" : "api_key",
                  );
                  setProvider("");
                  setSecret("");
                  setNativeConfiguration(null);
                  operation.current = crypto.randomUUID();
                }}
              >
                {harnessIds.map((id) => (
                  <option key={id} value={id}>
                    {harnesses[id].name}
                  </option>
                ))}
              </select>
            </AccountField>
            {harnesses[harness].providerId === null && source !== "harness_config" && (
              <AccountField label="Model provider">
                <select
                  className="settings-select"
                  value={provider}
                  disabled={action.busy}
                  required
                  onChange={(event) => {
                    setProvider(event.target.value);
                    setSecret("");
                    setNativeConfiguration(null);
                    operation.current = crypto.randomUUID();
                  }}
                >
                  <option value="">Choose a provider</option>
                  {providersForHarness(harness).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </AccountField>
            )}
            <AccountField label="Connect with">
              <select
                className="settings-select"
                value={effectiveMethod}
                disabled={action.busy || source !== "api_key"}
                onChange={(event) => {
                  setMethod(event.target.value);
                  setSecret("");
                  setNativeConfiguration(null);
                  operation.current = crypto.randomUUID();
                }}
              >
                {source === "none" && (
                  <option value="none">Free access · no sign-in required</option>
                )}
                {source === "harness_config" && (
                  <option value="harness_config">Existing Pi setup</option>
                )}
                {source === "api_key" && harnesses[harness].nativeLogin && (
                  <option value="native_login">Account sign in</option>
                )}
                {source === "api_key" && <option value="api_key">API key</option>}
              </select>
            </AccountField>
            {effectiveMethod === "harness_config" && (
              <PiConfigurationInput
                key={harness}
                disabled={action.busy}
                onChange={(selection) => {
                  setNativeConfiguration(selection?.configuration ?? null);
                  setProvider(selection?.providerId ?? "");
                  operation.current = crypto.randomUUID();
                }}
              />
            )}
            {effectiveMethod === "none" && (
              <p className="account-muted">
                Use the free models currently offered by OpenCode. No credential is imported.
              </p>
            )}
            {effectiveMethod === "api_key" && (
              <AccountField label="API key">
                <Input
                  type="password"
                  value={secret}
                  disabled={action.busy}
                  onChange={(event) => {
                    setSecret(event.target.value);
                    operation.current = crypto.randomUUID();
                  }}
                  autoComplete="off"
                  required
                  maxLength={16384}
                />
                <span className="account-muted">
                  Usage is billed to the selected provider API account.
                </span>
              </AccountField>
            )}
            {account?.access?.capabilities.manage_organization && (
              <AccountField label="Owned by">
                <select
                  className="settings-select"
                  value={ownership}
                  disabled={action.busy}
                  onChange={(event) => {
                    setOwnership(event.target.value);
                    operation.current = crypto.randomUUID();
                  }}
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
                  disabled={action.busy}
                  onChange={(event) => {
                    setAudience(event.target.value);
                    operation.current = crypto.randomUUID();
                  }}
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
              <Button
                disabled={
                  action.busy ||
                  (effectiveMethod === "api_key" && !secret.trim()) ||
                  (effectiveMethod === "harness_config" && !nativeConfiguration) ||
                  (harnesses[harness].providerId === null && !provider)
                }
              >
                {action.busy ? "Saving…" : "Add connection"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={action.busy}
                onClick={() => {
                  setAdding(false);
                  setSecret("");
                  setNativeConfiguration(null);
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
