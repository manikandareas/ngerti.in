import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { Applications } from "../../../apps/server/src/integrations/service";
import { ScopedData } from "../../../apps/server/src/organizations/data";
import { organizationFixture } from "../../../apps/server/tests/organizations/helpers";

test.skipIf(process.env.NGERTIIN_NMA078_LIVE_APP !== "1")(
  "live organization and personal Composio identities execute a discovered read-only tool",
  async () => {
    const f = await organizationFixture();
    const { store, lifecycle } = f.domain;
    const apps = await Applications.open(lifecycle);
    const report: Record<string, unknown> = {
      scope:
        "real Composio through backend service with authenticated fixture principals and a synthetic accepted-run seam",
      sdk: "@composio/core@0.27.0",
      api: "v3.1",
      lanes: [],
      completed: false,
    };
    const save = () => {
      if (process.env.NGERTIIN_NMA078_APP_REPORT)
        writeFileSync(
          process.env.NGERTIIN_NMA078_APP_REPORT,
          `${JSON.stringify(report, null, 2)}\n`,
        );
    };
    try {
      await f.success(
        f.write(f.owner.cookie, "/v1/data/legacy-binding", {
          organization_id: f.initial.organization.id,
          legacy_owner_id: f.domain.owner,
        }),
      );
      const member = await f.account("app-probe@example.test");
      await f.join(member);
      const audience = (
        await f.success(f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }))
      ).audience;
      const req = (cookie: string, path: string, body?: unknown) =>
        f.http(path, body, cookie, {
          "X-Ngertiin-Organization": f.initial.organization.id,
          "Idempotency-Key": crypto.randomUUID(),
        });
      const team = await f.success(
        req(f.owner.cookie, "/v1/data/team-agents", {
          name: "Scoped application probe",
          harness: "codex",
          audience_id: audience.id,
        }),
      );
      const dm = await f.success(req(member.cookie, `/v1/agents/${team.id}/dm`, {}));
      const scope = async (cookie: string) => {
        const request = new Request(`${f.origin}/v1/entities/agent`, {
          headers: { Cookie: cookie, "X-Ngertiin-Organization": f.initial.organization.id },
        });
        await f.auth.authenticate(request);
        return new ScopedData(lifecycle, f.auth).context(request);
      };
      const run = async <T>(cookie: string, action: () => Promise<T>) =>
        store.withDataContext(await scope(cookie), action);
      for (const ownership of ["organization", "personal"] as const) {
        if (
          process.env.NGERTIIN_NMA078_APP_LANE &&
          process.env.NGERTIIN_NMA078_APP_LANE !== ownership
        )
          continue;
        const cookie = ownership === "organization" ? f.owner.cookie : member.cookie;
        const link = await run(cookie, () =>
          apps.connect(
            "github",
            undefined,
            ownership,
            ownership === "organization" ? audience.id : null,
          ),
        );
        const oauthPath = process.env.NGERTIIN_NMA078_OAUTH_FILE;
        if (!oauthPath) throw new Error("An owner-only temporary OAuth handoff file is required.");
        writeFileSync(oauthPath, JSON.stringify({ ownership, connect_url: link.connect_url }), {
          mode: 0o600,
        });
        chmodSync(oauthPath, 0o600);
        console.log(JSON.stringify({ event: "oauth_required", ownership }));
        let connection = link.connection;
        const deadline = Date.now() + 1_200_000;
        while (Date.now() < deadline) {
          connection = await run(cookie, () => apps.refresh(connection.id));
          if (connection.state === "active") break;
          await Bun.sleep(2500);
        }
        expect(connection.state).toBe("active");
        // Discovery is management-only and grants no execution. Select only a discovered
        // current-user read with an empty required-argument set.
        const discovered = (await run(cookie, () =>
          apps.search({
            connection_id: connection.id,
            query: "github get the authenticated user profile",
          }),
        )) as { slug: string; input_schema?: { required?: string[] } }[];
        const tool = discovered.find(
          (item) =>
            /GET_(THE_)?(AUTHENTICATED|CURRENT)_USER$/.test(item.slug) &&
            !item.input_schema?.required?.length,
        );
        if (!tool)
          throw new Error("No supported argument-free authenticated-user read was discovered.");
        connection = await run(cookie, () =>
          apps.assign(connection.id, {
            expected_revision: connection.revision,
            grants: [
              {
                agent_id: team.id,
                thread_id: ownership === "organization" ? null : dm.id,
                tools: [tool.slug],
              },
            ],
          }),
        );
        const lane = { agent_id: team.id, thread_id: dm.id };
        const admitted = await run(member.cookie, () =>
          lifecycle.admit({
            ...lane,
            text: "Read the selected application's current-user profile once.",
          }),
        );
        const context = await scope(member.cookie);
        const result = await store.withDataContext(context, () =>
          apps.execute(
            {
              command_id: crypto.randomUUID(),
              connection_id: connection.id,
              tool: tool.slug,
              arguments: {},
            },
            {
              scope: { ...lane, run_id: admitted.run?.id },
              authorize: () => context.validate(true),
            } as Parameters<typeof apps.execute>[1],
          ),
        );
        expect(result.receipt.state).toBe("succeeded");
        expect(result.receipt.log_id).toBeTruthy();
        expect(result.receipt.actor_id).toBe(member.userId);
        (report.lanes as unknown[]).push({
          ownership,
          tool: tool.slug,
          identity_sha256: connection.integration_identity?.split(":")[1],
          state: result.receipt.state,
          log_id: result.receipt.log_id,
          actor_attributed: true,
        });
        save();
        await run(cookie, () => apps.revoke(connection.id));
        console.log(
          JSON.stringify({
            event: "live_read_completed",
            ownership,
            tool: tool.slug,
            log_id: result.receipt.log_id,
          }),
        );
      }
      report.completed = true;
    } finally {
      save();
      await f.close();
    }
  },
  2_600_000,
);
