import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { expect as browserExpect, chromium } from "playwright/test";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { AcpAccounts } from "../../../apps/server/src/harness/acp/accounts";
import { AcpAdapter } from "../../../apps/server/src/harness/acp/adapter";
import { profileLaunch } from "../../../apps/server/src/harness/acp/profiles";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { HarnessError } from "../../../apps/server/src/harness/contracts";
import { LocalAccounts } from "../../../apps/server/src/harness/local-accounts";
import { LocalProfiles } from "../../../apps/server/src/harness/local-profile";
import {
  configureNativeStorage,
  nativeStorageReady,
} from "../../../apps/server/src/harness/native-storage";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { DomainRuntime } from "../../../apps/server/src/machines/domain-runtime";
import { ExecutionDomains } from "../../../apps/server/src/machines/domains";
import { Machines } from "../../../apps/server/src/machines/service";
import { ScopedData } from "../../../apps/server/src/organizations/data";
import { fixturePassword } from "../../../apps/server/tests/auth/helpers";
import { organizationFixture } from "../../../apps/server/tests/organizations/helpers";
import { retainedCodex, selectedPiSumopod } from "../acp/native-credentials";
import { claudeProviderFixture } from "./claude-provider";

const selectedHarness = process.env.NGERTIIN_HERMES_ACP_BROWSER;
const useSumopod = selectedHarness === "opencode-sumopod";
const harness = useSumopod
  ? "opencode"
  : selectedHarness === "opencode" || selectedHarness === "claude"
    ? selectedHarness
    : "codex";
const isCodex = harness === "codex";
const label = { codex: "Codex", claude: "Claude Code", opencode: "OpenCode" }[harness];
const billing = useSumopod
  ? "api_key"
  : { codex: "subscription", claude: "api_key", opencode: "free" }[harness];

