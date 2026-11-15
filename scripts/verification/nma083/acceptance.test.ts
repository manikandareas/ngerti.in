import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { acceptanceFixture } from "./fixture";

test("three people retain private Team-agent work across organizations, concurrency, lost acknowledgements and removal", async () => {
  const directory = resolve(import.meta.dir, "../../../docs/verification/nma-083");
  mkdirSync(directory, { recursive: true });
  const checks: { name: string; status: "pass"; observations?: unknown }[] = [];
  const report = {
    started_at: new Date().toISOString(),
    planned: 10,
    checks,
    transport: "real_loopback_http",
    database: "disposable_postgresql_18.1",
    native_provider_and_machine: "controlled_fixtures_separate_from_live_evidence",
    completed: false,
  };
  const save = () =>
    Bun.write(resolve(directory, "actor-matrix.json"), `${JSON.stringify(report, null, 2)}\n`);
  const check = async (name: string, observations?: unknown) => {
    checks.push({ name, status: "pass", observations });
    await save();
  };
  await save();
  const f = await acceptanceFixture();
  const json = (
    cookie: string,
    path: string,
    body?: unknown,
    organization?: string,
    key?: string,
  ) => f.success(f.request(cookie, path, body, organization, key));
  try {
    const first = f.initial.organization.id;
    const second = f.second.id;
    const roles = [];
    for (const [cookie, organization] of [
      [f.owner.cookie, first],
      [f.alice.cookie, first],
      [f.bob.cookie, first],
      [f.alice.cookie, second],
      [f.bob.cookie, second],
    ]) {
      const access = await json(cookie!, `/v1/organizations/${organization}`);
      roles.push(access.role);
    }
    expect(roles).toEqual(["owner", "member", "admin", "admin", "owner"]);
    expect(new Set(f.defaults.map((entry) => entry.agent_id)).size).toBe(5);
    expect((await json(f.alice.cookie, f.path)).workgroup_ids).toEqual([f.groups[0].id]);
    expect((await json(f.bob.cookie, f.path)).workgroup_ids).toEqual([f.groups[1].id]);
    await check("declared_roles_workgroups_and_five_private_defaults", {
      roles,
      organizations: 2,
      people: 3,
      outsiders: 1,
    });

    for (const organization of [first, second])
      expect(
        (await f.request(f.outsider.cookie, "/v1/entities/agent", undefined, organization)).status,
      ).toBe(403);
    expect((await f.request(f.owner.cookie, "/v1/entities/agent", undefined, second)).status).toBe(
      403,
    );
    await check("outsider_and_nonmember_denied_in_both_organizations");

    const lanes = [f.ownerLane, f.aliceLane, f.bobLane];
    const admissions: {
      lane: (typeof lanes)[number];
      key: string;
      body: { thread_id: string; agent_id: string; text: string };
      admitted: { run: { id: string } };
    }[] = [];
    for (const [index, lane] of lanes.entries()) {
      const key = crypto.randomUUID();
      const body = {
        thread_id: lane.thread.id,
        agent_id: lane.agent.id,
        text: `Private person ${index}: ${crypto.randomUUID()}`,
      };
      const admitted = await json(lane.cookie, "/v1/runs", body, first, key);
      admissions.push({ lane, key, body, admitted });
    }
    await f.background.tick();
    await f.background.idle();
    for (const { lane, key, body, admitted } of admissions) {
      const replay = await json(lane.cookie, "/v1/runs", body, first, key);
      expect(replay.run.id).toBe(admitted.run.id);
      expect((await json(lane.cookie, `/v1/entities/run/${admitted.run.id}`)).status).toBe(
        "succeeded",
      );
      for (const other of lanes.filter((entry) => entry !== lane))
        expect(
          (await f.request(other.cookie, `/v1/threads/${lane.thread.id}/snapshot`)).status,
        ).toBe(404);
    }
    expect(f.calls.length).toBe(3);
    await check("same_team_agent_three_private_runs_and_lost_acknowledgement_replay", {
      runs: 3,
      private_denials: 6,
    });

    const privateData = [];
    for (const [index, lane] of lanes.entries()) {
      const marker = `Private upload and memory for person ${index}`;
      const memory = await json(lane.cookie, "/v1/learning/memories/write", {
        context: { agent_id: lane.agent.id, thread_id: lane.thread.id },
        memory_id: crypto.randomUUID(),
        expected_revision: 0,
        visibility: "dm_private",
        text: marker,
      });
      const workspace = await json(
        lane.cookie,
        `/v1/threads/${lane.thread.id}/workspace?agent_id=${lane.agent.id}`,
      );
      const artifact = await json(lane.cookie, `/v1/workspaces/${workspace.id}/uploads`, {
        name: "private.txt",
        media_type: "text/plain",
        content_base64: Buffer.from(marker).toString("base64"),
      });
      const content = await f.request(
        lane.cookie,
        `/v1/artifacts/${artifact.id}/content?workspace_id=${workspace.id}`,
      );
      expect(content.status).toBe(200);
      expect(await content.text()).toBe(marker);
      for (const other of lanes.filter((entry) => entry !== lane)) {
        for (const [kind, entity] of [
          ["memory", memory],
          ["artifact", artifact],
          ["workspace", workspace],
        ] as const)
          expect((await f.request(other.cookie, `/v1/entities/${kind}/${entity.id}`)).status).toBe(
            404,
          );
        expect(
          (
            await f.request(
              other.cookie,
              `/v1/artifacts/${artifact.id}/content?workspace_id=${workspace.id}`,
            )
          ).status,
        ).toBe(404);
      }
      privateData.push({ lane, artifact, workspace, memory });
    }
    await check("private_memory_upload_artifact_bytes_and_workspace_even_from_admin", {
      private_denials: 24,
    });

    for (const lane of lanes) {
      const knowledge = await json(lane.cookie, "/v1/entities/published_knowledge");
      expect(knowledge.map((entry: { id: string }) => entry.id)).toContain(f.publication.id);
      const skills = await json(
        lane.cookie,
        `/v1/learning/skills?agent_id=${lane.agent.id}&thread_id=${lane.thread.id}`,
      );
      expect(JSON.stringify(skills)).toContain(f.publishedSkill.skill.id);
    }
    expect(
      await json(f.alice.cookie, "/v1/entities/published_knowledge", undefined, second),
    ).toEqual([]);
    await check(
      "explicit_published_knowledge_and_pinned_skill_are_shared_only_in_their_organization",
    );

    for (const lane of lanes) {
      const connections = await json(lane.cookie, "/v1/entities/connection");
      expect(connections.map((entry: { id: string }) => entry.id)).toContain(lane.connection.id);
      for (const other of lanes.filter((entry) => entry !== lane))
        expect(connections.map((entry: { id: string }) => entry.id)).not.toContain(
          other.connection.id,
        );
    }
    const secondDefaults = f.defaults[3];
    expect(
      (
        await f.request(
          f.alice.cookie,
          `/v1/threads/${f.aliceLane.thread.id}/snapshot`,
          undefined,
          second,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await f.request(
          f.alice.cookie,
          `/v1/threads/${secondDefaults.thread_id}/snapshot`,
          undefined,
          first,
        )
      ).status,
    ).toBe(404);
    await check("connection_and_cross_organization_account_switch_isolation");

    const latencies: number[] = [];
    await Promise.all(
      lanes.map(async (lane) => {
        for (let i = 0; i < 12; i++) {
          const start = performance.now();
          const snapshot = await json(lane.cookie, `/v1/threads/${lane.thread.id}/snapshot`);
          expect(
            snapshot.messages.some(
              (entry: { text: string }) =>
                entry.text === admissions.find((entry) => entry.lane === lane)!.body.text,
            ),
          ).toBe(true);
          latencies.push(performance.now() - start);
        }
      }),
    );
    latencies.sort((a, b) => a - b);
    await check("declared_three_client_concurrent_snapshot_workload", {
      clients: 3,
      samples: latencies.length,
      requests_per_client: 12,
      p95_http_snapshot_ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
      max_http_snapshot_ms: latencies.at(-1),
      rss_bytes: process.memoryUsage().rss,
      production_capacity_claim: false,
    });

    const queuedKey = crypto.randomUUID();
    const queuedBody = {
      thread_id: f.aliceLane.thread.id,
      agent_id: f.aliceLane.agent.id,
      text: "Fence this queued work on removal",
    };
    const queued = await json(f.alice.cookie, "/v1/runs", queuedBody, first, queuedKey);
    const routine = await json(f.alice.cookie, "/v1/routines", {
      thread_id: f.aliceLane.thread.id,
      agent_id: f.aliceLane.agent.id,
      instruction: "Retain this scheduled responsibility",
      schedule: { type: "once", at: new Date(Date.now() + 60000).toISOString() },
      timezone: "UTC",
    });
    await f.success(f.write(f.bob.cookie, `${f.path}/members/${f.joined.membership.id}/remove`));
    expect((await f.request(f.alice.cookie, `/v1/entities/run/${queued.run.id}`)).status).toBe(403);
    expect((await f.request(f.alice.cookie, `/v1/entities/routine/${routine.id}`)).status).toBe(
      403,
    );
    const callsBefore = f.calls.length;
    await f.background.tick();
    await f.background.idle();
    expect(f.calls.length).toBe(callsBefore);
    expect((await json(f.alice.cookie, "/v1/data/provision", {}, second)).agent_id).toBe(
      secondDefaults.agent_id,
    );
    await check(
      "member_removal_fences_queue_responsibility_and_delivery_but_preserves_other_organization",
    );

    await f.join(f.alice, "member", [f.groups[0].id]);
    expect((await f.request(f.alice.cookie, "/v1/runs", queuedBody, first, queuedKey)).status).toBe(
      403,
    );
    for (const path of [
      `/v1/entities/memory/${privateData[1]!.memory.id}`,
      `/v1/threads/${f.aliceLane.thread.id}/snapshot`,
    ])
      expect((await f.request(f.alice.cookie, path)).status).toBe(200);
    await f.background.tick();
    await f.background.idle();
    expect(f.calls.length).toBe(callsBefore);
    await check("rejoining_preserves_own_history_but_does_not_resume_work_or_replay_old_receipts");

    expect(
      (await json(f.owner.cookie, `/v1/threads/${f.ownerLane.thread.id}/snapshot`)).runs.some(
        (entry: { status: string }) => entry.status === "succeeded",
      ),
    ).toBe(true);
    expect(
      (await json(f.bob.cookie, `/v1/threads/${f.bobLane.thread.id}/snapshot`)).runs.some(
        (entry: { status: string }) => entry.status === "succeeded",
      ),
    ).toBe(true);
    await check("other_people_retain_completed_work_after_member_offboarding");
    expect(checks.length).toBe(report.planned);
    report.completed = true;
  } finally {
    await f.close();
    await save();
  }
}, 120000);
