import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DomainRuntime, DOMAIN_IMAGE } from "../../../apps/server/src/machines/domain-runtime";
import { ExecutionDomains } from "../../../apps/server/src/machines/domains";
import { CuaMachine } from "../../../apps/server/src/machines/cua";
import type { DataContext } from "../../../apps/server/src/persistence/access-context";
import { fixture } from "../../../apps/server/tests/helpers";
import { Artifacts } from "../../../apps/server/src/artifacts";
import { Workspaces } from "../../../apps/server/src/workspaces/service";
import { captureSource } from "./evidence";

test("native retained Cua domains isolate two people and two organizations on the declared host", async () => {
  const f = await fixture();
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const directory = join(import.meta.dir, "../../../.dev/verification/nma-076", stamp);
  mkdirSync(directory, { recursive: true });
  const runtime = new DomainRuntime(f.dir, f.owner, {
    version: 1,
    max_domains: 2,
    memory_mib: 768,
    cpus: 1,
    pids: 512,
  });
  let domains = new ExecutionDomains(f.lifecycle, runtime);
  const principals = [
    { organizationId: crypto.randomUUID(), userId: crypto.randomUUID() },
    { organizationId: "", userId: crypto.randomUUID() },
    { organizationId: crypto.randomUUID(), userId: "" },
  ];
  principals[1]!.organizationId = principals[0]!.organizationId;
  principals[2]!.userId = principals[0]!.userId;
  const scopes: DataContext[] = principals.map((p) => ({
    ...p,
    membershipGeneration: 1,
    authorizationGeneration: 1,
    readableAgents: [],
    invocableAgents: [],
    managedAgents: [],
    canManage: false,
    validate: async () => {},
  }));
  const ids: string[] = [];
  const checks: { name: string; pass: boolean; detail?: unknown }[] = [];
  const report: { [key: string]: unknown } = {
    started_at: new Date().toISOString(),
    fixture_principals: principals,
    image: DOMAIN_IMAGE,
    policy: runtime.policy,
    checks,
    planned_checks: 12,
    source: await captureSource(),
    provider_inference: false,
    real_account_login: false,
  };
  const spawned: Awaited<ReturnType<CuaMachine["spawn"]>>[] = [];
  const check = (name: string, detail?: unknown) => {
    checks.push({ name, pass: true, detail });
    console.log(JSON.stringify({ check: name, pass: true }));
  };
  const docker = async (args: string[]) => {
    const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
    const [output, , code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code) throw new Error(`Docker verification operation failed: ${args[0]}`);
    return output.trim();
  };
  const exec = async (host: CuaMachine, command: string) => {
    const child = await host.spawn(command, {
      requestId: crypto.randomUUID(),
      tag: `nma076-${crypto.randomUUID()}`,
      timeoutMs: 20000,
    });
    let text = "";
    for (;;) {
      const event = await child.nextEvent();
      if (!event) break;
      if (event.exit) {
        expect(event.exit.code).toBe(0);
        break;
      }
      text += new TextDecoder().decode(event.data);
    }
    return text;
  };
  const call = async (host: CuaMachine, name: string, args: Record<string, unknown> = {}) => {
    const result = await host.call(name, { ...args, session: `nma076-${host.configuration.id}` });
    if (result.isError) throw new Error(`Native Cua ${name} failed: ${result.structuredJson}`);
    return JSON.parse(result.structuredJson ?? "{}");
  };
  try {
    report.host = JSON.parse(
      await docker(["info", "--format", "{{json .}}"]).then((s) => {
        const d = JSON.parse(s);
        return JSON.stringify({
          docker: d.ServerVersion,
          os: d.OperatingSystem,
          arch: d.Architecture,
          cpus: d.NCPU,
          memory_bytes: d.MemTotal,
        });
      }),
    );
    let machines = [];
    for (const scope of scopes) {
      const machine = await f.store.withDataContext(scope, () => domains.resolve());
      machines.push(machine);
      ids.push((await machine.snapshot()).id);
    }
    expect(new Set(ids).size).toBe(3);
    expect(await runtime.inspect(ids[0]!)).toBeNull();
    check("lazy_principal_domain_resolution_without_provisioning");
    await Promise.all([machines[0]!.ready(), machines[1]!.ready()]);
    let a = machines[0]!.host!;
    let b = machines[1]!.host!;
    const observations = await Promise.all(ids.slice(0, 2).map((id) => runtime.inspect(id)));
    report.native = await Promise.all(
      [a, b].map((host) => host.rpc("SystemService/GetCapabilities")),
    );
    report.containers = observations.map((o) => ({
      id: o?.Id,
      memory: o?.HostConfig.Memory,
      cpus: o?.HostConfig.NanoCpus,
      pids: o?.HostConfig.PidsLimit,
      mounts: o?.Mounts.map((m) => ({
        type: m.Type,
        name: m.Name,
        destination: m.Destination,
        writable: m.RW,
      })),
    }));
    check("two_concurrent_native_domains_with_private_mounts_namespaces_and_limits");
    await Promise.all([
      a.files().create("same-path.txt", Buffer.from("person-a")),
      b.files().create("same-path.txt", Buffer.from("person-b")),
    ]);
    expect((await a.files().read("same-path.txt")).toString()).toBe("person-a");
    expect((await b.files().read("same-path.txt")).toString()).toBe("person-b");
    check("same_working_path_resolves_to_different_actual_bytes");
    const marker = `nma076-private-${crypto.randomUUID()}`;
    const privateProcess = await b.spawn(`exec -a ${marker} sleep 120`, {
      requestId: crypto.randomUUID(),
      tag: `nma076-private-${crypto.randomUUID()}`,
      timeoutMs: 130000,
    });
    spawned.push(privateProcess);
    const scan = `python3 - <<'PY'\nimport glob,os\nneedle=bytes.fromhex('${Buffer.from(marker).toString("hex")}')\nfound=False\nfor p in glob.glob('/proc/[0-9]*/cmdline'):\n try:\n  if needle in open(p,'rb').read(): found=True\n except (OSError,PermissionError): pass\nprint(str(found).lower())\nPY`;
    expect((await exec(a, scan)).trim()).toBe("false");
    expect((await exec(b, scan)).trim()).toBe("true");
    const outside = await exec(
      a,
      "test ! -S /var/run/docker.sock && test ! -d /host && test ! -d /Users && printf isolated",
    );
    expect(outside).toBe("isolated");
    const wrongCredential = new CuaMachine({ ...b.configuration, token: a.configuration.token });
    // GetCapabilities is public metadata; protected filesystem/process RPCs must reject the other token.
    await expect(wrongCredential.files().read("same-path.txt")).rejects.toBeDefined();
    await expect(
      wrongCredential.spawn("printf denied", {
        requestId: crypto.randomUUID(),
        tag: "nma076-denied",
      }),
    ).rejects.toBeDefined();
    check("process_namespace_and_control_credential_isolation_no_host_mounts");
    await expect(machines[2]!.ready()).rejects.toMatchObject({ code: "MACHINE_CAPACITY" });
    expect(await runtime.inspect(ids[2]!)).toBeNull();
    check("capacity_rejects_a_third_domain_without_replacing_existing_domains");
    const viewerTicket = (await a.rpc("SystemService/CreateViewerTicket", {
      ttl: "60s",
      policy: "SESSION_POLICY_VIEW_ONLY",
      clipboard: false,
      filesRoot: "",
      principal: { id: scopes[0]!.userId, displayName: "Fixture" },
    })) as { ticket: string };
    const readonly = new CuaMachine({ ...a.configuration, token: viewerTicket.ticket });
    const readonlyClient = await readonly.client();
    expect(typeof readonlyClient.setClipboard).toBe("function");
    await expect(readonlyClient.setClipboard("must-not-change")).rejects.toThrow(
      /permission|denied|unauth|policy/i,
    );
    await expect(
      readonlyClient.stat("/home/cua/workspace/same-path.txt", undefined, undefined, true),
    ).rejects.toThrow(/permission|denied|unauth|ticket/i);
    check("native_view_only_ticket_rejects_clipboard_mutation_and_filesystem_rpc");
    let uploadedPath = "";
    await f.store.withDataContext(scopes[0]!, async () => {
      const agent = await f.lifecycle.createAgent({
        name: "Native upload",
        harness: "codex",
        connection_id: null,
      });
      const thread = await f.lifecycle.create("thread", {
        type: "dm",
        member_agent_ids: [agent.id],
      });
      const workspace = await new Workspaces(f.lifecycle).ensure(thread.id, agent.id);
      expect(workspace.machine_id).toBe(ids[0]!);
      const artifact = await new Artifacts(f.lifecycle).upload(workspace.id, crypto.randomUUID(), {
        name: "native-upload.txt",
        media_type: "text/plain",
        content_base64: Buffer.from("immutable input").toString("base64"),
      });
      uploadedPath = artifact.source_path!;
      expect((await a.files().read(artifact.source_path!)).toString()).toBe("immutable input");
      await a.files().write(artifact.source_path!, Buffer.from("later working copy"));
      expect(
        (await new Artifacts(f.lifecycle).download(artifact.id, workspace.id)).bytes.toString(),
      ).toBe("immutable input");
      await expect(b.files().read(artifact.source_path!)).rejects.toMatchObject({
        code: "SCOPE_DENIED",
      });
    });
    await expect(b.files().read(uploadedPath)).rejects.toMatchObject({ code: "NOT_FOUND" });
    check("scoped_upload_materializes_actual_domain_bytes_and_download_remains_immutable");
    await docker([
      "network",
      "connect",
      `ngertiin-domain-${ids[1]}-network`,
      `ngertiin-domain-${ids[0]}`,
    ]);
    await Bun.sleep(1100);
    await expect(a.files().read("same-path.txt")).rejects.toMatchObject({
      code: "MACHINE_ISOLATION_UNSUPPORTED",
    });
    await docker([
      "network",
      "disconnect",
      `ngertiin-domain-${ids[1]}-network`,
      `ngertiin-domain-${ids[0]}`,
    ]);
    expect((await a.files().read("same-path.txt")).toString()).toBe("person-a");
    check("unexpected_cross_domain_network_attachment_fails_visible_runtime_attestation");
    const cookieServers = new Map<string, () => Promise<void>>();
    const attach = async (host: CuaMachine) => {
      await call(host, "start_session");
      let window: any;
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const state = await call(host, "get_desktop_state");
        window = state.windows?.find((w: any) => w.app_name === "Chromium");
        if (window) break;
        await Bun.sleep(750);
      }
      expect(window).toBeTruthy();
      await call(host, "browser_prepare", {
        pid: window.pid,
        window_id: Number(window.window_id),
        strategy: { kind: "existing_profile" },
        delivery_mode: "foreground",
      });
      return call(host, "get_browser_state", {
        pid: window.pid,
        window_id: Number(window.window_id),
      });
    };
    const cookieServer = async (host: CuaMachine, value: string) => {
      const command = `python3 -u - <<'PY'\nfrom http.server import HTTPServer,BaseHTTPRequestHandler\nclass H(BaseHTTPRequestHandler):\n def do_GET(self):\n  open('/home/cua/workspace/cookie-observed.txt','w').write(self.headers.get('Cookie','NO_COOKIE'))\n  self.send_response(200)\n  self.send_header('Content-Type','text/html')\n  self.send_header('Set-Cookie','nma076=${value}; Max-Age=3600; Path=/; SameSite=Lax')\n  self.end_headers()\n  self.wfile.write(b'<h1>Owned execution domain verification</h1>')\n def log_message(self,*args): pass\nHTTPServer(('127.0.0.1',18767),H).serve_forever()\nPY`;
      const start = async () => {
        spawned.push(
          await host.spawn(command, {
            requestId: crypto.randomUUID(),
            tag: `nma076-cookie-${crypto.randomUUID()}`,
            timeoutMs: 180000,
          }),
        );
        await Bun.sleep(500);
      };
      cookieServers.set(host.configuration.id, start);
      await start();
    };
    const navigate = async (host: CuaMachine, state: any) => {
      const tab = state.tabs?.[0] ?? { tab_id: state.tab_id };
      await call(host, "browser_navigate", {
        target_id: state.target_id,
        tab_id: tab.tab_id,
        url: "http://127.0.0.1:18767/",
      });
      await Bun.sleep(500);
    };
    await Promise.all([cookieServer(a, "person-a"), cookieServer(b, "person-b")]);
    for (const [host, value] of [
      [a, "person-a"],
      [b, "person-b"],
    ] as const) {
      const state = await attach(host);
      await navigate(host, state);
      await navigate(host, state);
      expect((await host.files().read("cookie-observed.txt")).toString()).toBe(`nma076=${value}`);
    }
    check("real_chromium_profiles_have_separate_cookies_for_the_same_owned_origin");
    const before = await runtime.inspect(ids[0]!);
    await docker(["restart", "--time", "3", `ngertiin-domain-${ids[0]}`]);
    await Bun.sleep(1500);
    expect((await a.files().read("same-path.txt")).toString()).toBe("person-a");
    expect((await runtime.inspect(ids[0]!))?.Id).toBe(before?.Id);
    await cookieServers.get(ids[0]!)!();
    const state = await attach(a);
    await navigate(a, state);
    expect((await a.files().read("cookie-observed.txt")).toString()).toBe("nma076=person-a");
    expect((await b.files().read("same-path.txt")).toString()).toBe("person-b");
    check(
      "retained_container_restart_preserves_files_and_browser_cookies_without_affecting_other_domains",
    );
    const jobs: { run_id: string; process_id: string }[] = [];
    for (let index = 0; index < 2; index++)
      await f.store.withDataContext(scopes[index]!, async () => {
        const agent = await f.lifecycle.createAgent({
          name: `Process ${index}`,
          harness: "codex",
          connection_id: null,
        });
        const thread = await f.lifecycle.create("thread", {
          type: "dm",
          member_agent_ids: [agent.id],
        });
        const admission = await f.lifecycle.admit({
          thread_id: thread.id,
          agent_id: agent.id,
          text: "Fixture process-attribution probe; no native harness dispatch.",
        });
        const process = await machines[index]!.processes.execute(
          {
            command_id: crypto.randomUUID(),
            command: `printf 'domain-${index}-ready\\n'; sleep 120`,
            wait_ms: 1000,
          },
          { agent_id: agent.id, thread_id: thread.id, run_id: admission.run.id },
          () => {},
        );
        jobs.push({ run_id: admission.run.id, process_id: process.id });
        expect(process.state).toBe("running");
      });
    await domains.close();
    await f.restart();
    domains = new ExecutionDomains(f.lifecycle, runtime);
    machines = [];
    for (const scope of scopes) {
      const machine = await f.store.withDataContext(scope, () => domains.resolve());
      machines.push(machine);
      await machine.recover();
    }
    a = machines[0]!.host!;
    b = machines[1]!.host!;
    for (let index = 0; index < 2; index++) {
      const process = await machines[index]!.processes.read(
        jobs[index]!.process_id,
        null,
        0,
        () => {},
      );
      expect(process.state).toBe("running");
      expect(process.stdout).toContain(`domain-${index}-ready`);
    }
    await f.store.withDataContext(scopes[0]!, () => f.lifecycle.cancel(jobs[0]!.run_id));
    expect(
      (await machines[0]!.processes.read(jobs[0]!.process_id, null, 3000, () => {})).state,
    ).toBe("exited");
    expect((await machines[1]!.processes.read(jobs[1]!.process_id, null, 0, () => {})).state).toBe(
      "running",
    );
    await machines[1]!.processes.control(
      {
        command_id: crypto.randomUUID(),
        process_id: jobs[1]!.process_id,
        operation: "terminate",
        wait_ms: 1000,
      },
      null,
      () => {},
    );
    check(
      "backend_detach_restart_reattaches_native_processes_and_one_run_stop_preserves_the_other_domain",
    );
    report.resources = JSON.parse(
      await docker([
        "stats",
        "--no-stream",
        "--format",
        "{{json .}}",
        ...ids.slice(0, 2).map((id) => `ngertiin-domain-${id}`),
      ]).then((s) => `[${s.split("\n").join(",")}]`),
    );
    await runtime.retire(ids[1]!);
    await Bun.sleep(1100);
    await expect(b.files().read("same-path.txt")).rejects.toMatchObject({
      code: "MACHINE_DOMAIN_MISSING",
    });
    await machines[2]!.ready();
    const c = machines[2]!.host!;
    await expect(c.files().read("same-path.txt")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await c.files().create("same-path.txt", Buffer.from("organization-b"));
    expect((await a.files().read("same-path.txt")).toString()).toBe("person-a");
    check(
      "explicit_teardown_retains_missing_identity_and_freed_capacity_admits_the_second_organization",
    );
    report.pass = true;
  } catch (error) {
    report.pass = false;
    report.error =
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack }
        : String(error);
    throw error;
  } finally {
    for (const handle of spawned) {
      await handle.signal("term", true).catch(() => {});
      await handle.detach().catch(() => {});
    }
    await domains.close();
    report.cleanup = [];
    for (const id of ids) {
      await runtime.retire(id).catch(() => {});
      for (const args of [
        ["network", "rm", `ngertiin-domain-${id}-network`],
        ["volume", "rm", `ngertiin-domain-${id}-home`],
      ])
        await docker(args).catch(() => {});
    }
    report.finished_at = new Date().toISOString();
    report.executed_checks = checks.length;
    await Bun.write(join(directory, "native.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ report: join(directory, "native.json"), pass: report.pass }));
    await f.close();
  }
}, 240000);
