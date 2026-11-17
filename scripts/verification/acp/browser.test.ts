import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect as browserExpect, chromium } from "playwright/test";
import { AcpAdapter } from "../../../apps/server/src/harness/acp/adapter";
import { Connections } from "../../../apps/server/src/harness/connections";
import { codexFixture } from "../../../apps/server/tests/acp-fixture";
import { fixturePassword } from "../../../apps/server/tests/auth/helpers";
import { readinessFixture } from "../../../apps/server/tests/organizations/readiness-helpers";

for (const [name, viewport] of [
  ["desktop", { width: 1440, height: 1000 }],
  ["mobile", { width: 390, height: 844 }],
] as const)
  test(`${name}: authenticated ACP form, attributed progress and explicit provider selection`, async () => {
    const capture = process.env.NGERTIIN_ACP_BROWSER_CAPTURE ?? "current";
    if (!/^[a-z0-9-]+$/.test(capture)) throw new Error("Invalid browser capture name.");
    const output = resolve(import.meta.dir, `../../../.dev/acp-browser/${capture}`);
    const dist = resolve(import.meta.dir, "../../../apps/web-client/dist");
    mkdirSync(output, { recursive: true });
    let endpoint = "";
    const connectionFailures: string[] = [];
    const transport = codexFixture(() => endpoint);
    const f = await readinessFixture(undefined, undefined, undefined, 0, false, undefined, {
      codex: {
        harness: "codex",
        transport: "acp",
        async connect(context) {
          try {
            return await transport.connect(context);
          } catch (error) {
            connectionFailures.push(
              error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            );
            throw error;
          }
        },
      },
      opencode: new AcpAdapter("opencode", () => endpoint),
    });
    endpoint = `${f.origin}/v1/harness/tools`;
    const openSession = f.broker.openSession.bind(f.broker);
    f.broker.openSession = async (threadId, agentId) => {
      try {
        return await openSession(threadId, agentId);
      } catch (error) {
        connectionFailures.push(
          error instanceof Error
            ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
            : String(error),
        );
        throw error;
      }
    };
    const browser = await chromium.launch();
    const page = await browser.newPage({
      viewport,
      isMobile: name === "mobile",
      hasTouch: name === "mobile",
    });
    const report = {
      timestamp: new Date().toISOString(),
      viewport,
      real_http_and_postgresql: true,
      native_transport: "official ACP SDK subprocess fixture",
      provider_inference: "not_attempted",
      checks: [] as string[],
      page_errors: [] as string[],
      connection_failures: connectionFailures,
      completed: false,
    };
    let threadId: string | undefined;
    page.on("pageerror", (error) => report.page_errors.push(error.message));
    const save = () =>
      Bun.write(resolve(output, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
    f.serve(async (request) => {
      const url = new URL(request.url);
      if (/^\/(v1|health|api\/auth)(\/|$)/.test(url.pathname)) return f.api.handle(request);
      const path = resolve(dist, `.${url.pathname}`);
      const file = path.startsWith(`${dist}/`) ? Bun.file(path) : null;
      return new Response(
        file && (await file.exists()) ? file : Bun.file(resolve(dist, "index.html")),
        { headers: { "Cache-Control": "no-store" } },
      );
    });
    try {
      const lane = await f.lane(f.owner.cookie, "codex");
      threadId = lane.thread.id;
      await f.domain.store.withDataContext(lane.scope, async () => {
        const connections = new Connections(f.domain.lifecycle);
        await connections.update(await connections.get(lane.connection.id), {
          account_id: createHash("sha256").update("fixture-account").digest("hex"),
        });
      });
      await f.success(f.request(f.owner.cookie, "/v1/data/provision", {}));
      await f.background.start(100);
      await page.goto(f.origin);
      await page.getByLabel("Email", { exact: true }).fill("owner@example.test");
      await page.getByLabel("Password", { exact: true }).fill(fixturePassword);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await browserExpect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
      if (!(await page.locator(`[data-thread-id="${lane.thread.id}"]`).isVisible()))
        await page.getByRole("button", { name: "Percakapan", exact: true }).click();
      await page.locator(`[data-thread-id="${lane.thread.id}"]`).click();
      await page.getByRole("textbox", { name: "Pesan", exact: true }).fill("form");
      await page.getByRole("button", { name: "Kirim", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Jawaban: Name", exact: true })
        .fill("Ari", { timeout: 15_000 });
      await page.getByRole("button", { name: "Lanjut", exact: true }).click();
      const count = page.getByRole("spinbutton", { name: "Jawaban: Count", exact: true });
      await count.fill("0");
      await browserExpect(
        page.getByRole("button", { name: "Kirim jawaban", exact: true }),
      ).toBeDisabled();
      await count.fill("3");
      await page.screenshot({ path: resolve(output, `${name}-form.png`), fullPage: true });
      await page.getByRole("button", { name: "Kirim jawaban", exact: true }).click();
      await browserExpect
        .poll(
          async () =>
            (
              await f.success(f.request(f.owner.cookie, `/v1/threads/${lane.thread.id}/snapshot`))
            ).runs.at(-1)?.status,
          { timeout: 30_000 },
        )
        .toBe("succeeded");
      const snapshot = await f.success(
        f.request(f.owner.cookie, `/v1/threads/${lane.thread.id}/snapshot`),
      );
      expect(snapshot.runs.at(-1).native_run_id).toBeNull();
      expect(
        snapshot.messages.some(
          (message: { author: string; text: string }) =>
            message.author === "agent" &&
            message.text.includes('"count":3') &&
            message.text.includes('"name":"Ari"'),
        ),
      ).toBe(true);
      report.checks.push(
        "typed_form_validates_bounds_and_submits_native_values_for_nullable_id_run",
      );
      await page.getByRole("button", { name: "Pilih model", exact: true }).click();
      const rail = page.getByRole("tablist", { name: "Harnesses", exact: true });
      expect(await rail.getByRole("tab").allTextContents()).toHaveLength(5);
      for (const harness of ["Codex", "Muse Code", "Claude Code", "OpenCode", "Pi"])
        await browserExpect(rail.getByRole("tab", { name: harness, exact: true })).toBeVisible();
      await page.getByRole("tab", { name: "OpenCode", exact: true }).click();
      await browserExpect(
        page.getByText("This agent uses Codex. Its harness is managed in agent settings.", {
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole("tab", { name: "Codex", exact: true }).click();
      await page.screenshot({ path: resolve(output, `${name}-picker.png`), fullPage: true });
      await page.getByRole("option", { name: /^model-a/ }).click();
      await browserExpect
        .poll(
          async () =>
            (await f.success(f.request(f.owner.cookie, "/v1/entities/ai_selection"))).find(
              (item: { scope: string; thread_id: string }) =>
                item.scope === "conversation" && item.thread_id === lane.thread.id,
            )?.selection.model_id,
        )
        .toBe("model-a");
      const retained = await f.success(
        f.request(f.owner.cookie, `/v1/threads/${lane.thread.id}/snapshot`),
      );
      expect(retained.runs.at(-1).provider_selection.model_id).toBe("fixture-model");
      report.checks.push(
        "shared_onboarding_picker_uses_five_current_harnesses_and_keeps_run_selection_frozen",
      );
      await page
        .getByRole("button", { name: /^Detail / })
        .first()
        .click();
      await page.getByText(`${lane.agent.name} · Work progress`, { exact: true }).click();
      await browserExpect(
        page.getByText("Confirm the delivery details", { exact: true }),
      ).toBeVisible();
      await page.screenshot({ path: resolve(output, `${name}-progress.png`), fullPage: true });
      report.checks.push("agent_attributed_progress_is_collapsed_until_opened");
      await browserExpect(
        page.getByRole("button", { name: "Review work", exact: true }),
      ).toBeVisible();
      await browserExpect(page.getByRole("button", { name: "login", exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Summarize context", exact: true }).click();
      await browserExpect(page.getByRole("textbox", { name: "Pesan", exact: true })).toHaveText(
        "/compact",
      );
      const runsBeforeCommand = snapshot.runs.length;
      await page.getByRole("button", { name: "Kirim", exact: true }).click();
      await browserExpect
        .poll(
          async () => {
            const current = await f.success(
              f.request(f.owner.cookie, `/v1/threads/${lane.thread.id}/snapshot`),
            );
            return (
              current.runs.length > runsBeforeCommand && current.runs.at(-1).status === "succeeded"
            );
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      report.checks.push("advertised_context_action_prefills_composer_and_uses_normal_admission");
      await page.goto(`${f.origin}/?settings=providers`);
      await page.getByRole("button", { name: "Add connection", exact: true }).click();
      const harness = page.getByLabel("AI harness", { exact: true });
      expect(await harness.locator("option").allTextContents()).toEqual([
        "Codex",
        "Muse Code",
        "Claude Code",
        "OpenCode",
        "Pi",
      ]);
      await harness.selectOption("opencode");
      const provider = page.getByLabel("Model provider", { exact: true });
      await browserExpect(provider).toHaveValue("");
      await page.getByLabel("API key", { exact: true }).fill("fake-openai-browser-key");
      await browserExpect(
        page.getByRole("button", { name: "Add connection", exact: true }).last(),
      ).toBeDisabled();
      await provider.selectOption("openai");
      await browserExpect(page.getByLabel("API key", { exact: true })).toHaveValue("");
      await page.getByLabel("API key", { exact: true }).fill("fake-openai-browser-key");
      await page.screenshot({ path: resolve(output, `${name}-provider.png`), fullPage: true });
      await page.getByRole("button", { name: "Add connection", exact: true }).last().click();
      await browserExpect
        .poll(
          async () =>
            (await f.success(f.request(f.owner.cookie, "/v1/entities/connection"))).filter(
              (connection: { harness: string; provider_id: string }) =>
                connection.harness === "opencode" && connection.provider_id === "openai",
            ).length,
        )
        .toBe(1);
      report.checks.push(
        "five_harnesses_require_explicit_provider_and_clear_keys_on_selection_change",
      );
      const nativeProviders = {
        providers: Object.fromEntries(["native-provider-a", "native-provider-b"].map((id) => [id, {
          baseUrl: `https://${id}.example.test/v1`,
          api: "openai-completions",
          apiKey: `fixture-private-${id}`,
          models: [{ id: "native-model" }],
        }])),
      };
      const nativeFile = {
        name: "models.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(nativeProviders)),
      };
      await page.getByRole("button", { name: "Add connection", exact: true }).click();
      await harness.selectOption("pi");
      await browserExpect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
      await browserExpect(provider).toHaveCount(0);
      await page.getByLabel("Pi configuration", { exact: true }).setInputFiles(nativeFile);
      await browserExpect(provider.locator("option")).toHaveText([
        "Choose a configured provider", "native-provider-a", "native-provider-b",
      ]);
      await provider.selectOption("native-provider-a");
      await browserExpect(provider).toHaveValue("native-provider-a");
      await harness.selectOption("opencode");
      await harness.selectOption("pi");
      await browserExpect(page.getByLabel("Pi configuration", { exact: true })).toHaveValue("");
      await browserExpect(page.getByRole("button", { name: "Add connection", exact: true }).last()).toBeDisabled();
      await page.getByLabel("Pi configuration", { exact: true }).setInputFiles(nativeFile);
      await provider.selectOption("native-provider-b");
      await browserExpect(page.locator("body")).not.toContainText("fixture-private-");
      await page.screenshot({ path: resolve(output, `${name}-native-provider.png`), fullPage: true });
      await page.getByRole("button", { name: "Add connection", exact: true }).last().click();
      await browserExpect.poll(async () =>
        (await f.success(f.request(f.owner.cookie, "/v1/entities/connection"))).filter(
          (connection: { harness: string; provider_id: string; authentication: { method: string } }) =>
            connection.harness === "pi" && connection.provider_id === "native-provider-b" && connection.authentication.method === "harness_config",
        ).length,
      ).toBe(1);
      report.checks.push("pi_discovers_unregistered_providers_from_native_configuration_and_clears_it_on_harness_change");
      await page.getByRole("button", { name: "Add connection", exact: true }).click();
      await harness.selectOption("opencode");
      await provider.selectOption("opencode");
      await browserExpect(page.getByLabel("API key", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: "Add connection", exact: true }).last().click();
      await browserExpect.poll(async () =>
        (await f.success(f.request(f.owner.cookie, "/v1/entities/connection"))).filter(
          (connection: { provider_id: string; authentication: { method: string; billing_source: string } }) =>
            connection.provider_id === "opencode" && connection.authentication.method === "none" && connection.authentication.billing_source === "free",
        ).length,
      ).toBe(1);
      report.checks.push("opencode_public_free_connection_requires_no_credential");
      expect(report.page_errors).toEqual([]);
      report.completed = true;
    } catch (error) {
      const snapshot = threadId
        ? await f.success(f.request(f.owner.cookie, `/v1/threads/${threadId}/snapshot`))
        : null;
      Object.assign(report, {
        failure: error instanceof Error ? error.message : "Unknown browser failure",
        rendered_text: await page.locator("body").innerText(),
        run_states: snapshot?.runs.map(
          (run: { status: string; diagnostic: unknown; preparation: unknown }) => ({
            status: run.status,
            diagnostic: run.diagnostic,
            preparation: run.preparation,
          }),
        ),
      });
      throw error;
    } finally {
      await page
        .screenshot({ path: resolve(output, `${name}-last.png`), fullPage: true })
        .catch(() => {});
      await save();
      await browser.close();
      await f.background.stop(100);
      await f.broker.close();
      await f.close();
    }
  }, 120_000);
