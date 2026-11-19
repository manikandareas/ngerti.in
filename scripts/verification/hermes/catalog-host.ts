import { createHash } from "node:crypto";
import { renameSync, writeFileSync } from "node:fs";
import { developmentConfig } from "../../../apps/server/src/config";
import type {
  AppHost,
  AppSessionConfig,
  AppSessionIdentity,
} from "../../../apps/server/src/integrations/host";
import { startApplication } from "../../../apps/server/src/main";

const toolkit = "harbor_docs";
const readSignal = "HARBOR_READ_SIGNAL";
const updateSignal = "HARBOR_UPDATE_SIGNAL";
const port = 8430;
const signal = "HARBOR-SIGNAL-574";
const targetFile = process.env.HERMES_CATALOG_FIXTURE_TARGET;
const certificate = process.env.HERMES_CATALOG_FIXTURE_CERT;
const privateKey = process.env.HERMES_CATALOG_FIXTURE_KEY;
if (!certificate || !privateKey) throw new Error("Set the fixture TLS files.");

function accountId(user: string) {
  return `harbor:${createHash("sha256").update(user).digest("hex").slice(0, 24)}`;
}

class HarborHost implements AppHost {
  readonly sessions = new Map<string, { identity: AppSessionIdentity; config: AppSessionConfig }>();

  async catalog(_user: string, search: string) {
    const items = [{ slug: toolkit, name: "Harbor Docs", connected: false, tools_count: 2 }];
    return {
      items: items.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
      metadata_complete: true,
    };
  }

  async connect(user: string, name: string) {
    if (name !== toolkit) throw new Error("Unknown fixture application.");
    return { account_id: accountId(user), connect_url: `https://127.0.0.1:${port}/authorized` };
  }

  async accounts(user: string) {
    return [{ id: accountId(user), toolkit, active: true }];
  }

  async session(user: string, config: AppSessionConfig) {
    const account = accountId(user);
    if (config.toolkit !== toolkit || config.account_id !== account)
      throw new Error("Unexpected fixture session scope.");
    const session = crypto.randomUUID();
    this.sessions.set(session, { identity: { user, account }, config });
    return session;
  }

  private current(session: string, expected?: AppSessionIdentity) {
    const item = this.sessions.get(session);
    if (
      !item ||
      item.identity.user !== expected?.user ||
      item.identity.account !== expected.account
    )
      throw new Error("Unexpected fixture session identity.");
    return item.config;
  }

  async search(session: string, _query: string, expected?: AppSessionIdentity) {
    this.current(session, expected);
    const input_schema = { type: "object", additionalProperties: false, properties: {} };
    return [
      { slug: readSignal, toolkit, description: "Read the current Harbor signal.", input_schema },
      {
        slug: updateSignal,
        toolkit,
        description: "Update the Harbor signal.",
        input_schema: {
          ...input_schema,
          required: ["signal"],
          properties: { signal: { type: "string" } },
        },
      },
    ];
  }

  async execute(
    session: string,
    account: string,
    tool: string,
    args: Record<string, unknown>,
    authorize: () => void | Promise<void>,
    expected?: AppSessionIdentity,
  ) {
    const config = this.current(session, expected);
    if (account !== expected?.account || !config.tools?.includes(tool))
      throw new Error("Unexpected fixture execution.");
    if (
      tool === updateSignal &&
      targetFile &&
      typeof args.signal === "string" &&
      /^HARBOR-[A-Z0-9-]+$/.test(args.signal) &&
      Object.keys(args).length === 1
    ) {
      console.log(
        JSON.stringify({
          event: "harbor_native_update_admission",
          tool,
          at: new Date().toISOString(),
        }),
      );
      await authorize();
      const staged = `${targetFile}.${crypto.randomUUID()}.tmp`;
      writeFileSync(staged, `${args.signal}\n`, { flag: "wx", mode: 0o600 });
      renameSync(staged, targetFile);
      console.log(JSON.stringify({ event: "harbor_update", tool, at: new Date().toISOString() }));
      return {
        data: { signal: args.signal },
        state: "succeeded" as const,
        log_id: "harbor-signal-update",
      };
    }
    if (tool !== readSignal || Object.keys(args).length)
      throw new Error("Unexpected fixture execution.");
    await authorize();
    console.log(JSON.stringify({ event: "harbor_read", tool, at: new Date().toISOString() }));
    const current = targetFile ? (await Bun.file(targetFile).text()).trim() : signal;
    return { data: { signal: current }, state: "succeeded" as const, log_id: "harbor-signal-read" };
  }
}

const authorization = Bun.serve({
  hostname: "127.0.0.1",
  port,
  tls: { cert: Bun.file(certificate), key: Bun.file(privateKey) },
  fetch(request) {
    if (new URL(request.url).pathname !== "/authorized") return new Response(null, { status: 404 });
    return new Response("<title>Harbor Docs</title><h1>Harbor Docs authorized</h1>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
});
const app = await startApplication(developmentConfig(), new HarborHost());
const stop = () => {
  authorization.stop(true);
  void app.stop().then(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
