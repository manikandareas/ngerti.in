import type { AuthFixtureTransport } from "../../../apps/server/tests/auth/helpers";
import { readinessFixture } from "../../../apps/server/tests/organizations/readiness-helpers";

// Synthetic people and controlled native transports; HTTP, PostgreSQL and product scope are real.
export async function acceptanceFixture(port = 0, transport?: AuthFixtureTransport) {
  const f = await readinessFixture(undefined, undefined, undefined, port, false, transport);
  try {
    f.serve((request) => f.api.handle(request));
    const request = (
      cookie: string,
      path: string,
      body?: unknown,
      organization = f.initial.organization.id,
      key: string = crypto.randomUUID(),
    ) =>
      f.http(path, body, cookie, {
        "X-Ngertiin-Organization": organization,
        "Idempotency-Key": key,
      });
    const bob = await f.account("bob@example.test");
    const outsider = await f.account("outsider@example.test");
    const groups = [];
    for (const name of ["Engineering", "Operations"])
      groups.push(
        (await f.success(f.write(f.owner.cookie, `${f.path}/workgroups`, { name }))).workgroup,
      );
    const bobMembership = await f.join(bob, "admin", [groups[1].id]);
    await f.success(
      f.write(f.owner.cookie, `${f.path}/workgroups/${groups[0].id}/members`, {
        membership_id: f.joined.membership.id,
        present: true,
      }),
    );
    await f.organizations.grantCreation(bob.email, 1);
    const second = (
      await f.success(
        f.write(bob.cookie, "/v1/organizations", {
          name: "Second organization",
          slug: "second-organization",
        }),
      )
    ).organization;
    const invitation = await f.invite(
      bob.cookie,
      f.alice.email,
      "admin",
      [],
      `/v1/organizations/${second.id}`,
    );
    await f.success(f.write(f.alice.cookie, `/v1/invitations/${invitation.id}/accept`));
    const ownerLane = await f.lane(f.owner.cookie, "codex");
    const aliceLane = await f.lane(f.alice.cookie, "codex", ownerLane.agent);
    const bobLane = await f.lane(bob.cookie, "codex", ownerLane.agent);
    const defaults = [];
    for (const [cookie, organization] of [
      [f.owner.cookie, f.initial.organization.id],
      [f.alice.cookie, f.initial.organization.id],
      [bob.cookie, f.initial.organization.id],
      [f.alice.cookie, second.id],
      [bob.cookie, second.id],
    ])
      defaults.push(await f.success(request(cookie!, "/v1/data/provision", {}, organization)));
    const publication = await f.success(
      request(f.owner.cookie, `/v1/data/agents/${ownerLane.agent.id}/knowledge`, {
        text: "Published operating instructions for authorized Team members.",
      }),
    );
    const publishedSkill = await f.success(
      request(f.owner.cookie, `/v1/data/team-agents/${ownerLane.agent.id}/skills/publish`, {
        expected_revision: 0,
        name: "acceptance-shared-instructions",
        package: {
          description: "Explicitly published acceptance instructions",
          instructions: "Read only the current user's authorized data.",
        },
      }),
    );
    return {
      ...f,
      request,
      bob,
      outsider,
      bobMembership,
      second,
      groups,
      ownerLane,
      aliceLane,
      bobLane,
      defaults,
      publication,
      publishedSkill,
    };
  } catch (error) {
    await f.close();
    throw error;
  }
}
