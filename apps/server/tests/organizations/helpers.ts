import type { EmailDelivery } from "../../src/auth/email";
import { Organizations } from "../../src/organizations/service";
import { authFixture } from "../auth/helpers";

export async function organizationFixture(deliver?: EmailDelivery, httpPort = 0) {
  const f = await authFixture(deliver, httpPort);
  const owner = await f.owner();
  const organizations = new Organizations(f.auth);
  async function write(
    cookie: string,
    path: string,
    body: unknown = {},
    key = crypto.randomUUID(),
  ) {
    return f.http(path, body, cookie, { "Idempotency-Key": key });
  }
  async function success(response: Promise<Response>) {
    const result = await response;
    const body = await result.json();
    if (result.status !== 200)
      throw new Error(`Organization request failed (${result.status}): ${JSON.stringify(body)}`);
    return body;
  }
  const initial = await success(
    write(owner.cookie, "/v1/organizations", {
      name: "First organization",
      slug: "first-organization",
    }),
  );
  const path = `/v1/organizations/${initial.organization.id}`;
  async function account(email: string) {
    await f.signup(email);
    await f.verify(email);
    const device = await f.login(email);
    const self = await success(f.http("/v1/auth/session", undefined, device.cookie));
    return { ...device, userId: self.user.id as string, email };
  }
  async function invite(
    cookie: string,
    email: string,
    role = "member",
    groups: string[] = [],
    base = path,
  ) {
    return (
      await success(write(cookie, `${base}/invitations`, { email, role, workgroup_ids: groups }))
    ).invitation;
  }
  async function join(
    device: { cookie: string; email: string },
    role = "member",
    groups: string[] = [],
    base = path,
  ) {
    const invitation = await invite(owner.cookie, device.email, role, groups, base);
    const result = await success(write(device.cookie, `/v1/invitations/${invitation.id}/accept`));
    return { ...result, invitation };
  }
  async function context(cookie: string, base = path) {
    return success(f.http(base, undefined, cookie));
  }
  return {
    ...f,
    owner,
    organizations,
    initial,
    path,
    write,
    success,
    account,
    invite,
    join,
    context,
  };
}