test.skipIf(!useSumopod && selectedHarness !== harness)(
  `${label} ${billing} workspace delivery and provider outcome through the authenticated browser`,
  async () => {
    const tokens = isCodex ? await retainedCodex() : null;
    const sumopod = useSumopod ? selectedPiSumopod() : null;
    const sumopodModel = sumopod?.models.find(({ id }) => id === "deepseek-v4-flash");
    if (
      sumopod &&
      (sumopod.baseUrl.replace(/\/$/, "") !== "https://ai.sumopod.com/v1" ||
        sumopod.api !== "openai-completions" ||
        !sumopodModel)
    )
      throw new Error("The selected Sumopod DeepSeek configuration is unavailable.");
    const work = resolve(import.meta.dir, "../../../.dev/verification/hermes");
    const output = join(work, `acp-${useSumopod ? "opencode-sumopod" : harness}-browser`);
    const dist = join(work, "acp-codex-browser-web");
    if (!(await Bun.file(join(dist, "index.html")).exists()))
      throw new Error("Build the verification Web client.");
    await mkdir(output, { recursive: true, mode: 0o700 });
    const runtime = new HarnessRuntime();
    const available = await runtime.detect(harness);
    const native = isCodex ? await runtime.nativeCodex() : available;
    expect(available.state).toBe("supported");
    expect(native.state).toBe("supported");
    const browser = await chromium.launch({ executablePath: chromium.executablePath() });
    const f = await organizationFixture().catch(async (error) => {
      await browser.close();
      throw error;
    });
    const { lifecycle, store } = f.domain;
    const domainsRuntime = new DomainRuntime(f.domain.dir, f.domain.owner, {
      version: 1,
      max_domains: 1,
      memory_mib: harness === "claude" || useSumopod ? 1536 : 1280,
      cpus: harness === "claude" || useSumopod ? 2 : 1,
      pids: 512,
    });
    const legacy = await Machines.open(lifecycle, null);
    const domains = new ExecutionDomains(lifecycle, domainsRuntime);
    const tools = await ProductTools.open(lifecycle);
    let connectionId: string | undefined;
    let domainId: string | undefined;
    const model = {
      codex: "gpt-6.1-sol",
      claude: "haiku",
      opencode: useSumopod ? "sumopod/deepseek-v4-flash" : "opencode/deepseek-v4.1-flash-free",
    }[harness];
    const file = useSumopod ? "opencode-acp-sumopod-cedar.txt" : `${harness}-acp-willow.txt`;
    const contents = useSumopod
      ? "OPENCODE-SUMOPOD-CEDAR-7631"
      : `${harness.toUpperCase()}-ACP-WILLOW-9163`;
    const fixture = harness === "claude" ? claudeProviderFixture(file, contents) : null;
    const fixtureClaudeConfig = join(f.domain.dir, "fixture-claude");
    if (fixture) {
      // The model fixture has no native Auto classifier. Use Claude's Manual mode and answer requests in the UI.
      await mkdir(fixtureClaudeConfig, { mode: 0o700 });
      await Bun.write(
        join(fixtureClaudeConfig, "settings.json"),
        '{"permissions":{"defaultMode":"default"}}',
      );
    }
    let profiles: LocalProfiles | undefined;
    if (sumopod && sumopodModel) {
      const home = join(f.domain.dir, "opencode-sumopod-profile");
      const config = join(home, ".config", "opencode");
      await mkdir(config, { recursive: true, mode: 0o700 });
      await writeFile(
        join(config, "opencode.json"),
        JSON.stringify({
          enabled_providers: ["sumopod"],
          provider: {
            sumopod: {
              name: "Sumopod",
              npm: "@ai-sdk/openai-compatible",
              options: {
                baseURL: sumopod.baseUrl,
                apiKey: "{env:NGERTIIN_VERIFICATION_SUMOPOD_KEY}",
              },
              models: { [sumopodModel.id]: { name: "DeepSeek V4 Flash" } },
            },
          },
        }),
        { mode: 0o600 },
      );
      profiles = new LocalProfiles(
        f.domain.owner,
        { NGERTIIN_VERIFICATION_SUMOPOD_KEY: sumopod.apiKey },
        home,
      );
    }
    const fixtureRef = crypto.randomUUID();
    const credentials = new CredentialContexts(
      f.domain.dir,
      fixture
        ? (id) => {
            if (id !== fixtureRef) throw new HarnessError("CREDENTIAL_MISSING");
            return fixture.key;
          }
        : undefined,
      undefined,
      profiles,
    );
    const digest = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
    const identity = tokens?.chatgptAccountId ?? fixture?.key ?? sumopod?.apiKey;
    const providerAccount = identity ? digest(Buffer.from(identity)) : null;
    const report: Record<string, unknown> = {
      date: new Date().toISOString().slice(0, 10),
      surface:
        "Chrome Ngertiin Web with real authenticated HTTP, PostgreSQL, and a disposable Cua domain",
      harness: fixture
        ? `Pinned Claude ACP ${available.version} and Claude Agent SDK 0.3.323`
        : `${label} ACP ${available.version}, native ${label} ${native.version}`,
      provider: {
        codex: "Previously selected live OpenAI Subscription, retained short-lived access token",
        claude: "Local Messages API fixture with a synthetic key; no Anthropic inference",
        opencode: useSumopod
          ? "Sumopod live, owner-approved API key from the Pi profile"
          : "OpenCode Free live, no API key",
      }[harness],
      completed: false,
      ...(fixture && { fixturePermissionMode: "Manual", cuaPolicy: domainsRuntime.policy }),
    };
    await configureNativeStorage(f.domain.dir, true);
    credentials.codexTokens = async (id, refresh) => {
      if (!tokens || !connectionId || id !== connectionId || refresh)
        throw new HarnessError("AUTH_REJECTED");
      await broker.connections.authorize(await broker.connections.get(id));
      return tokens;
    };
    let api: Awaited<ReturnType<typeof createApi>> | undefined;
    const toolRequests: { method: string; tool?: string; status?: number; elapsedMs?: number }[] =
      [];
    const toolServer = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      idleTimeout: 90,
      fetch: async (request) => {
        if (!api || new URL(request.url).pathname !== "/v1/harness/tools")
          return new Response(null, { status: 404 });
        if (!fixture) return api.handle(request);
        const frame = await request.clone().json();
        const entry: (typeof toolRequests)[number] = { method: frame.method };
        if (frame.method === "tools/call") entry.tool = frame.params.name;
        toolRequests.push(entry);
        console.info(JSON.stringify({ event: "verification.tool_request", ...entry }));
        const started = performance.now();
        const response = await api.handle(request);
        entry.status = response.status;
        entry.elapsedMs = Math.round(performance.now() - started);
        console.info(JSON.stringify({ event: "verification.tool_response", ...entry }));
        return response;
      },
    });
    const adapter = new AcpAdapter(
      harness,
      () => `http://127.0.0.1:${toolServer.port}/v1/harness/tools`,
      fixture
        ? {
            diagnostic: (line) => {
              if (line.includes("claude auth status did not answer within 5 s"))
                report.nativeAuthProbeTimedOut = true;
            },
            launch: (id, context, options) =>
              profileLaunch(
                id,
                {
                  ...context,
                  env: {
                    ...context.env,
                    CLAUDE_CONFIG_DIR: fixtureClaudeConfig,
                    ANTHROPIC_BASE_URL: `http://127.0.0.1:${fixture.server.port}`,
                    ENABLE_TOOL_SEARCH: "false",
                    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
                    DISABLE_TELEMETRY: "1",
                    DISABLE_ERROR_REPORTING: "1",
                  },
                },
                options,
              ),
          }
        : useSumopod
          ? {
              diagnostic: (line) => {
                const failure =
                  /ModuleNotFound|MODULE_NOT_FOUND|ECONNREFUSED|ETIMEDOUT|MCP error|ServeError|No models available/i.exec(
                    line,
                  )?.[0];
                if (failure) report.lastNativeSetupSignal = failure;
              },
            }
          : isCodex
            ? { native_codex: native.executable! }
            : undefined,
    );
    const broker = new HarnessBroker(
      lifecycle,
      credentials,
      tools,
      { [harness]: adapter },
      runtime.detect,
    );
    const background = new Background(lifecycle, broker.executors());
    const accounts =
      profiles && new AcpAccounts(broker.connections, credentials, adapter, runtime.detect);
    const org = f.initial.organization.id;
    const request = (path: string, body?: unknown) =>
      f.http(path, body, f.owner.cookie, {
        "X-Ngertiin-Organization": org,
        "Idempotency-Key": crypto.randomUUID(),
      });
    try {
      expect(nativeStorageReady(f.domain.dir)).toBe(true);
      await f.success(
        f.write(f.owner.cookie, "/v1/data/legacy-binding", {
          organization_id: org,
          legacy_owner_id: f.domain.owner,
        }),
      );
      const app = await createApi(lifecycle, background, {
        authentication: f.auth,
        tools,
        connections: broker.connections,
        broker,
        detect: runtime.detect,
        ...(profiles &&
          accounts && {
            localAccounts: new LocalAccounts(
              profiles,
              broker.connections,
              accounts,
              runtime.detect,
            ),
          }),
      });
      api = app;
      f.serve(async (request) => {
        const url = new URL(request.url);
        if (/^\/(v1|health|api\/auth)(\/|$)/.test(url.pathname)) return app.handle(request);
        const path = resolve(dist, `.${url.pathname}`);
        const asset = path.startsWith(`${dist}/`) ? Bun.file(path) : null;
        return new Response(
          asset && (await asset.exists()) ? asset : Bun.file(join(dist, "index.html")),
        );
      });
      const audience = (
        await f.success(f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }))
      ).audience;
      const agent = await f.success(
        request("/v1/data/team-agents", {
          harness,
          name: `${label} Willow Verification`,
          audience_id: audience.id,
        }),
      );
      const scopedRequest = new Request(`${f.origin}/v1/entities/agent`, {
        headers: { Cookie: f.owner.cookie, "X-Ngertiin-Organization": org },
      });
      await f.auth.authenticate(scopedRequest);
      const scope = await new ScopedData(lifecycle, f.auth).context(scopedRequest);
      if (useSumopod)
        expect(await f.success(request("/v1/connections/local/refresh", {}))).toEqual({
          available: true,
        });
      const connection = await store.withDataContext(scope, async () => {
        if (useSumopod) {
          const selected = (await store.list("connection")).find(
            ({ harness, provider_id, ownership }) =>
              harness === "opencode" && provider_id === "sumopod" && ownership === "personal",
          );
          expect(selected?.authentication.method).toBe("local_config");
          expect(selected?.effective_billing_source).toBe("api_key");
          expect(selected?.models.some(({ id }) => id === model)).toBe(true);
          report.catalog = {
            model,
            provider: selected?.provider_id,
            authentication: selected?.authentication.method,
          };
          return selected!;
        }
        const created = await broker.connections.create({
          harness,
          provider_id: { codex: "openai", claude: "anthropic", opencode: "opencode" }[harness],
          authentication: isCodex
            ? { method: "native_login", billing_source: "subscription" }
            : fixture
              ? { method: "api_key", billing_source: "api_key", credential_ref: fixtureRef }
              : { method: "none", billing_source: "free" },
        });
        connectionId = created.id;
        return created;
      });
      const thread = await f.success(request(`/v1/agents/${agent.id}/dm`, {}));
      // Account-mode test admission stays separate from the existing retained authority.
      const machine = await store.withDataContext(scope, () => domains.resolve());
      domainId = (await machine.snapshot()).id;
      console.info(`Waiting for disposable Cua domain ${domainId}.`);
      await browserExpect
        .poll(
          async () => {
            try {
              await store.withDataContext(scope, () => machine.ready());
              return "ready";
            } catch (error) {
              return error instanceof Error ? error.message : "unknown";
            }
          },
          { timeout: 150_000, intervals: [1000, 2000, 5000] },
        )
        .toBe("ready");
      console.info("Checking working-file I/O in the test domain before inference.");
      const started = performance.now();
      await store.withDataContext(scope, async () => {
        const files = machine.files();
        report.workingFilePreflight = { state: "writing" };
        await files.create(file, Buffer.from(contents));
        report.workingFilePreflight = { state: "reading" };
        expect((await files.read(file)).toString()).toBe(contents);
      });
      report.workingFilePreflight = {
        state: "verified",
        ms: Math.round(performance.now() - started),
      };
      if (!useSumopod) {
        await f.success(
          request("/v1/ai/selections", {
            scope: "conversation",
            thread_id: thread.id,
            agent_id: agent.id,
            harness,
            selection: { connection_id: connection.id, model_id: model, reasoning: null },
          }),
        );
        const session = await request(`/v1/threads/${thread.id}/sessions`, { agent_id: agent.id });
        report.sessionOpenStatus = session.status;
        await f.success(Promise.resolve(session));
      }
      if (!useSumopod) await background.start();
      const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        acceptDownloads: true,
      });
      await page.goto(f.origin);
      await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
      await page.getByLabel("Password", { exact: true }).fill(fixturePassword);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const chat = page.getByRole("main", { name: "Percakapan aktif" });
      await browserExpect(chat).toBeVisible({ timeout: 30_000 });
      const conversation = page.locator(`button[data-thread-id="${thread.id}"]`);
      await conversation.click();
      await browserExpect(conversation).toHaveAttribute("aria-current", "page");
      await page.getByRole("button", { name: "Pilih model", exact: true }).click();
      await page.getByRole("tab", { name: label, exact: true }).click();
      await page
        .getByRole("textbox", { name: "Search models" })
        .fill(useSumopod ? "deepseek-v4-flash" : model);
      const option = page.getByRole("option", {
        name: {
          codex: /^gpt-6\.1-sol\b/,
          claude: /^haiku\b/i,
          opencode: useSumopod ? /deepseek[ -]v4[ -]flash/i : /deepseek-v4\.1-flash-free/,
        }[harness],
      });
      await browserExpect(option).toBeVisible();
      await page.screenshot({ path: join(output, "model.png") });
      const selectionSaved = useSumopod
        ? page.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === "/v1/ai/selections" &&
              response.request().method() === "POST",
          )
        : null;
      await option.click();
      if (selectionSaved) {
        expect((await selectionSaved).ok()).toBe(true);
        const session = await request(`/v1/threads/${thread.id}/sessions`, { agent_id: agent.id });
        report.sessionOpenStatus = session.status;
        await f.success(Promise.resolve(session));
        await background.start();
      }
      const visibleTool = chat
        .getByText(/Creating a file|Updating your file|Reading your file/)
        .first();
      const activity = visibleTool
        .waitFor({ state: "visible", timeout: 290_000 })
        .then(async () => {
          const label = await visibleTool.innerText({ timeout: 3000 });
          await page.screenshot({ path: join(output, "activity.png") });
          return label;
        })
        .catch(() => null);
      await chat
        .getByRole("textbox", { name: "Pesan", exact: true })
        .fill(
          `Read the workspace file ${file} using ngertiin.read_file. Publish that existing file unchanged with ngertiin.publish_artifact as text/plain. Include the returned clickable file reference in your reply.`,
        );
      await chat.getByRole("button", { name: "Kirim", exact: true }).click();
      const fileButton = chat.getByRole("button", { name: `Buka file: ${file}` });
      const snapshot = () => f.success(request(`/v1/threads/${thread.id}/snapshot`));
      const permissions: string[] = [];
      const pendingApproval = chat
        .getByRole("region", { name: "Izinkan tindakan ini?", exact: true })
        .and(chat.locator('[data-interaction-state="pending"]'));
      await browserExpect
        .poll(
          async () => {
            const action = fixture?.calls.at(-1)?.action;
            if (
              fixture &&
              (await pendingApproval.count()) === 1 &&
              (await pendingApproval.isVisible())
            ) {
              const subject = await pendingApproval
                .locator(".conversation-interaction-body > p")
                .innerText({ timeout: 3000 });
              report.latestPermissionSubject = subject;
              const expectedTool =
                action === "read_file"
                  ? /read[ ._-]*file/i
                  : action === "publish_artifact"
                    ? /publish[ ._-]*artifact/i
                    : null;
              const once = pendingApproval.locator('button[data-primary="true"][title="run"]');
              if (
                expectedTool?.test(subject) &&
                !permissions.includes(subject) &&
                (await once.count()) === 1 &&
                (await once.isEnabled())
              ) {
                await page.screenshot({ path: join(output, `approval-${action}.png`) });
                await once.click({ timeout: 5000 });
                permissions.push(subject);
                report.browserRunScopedApprovals = permissions;
              }
            }
            if (
              fixture &&
              (!action || action === "read_file" || action === "publish_artifact") &&
              !(await chat.getByRole("button", { name: "Try again", exact: true }).isVisible())
            )
              return false;
            const run = (await snapshot()).runs.at(-1);
            if (run)
              report.run = {
                status: run.status,
                diagnostic: run.diagnostic,
                product_tools: run.product_tools,
                ...(useSumopod && { preparation: run.preparation }),
              };
            return (
              ["succeeded", "failed", "unknown", "cancelled"].includes(run?.status) ||
              (useSumopod && run?.preparation?.state === "blocked")
            );
          },
          { timeout: 300_000, intervals: [1000, 2000, 3000] },
        )
        .toBe(true);
      const state = await snapshot();
      const run = state.runs.at(-1);
      if (useSumopod && run.preparation?.state === "blocked")
        await page.screenshot({ path: join(output, "preparation-blocked.png") });
      expect(run.provider_selection).toMatchObject({
        harness,
        ...(useSumopod && { provider_id: "sumopod" }),
        connection_id: connection.id,
        model_id: model,
        account_id: providerAccount,
        billing_source: billing,
      });
      if (
        harness === "opencode" &&
        run.status === "failed" &&
        run.diagnostic?.code === "PROVIDER_LIMIT"
      ) {
        const banner = chat.getByText(/Usage limit reached/);
        await browserExpect(banner).toBeVisible();
        await page.screenshot({ path: join(output, "provider-limit.png") });
        expect(run.product_tools).toEqual([]);
        expect(
          state.artifacts.filter((item: { run_id: string }) => item.run_id === run.id),
        ).toEqual([]);
        report.run = {
          id: run.id,
          status: run.status,
          diagnostic: run.diagnostic,
          provider_selection: run.provider_selection,
          product_tools: run.product_tools,
        };
        report.observedProviderLimit = await banner.innerText();
        return;
      }
      expect(run.status, JSON.stringify(run.diagnostic)).toBe("succeeded");
      expect(run.product_tools).toContain("ngertiin.read_file");
      expect(run.product_tools).toContain("ngertiin.publish_artifact");
      const artifact = state.artifacts.find(
        (item: { run_id: string; name: string }) => item.run_id === run.id && item.name === file,
      );
      expect(artifact).toBeDefined();
      await browserExpect(fileButton).toBeVisible();
      const activityLabel = await activity;
      expect(activityLabel).toBeTruthy();
      await page.screenshot({ path: join(output, "answer.png") });
      await fileButton.click();
      await browserExpect(
        page.getByRole("region", { name: `Source code ${file}` }).locator("code"),
      ).toHaveText(contents);
      await page.screenshot({ path: join(output, "file.png") });
      await page.getByRole("button", { name: "Aksi file", exact: true }).click();
      const pendingDownload = page.waitForEvent("download");
      await page.getByRole("menuitem", { name: "Unduh file", exact: true }).click();
      await (await pendingDownload).saveAs(join(output, file));
      const bytes = await Bun.file(join(output, file)).bytes();
      expect(Buffer.from(bytes).toString()).toBe(contents);
      expect(digest(bytes)).toBe(artifact.sha256);
      if (fixture) {
        expect(fixture.calls.map((call) => call.action)).toEqual([
          "read_file",
          "publish_artifact",
          "verified_publish_receipt",
        ]);
        expect(permissions).toEqual([
          "mcp__ngertiin__ngertiin_read_file",
          "mcp__ngertiin__ngertiin_publish_artifact",
        ]);
      }
      report.activity = activityLabel;
      report.run = {
        id: run.id,
        status: run.status,
        provider_selection: run.provider_selection,
        product_tools: run.product_tools,
      };
      report.artifact = {
        id: artifact.id,
        name: file,
        sha256: artifact.sha256,
        bytes: bytes.length,
        contents,
      };
      report.completed = true;
    } finally {
      const saveReport = () =>
        Bun.write(join(output, "verification.json"), JSON.stringify(report, null, 2) + "\n");
      if (fixture) {
        report.providerFixtureCalls = fixture.calls;
        report.providerFixtureToolErrors = fixture.resultErrors;
        report.toolRequests = toolRequests;
        await saveReport();
      }
      await browser.close();
      await background.stop(100);
      await accounts?.close();
      await broker.close();
      await toolServer.stop(true);
      await fixture?.server.stop(true);
      tools.revokeAll();
      await domains.close();
      await legacy.close();
      if (domainId) {
        await domainsRuntime.retire(domainId);
        const removed = Bun.spawn(["docker", "volume", "rm", `ngertiin-domain-${domainId}-home`], {
          stdout: "ignore",
          stderr: "ignore",
        });
        report.disposableDomainVolumeRemoved = (await removed.exited) === 0;
      }
      await configureNativeStorage(f.domain.dir, false);
      await f.close();
      await saveReport();
    }
  },
  540_000,
);
