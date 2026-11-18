import { createApi } from "./api";
import { Authentication } from "./auth/service";
import { Background } from "./background";
import { developmentConfig } from "./config";
import { API_READINESS_GATE, CONTRACT_VERSION } from "./contracts";
import { JevRouter } from "./groups/router";
import { HarnessAccounts } from "./harness/accounts";
import { AcpAccounts } from "./harness/acp/accounts";
import { AcpAdapter } from "./harness/acp/adapter";
import { ApiKeyChecks } from "./harness/api-key-checks";
import { HarnessBroker } from "./harness/broker";
import { CodexAccounts } from "./harness/codex/accounts";
import { CredentialContexts } from "./harness/context";
import { CredentialStorage } from "./harness/credential-storage";
import { LocalAccounts } from "./harness/local-accounts";
import { LocalProfiles } from "./harness/local-profile";
import { HarnessLoginReadiness } from "./harness/login-readiness";
import { MuseAccounts } from "./harness/muse/accounts";
import { MuseAdapter } from "./harness/muse/adapter";
import { configureNativeStorage } from "./harness/native-storage";
import { HarnessRuntime } from "./harness/runtime";
import { ProductTools } from "./harness/tools";
import { HarnessUpdater } from "./harness/updater";
import { Lifecycle } from "./lifecycle";
import { readMachineConfiguration } from "./machines/config";
import { ExecutionDomains } from "./machines/domains";
import { Machines } from "./machines/service";
import { publishRuntime } from "./runtime-record";
import { Store } from "./store";

type ApplicationConfig = ReturnType<typeof developmentConfig>;
export async function startApplication(config: ApplicationConfig = developmentConfig()) {
  const store = await Store.open(config.database, config.owner_id, {
    connectionString: config.databaseUrl,
    schema: config.databaseSchema,
  });
  const cleanup: (() => Promise<unknown>)[] = [() => store.close()];
  try {
    if (config.authentication.schema === store.schema)
      throw new Error("Authentication and application schemas must be separate.");
    const authentication = await Authentication.open(
      config.authentication,
      config.databaseUrl as string,
      config.owner_id,
    );
    cleanup.push(() => authentication.close());
    const lifecycle = await Lifecycle.open(
      store,
      config.groupRouter === "jev" ? new JevRouter(config.typesafeApiKey as string) : undefined,
    );
    const machines = await Machines.open(lifecycle, readMachineConfiguration(config.stateDir));
    cleanup.push(() => machines.close());
    const domains = ExecutionDomains.open(lifecycle, config.stateDir);
    cleanup.push(() => domains.close());
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
    const localProfiles =
      config.authentication.allowInsecureLoopback &&
      config.authentication.email.delivery === "local"
        ? new LocalProfiles(config.owner_id)
        : undefined;
    const credentials = new CredentialContexts(
      config.stateDir,
      undefined,
      config.providerMasterKeyFile,
      localProfiles,
    );
    await configureNativeStorage(
      config.stateDir,
      process.env.APP_ENV !== "production" && config.authentication.allowInsecureLoopback,
    );
    const runtime = new HarnessRuntime(config.harnessExecutables, config.nativeCodexExecutable);
    const updater = new HarnessUpdater(runtime, config.stateDir);
    await updater.recover();
    cleanup.push(() => updater.close());
    const acpAdapters = {
      claude: new AcpAdapter(
        "claude",
        () => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`,
      ),
      opencode: new AcpAdapter(
        "opencode",
        () => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`,
      ),
      pi: new AcpAdapter("pi", () => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
    };
    const adapters = {
      codex: new AcpAdapter(
        "codex",
        () => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`,
        { native_codex: config.nativeCodexExecutable },
      ),
      muse: new MuseAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
      ...acpAdapters,
    };
    const broker = new HarnessBroker(lifecycle, credentials, tools, adapters, runtime.detect);
    cleanup.push(() => broker.close());
    const codexAccounts = new CodexAccounts(broker.connections, credentials, async () =>
      runtime.nativeCodex(),
    );
    const museAccounts = new MuseAccounts(broker.connections, credentials, async () =>
      runtime.detect("muse"),
    );
    const accounts = new HarnessAccounts(
      broker.connections,
      {
        codex: codexAccounts,
        muse: museAccounts,
        ...Object.fromEntries(
          Object.entries(acpAdapters).map(([harness, adapter]) => [
            harness,
            new AcpAccounts(broker.connections, credentials, adapter, runtime.detect),
          ]),
        ),
      },
      localProfiles
        ? new AcpAccounts(broker.connections, credentials, adapters.codex, runtime.detect)
        : undefined,
    );
    cleanup.push(() => accounts.close());
    const background = new Background(lifecycle, broker.executors(), (code) =>
      console.error(JSON.stringify({ event: "background.error", code })),
    );
    cleanup.push(() => background.stop());
    const app = await createApi(lifecycle, background, {
      authentication,
      connections: broker.connections,
      tools,
      broker,
      accounts,
      apiKeyChecks: new ApiKeyChecks(adapters, runtime.detect),
      localAccounts: localProfiles
        ? new LocalAccounts(localProfiles, broker.connections, accounts, runtime.detect)
        : undefined,
      credentialStorage: new CredentialStorage(config.stateDir, config.providerMasterKeyFile),
      detect: runtime.detect,
      updater,
      loginReadiness: new HarnessLoginReadiness(runtime, config.stateDir),
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
        identity_file: config.installationFile,
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
        await domains.close();
        await accounts.close();
        await httpStopped;
        await authentication.close();
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
