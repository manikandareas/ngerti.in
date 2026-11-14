import { createApi } from "./api";
import { Authentication } from "./auth/service";
import { Background } from "./background";
import { developmentConfig } from "./config";
import { API_READINESS_GATE, CONTRACT_VERSION } from "./contracts";
import { Conversations } from "./conversations";
import { JevRouter } from "./groups/router";
import { HarnessAccounts } from "./harness/accounts";
import { HarnessBroker } from "./harness/broker";
import { CodexAccounts } from "./harness/codex/accounts";
import { CodexAdapter } from "./harness/codex/adapter";
import { CredentialContexts } from "./harness/context";
import { CredentialStorage } from "./harness/credential-storage";
import { MuseAccounts } from "./harness/muse/accounts";
import { MuseAdapter } from "./harness/muse/adapter";
import { HarnessRuntime } from "./harness/runtime";
import { ProductTools } from "./harness/tools";
import { Lifecycle } from "./lifecycle";
import { readMachineConfiguration } from "./machines/config";
import { Machines } from "./machines/service";
import { publishRuntime } from "./runtime-record";
import { Store } from "./store";

type ApplicationConfig = Omit<ReturnType<typeof developmentConfig>, "authentication"> & {
  authentication?: ReturnType<typeof developmentConfig>["authentication"];
};
export async function startApplication(config: ApplicationConfig = developmentConfig()) {
  const store = await Store.open(config.database, config.owner_id, {
    connectionString: config.databaseUrl,
    schema: config.databaseSchema,
  });
  const cleanup: (() => Promise<unknown>)[] = [() => store.close()];
  try {
    if (config.authentication?.schema === store.schema)
      throw new Error("Authentication and application schemas must be separate.");
    const authentication = config.authentication
      ? await Authentication.open(
          config.authentication,
          config.databaseUrl as string,
          config.owner_id,
        )
      : undefined;
    if (authentication) cleanup.push(() => authentication.close());
    const lifecycle = await Lifecycle.open(
      store,
      config.groupRouter === "jev" ? new JevRouter(config.typesafeApiKey as string) : undefined,
    );
    const machines = await Machines.open(lifecycle, readMachineConfiguration(config.stateDir));
    cleanup.push(() => machines.close());
    await new Conversations(lifecycle).setup();
    const tools = await ProductTools.open(lifecycle, (scope, name) => {
      console.log(
        JSON.stringify({
          event: "product_tool.completed",
          run_id: scope.run_id,
          thread_id: scope.thread_id,
          agent_id: scope.agent_id,
          name,
        }),
      );
    });
    const credentials = new CredentialContexts(config.stateDir);
    const runtime = new HarnessRuntime(config.harnessExecutables);
    const broker = new HarnessBroker(
      lifecycle,
      credentials,
      tools,
      {
        codex: new CodexAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
        muse: new MuseAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
      },
      runtime.detect,
    );
    cleanup.push(() => broker.close());
    const codexAccounts = new CodexAccounts(broker.connections, credentials, async () =>
      runtime.detect("codex"),
    );
    const museAccounts = new MuseAccounts(broker.connections, credentials, async () =>
      runtime.detect("muse"),
    );
    const accounts = new HarnessAccounts(broker.connections, {
      codex: codexAccounts,
      muse: museAccounts,
    });
    cleanup.push(() => Promise.allSettled([codexAccounts.close(), museAccounts.close()]));
    const background = new Background(lifecycle, broker.executors(), (code) =>
      console.error(JSON.stringify({ event: "background.error", code })),
    );
    cleanup.push(() => background.stop());
    const app = await createApi(lifecycle, background, config.token, {
      authentication,
      connections: broker.connections,
      tools,
      broker,
      accounts,
      credentialStorage: new CredentialStorage(config.stateDir),
      detect: runtime.detect,
    });
    cleanup.push(async () => {
      if (app.server) await app.stop(true);
    });
    let closing = false;
    app.listen({ hostname: "127.0.0.1", port: config.port });
    await background.start();
    void machines.recover().then(
      async () =>
        !closing &&
        (await broker.startRecovery(async (runId, code) => {
          const run = await store.get("run", runId);
          console.error(
            JSON.stringify({
              event: "harness.recovery.error",
              run_id: runId,
              thread_id: run.thread_id,
              code,
            }),
          );
        })),
    );
    const record = publishRuntime(config.stateDir, {
      pid: process.pid,
      instance_id: crypto.randomUUID(),
      owner_id: config.owner_id,
      url: `http://127.0.0.1:${app.server?.port}`,
      contract_version: CONTRACT_VERSION,
      manager_id: process.env.NGERTIIN_DESKTOP_MANAGER ?? null,
    });
    console.log(
      JSON.stringify({
        event: "foundation.started",
        url: record.value.url,
        credentials_file: config.installationFile,
        registered_executors: background.executorCount,
        api_readiness_gate: API_READINESS_GATE,
      }),
    );
    let stopping: Promise<void> | undefined;
    async function stop() {
      closing = true;
      stopping ??= (async () => {
        const httpStopped = app.stop(true);
        await background.stop();
        await broker.close();
        await machines.close();
        await Promise.allSettled([codexAccounts.close(), museAccounts.close()]);
        await httpStopped;
        await authentication?.close();
        await store.close();
        record.remove();
      })();
      return stopping;
    }
    return { url: record.value.url, stop };
  } catch (error) {
    for (const close of cleanup.reverse()) await close().catch(() => {});
    throw error;
  }
}

if (import.meta.main) {
  const application = await startApplication();
  const stop = () =>
    void application
      .stop()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
