import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { expect as playwrightExpect } from "playwright/test";

const browserExpect = playwrightExpect.configure({ timeout: 20_000 });

import { inboxMessages } from "../../../apps/server/src/auth/inbox";

test.skipIf(process.platform !== "darwin")(
  "unified development runs mandatory accounts, local mail, organizations and the actual Tauri gateway",
  async () => {
    if (!process.env.NGERTIIN_TEST_DATABASE_URL)
      throw new Error("Use the disposable PostgreSQL runner.");
    const root = resolve(import.meta.dir, "../../..");
    const report = join(root, "docs/verification/accounts-only-2026-11-15");
    const state = mkdtempSync(join(tmpdir(), "ngertiin-account-dev-"));
    const home = join(state, "desktop");
    const suffix = crypto.randomUUID().replaceAll("-", "");
    const reservations = Array.from({ length: 3 }, () =>
      Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() }),
    );
    const [apiPort, webPort, inboxPort] = reservations.map((server) => server.port);
    await Promise.all(reservations.map((server) => server.stop(true)));
    const origin = `http://127.0.0.1:${webPort}`;
    const email = "local-owner@example.test";
    const password = "Development-proof-password-948!";
    const updatedPassword = "Development-reset-password-179!";
    const launcher = Bun.spawn([process.execPath, "--no-env-file", "scripts/development.ts"], {
      cwd: root,
      env: {
        ...process.env,
        APP_ENV: "development",
        NGERTIIN_CONFIG_FILE: join(state, "absent.env"),
        NGERTIIN_STATE_DIR: state,
        NGERTIIN_DATABASE_URL: process.env.NGERTIIN_TEST_DATABASE_URL,
        NGERTIIN_APPLICATION_DATABASE_URL: "",
        NGERTIIN_DATABASE_SCHEMA: `dev_${suffix}`,
        NGERTIIN_AUTH_SCHEMA: `auth_${suffix}`,
        NGERTIIN_PORT: String(apiPort),
        NGERTIIN_WEB_PORT: String(webPort),
        NGERTIIN_AUTH_URL: origin,
        NGERTIIN_AUTH_SECRET: "",
        NGERTIIN_AUTH_EMAIL_DELIVERY: "local",
        NGERTIIN_AUTH_EMAIL_FROM: "",
        NGERTIIN_AUTH_RESEND_API_KEY: "",
        NGERTIIN_DEV_INBOX_PORT: String(inboxPort),
        NGERTIIN_DESKTOP_HOME: home,
        NGERTIIN_GROUP_ROUTER: "member",
        TYPESAFE_API_KEY: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    let output = "";
    const drain = async (stream: ReadableStream<Uint8Array>) => {
      for await (const bytes of stream) output += new TextDecoder().decode(bytes);
    };
    const drained = Promise.all([drain(launcher.stdout), drain(launcher.stderr)]);
    const browser = await chromium.launch({ headless: true });
    let gateway = "";
    const events: string[] = [];
    async function ready(check: () => Promise<boolean>, seconds = 90) {
      const deadline = Date.now() + seconds * 1000;
      while (Date.now() < deadline) {
        if (launcher.exitCode !== null)
          throw new Error(`Launcher exited (${launcher.exitCode}): ${output.slice(-2500)}`);
        if (await check().catch(() => false)) return;
        await Bun.sleep(200);
      }
      throw new Error(`Development readiness timed out: ${output.slice(-2500)}`);
    }
    async function signIn(page: Page, value: string) {
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(value);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    try {
      await ready(async () => (await fetch(origin)).ok);
      const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await desktop.newPage();
      await page.goto(origin);
      await browserExpect(
        page.getByRole("heading", { name: "Sign in", exact: true }),
      ).toBeVisible();
      expect(
        (
          await desktop.request.get(`${origin}/v1/contracts`, {
            headers: { Authorization: `Bearer ${"x".repeat(64)}` },
          })
        ).status(),
      ).toBe(401);
      events.push("mandatory_account_entry_and_legacy_bearer_denial");
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.getByLabel("Name", { exact: true }).fill("Local owner");
      await page.getByLabel("Email", { exact: true }).fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await browserExpect(page.getByRole("status")).toContainText("Check your email");
      const messages = await inboxMessages(join(state, "authentication/mail"));
      const verification = messages.find((message) => message.purpose === "verification");
      expect(verification).toBeDefined();
      if (!verification) throw new Error("Verification email is missing.");
      await page.goto(verification.url);
      await signIn(page, password);
      await browserExpect(
        page.getByRole("button", { name: "Create organization", exact: true }),
      ).toBeVisible();
      await browserExpect(page.getByText("Owner setup token", { exact: true })).toHaveCount(0);
      events.push(
        "local_registration_email_verification_and_first_owner_without_resend_or_manual_secret",
      );
      await page.getByRole("button", { name: "Create organization", exact: true }).click();
      await page.getByLabel("Organization name").fill("Development organization");
      await page.getByRole("button", { name: "Create organization", exact: true }).click();
      await browserExpect(page.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
      const list = await (await desktop.request.get(`${origin}/v1/organizations`)).json();
      const organization = list.organizations[0];
      expect(organization.name).toBe("Development organization");
      await page.screenshot({ path: join(report, "development-desktop.png") });
      events.push("organization_creation_and_private_default_workspace");
      const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const phone = await mobile.newPage();
      await phone.goto(origin);
      await signIn(phone, password);
      await browserExpect(phone.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
      await phone.screenshot({ path: join(report, "development-mobile.png") });
      expect(
        await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      events.push("mobile_account_and_organization_workspace");
      const invite = await mobile.request.post(
        `${origin}/v1/organizations/${organization.id}/invitations`,
        {
          headers: { Origin: origin, "Idempotency-Key": crypto.randomUUID() },
          data: { email: "invited@example.test", role: "member", workgroup_ids: [] },
        },
      );
      expect(invite.status()).toBe(200);
      expect(
        (await inboxMessages(join(state, "authentication/mail"))).some(
          (message) => message.purpose === "invitation",
        ),
      ).toBe(true);
      events.push("local_organization_invitation_delivery");
      await phone.evaluate(async () => {
        await fetch("/v1/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      });
      await phone.goto(origin);
      await phone.getByRole("button", { name: "Forgot password?" }).click();
      await phone.getByLabel("Email", { exact: true }).fill(email);
      await phone.getByRole("button", { name: "Send reset link" }).click();
      await browserExpect(phone.getByRole("status")).toContainText("reset link");
      const recovery = (await inboxMessages(join(state, "authentication/mail"))).find(
        (message) => message.purpose === "recovery",
      );
      expect(recovery).toBeDefined();
      if (!recovery) throw new Error("Recovery email is missing.");
      await phone.goto(recovery.url);
      await phone.getByLabel("New password", { exact: true }).fill(updatedPassword);
      await phone.getByRole("button", { name: "Save password" }).click();
      await browserExpect(
        phone.getByRole("heading", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await signIn(phone, updatedPassword);
      await browserExpect(phone.getByRole("textbox", { name: "Pesan", exact: true })).toBeVisible();
      events.push("local_password_recovery_and_verified_sign_in");
      await ready(async () => {
        const profile = JSON.parse(readFileSync(join(home, "profile.json"), "utf8"));
        gateway = `http://127.0.0.1:${profile.uiPort}`;
        return (await fetch(`${gateway}/v1/auth/native`)).ok;
      });
      expect((await fetch(`${gateway}/v1/auth/session`)).status).toBe(401);
      expect(output).toContain("Opening account-authenticated Tauri client");
      events.push("actual_tauri_process_and_account_only_native_gateway");
      writeFileSync(
        join(root, ".dev/accounts-only-live.json"),
        JSON.stringify({
          origin,
          apiPort,
          inboxPort,
          gateway,
          home,
          state,
          email,
          password: updatedPassword,
          organization: organization.id,
        }),
        { mode: 0o600 },
      );
      await Bun.write(
        join(report, "development.json"),
        `${JSON.stringify({ events, count: events.length, desktop: "1440x1000", mobile: "390x844", provider_inference: "not_executed", database: "disposable PostgreSQL", secret: "private generated file", email_delivery: "local files", native_session: "awaiting optional observed native sign-in" }, null, 2)}\n`,
      );
      console.log(
        `Development proof ready: ${origin}; native gateway ${gateway}; ${events.length} cases passed.`,
      );
      if (process.env.NGERTIIN_ACCOUNT_PROOF_HOLD === "1") {
        await ready(async () => Bun.file(join(root, ".dev/accounts-only-release")).exists(), 480);
        const native = await fetch(`${gateway}/v1/auth/session`);
        if (native.ok) {
          const session = await native.json();
          expect(session.user.email).toBe(email);
          events.push("observed_actual_native_pkce_and_keychain_session");
        }
        await Bun.write(
          join(report, "development.json"),
          `${JSON.stringify({ events, count: events.length, native_session: native.ok ? "verified" : "not_signed_in", database: "disposable PostgreSQL", email_delivery: "local files" }, null, 2)}\n`,
        );
      }
    } finally {
      if (gateway)
        await fetch(`${gateway}/v1/auth/logout`, {
          method: "POST",
          headers: { Origin: gateway },
          signal: AbortSignal.timeout(8000),
        }).catch(() => {});
      await browser.close();
      if (launcher.exitCode === null) launcher.kill("SIGTERM");
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        launcher.exited,
        new Promise<void>((resolve) => {
          timer = setTimeout(() => {
            launcher.kill("SIGKILL");
            resolve();
          }, 12_000);
        }),
      ]);
      clearTimeout(timer);
      await launcher.exited;
      await drained;
      await Bun.write(join(report, "development-launcher.log"), output);
      expect(
        await fetch(origin, { signal: AbortSignal.timeout(500) }).then(
          () => true,
          () => false,
        ),
      ).toBe(false);
      if (gateway)
        expect(
          await fetch(`${gateway}/_desktop/status`, { signal: AbortSignal.timeout(500) }).then(
            () => true,
            () => false,
          ),
        ).toBe(false);
      rmSync(state, { recursive: true, force: true });
      rmSync(join(root, ".dev/accounts-only-live.json"), { force: true });
      rmSync(join(root, ".dev/accounts-only-release"), { force: true });
    }
  },
  600_000,
);
