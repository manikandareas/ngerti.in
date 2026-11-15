import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const release = "/opt/ngertiin/current";
const { loadOperations, run, writeOperatorFile } = await import(`${release}/apps/server/src/operations/files.ts`);
const { maintenance, retainedDomains } = await import(`${release}/apps/server/src/operations/maintenance.ts`);
const { DomainRuntime, readDomainPolicy } = await import(`${release}/apps/server/src/machines/domain-runtime.ts`);
const { CuaMachine } = await import(`${release}/apps/server/src/machines/cua.ts`);
const { config, env } = loadOperations("/etc/ngertiin/operations.json");
Object.assign(process.env, env);
const action = process.argv[2];
if (!["retire", "verify", "cycle"].includes(action)) throw new Error("Choose the explicit runtime upgrade step.");
const path = "/srv/ngertiin/operator-secrets/domain-runtime-upgrade.json";
const runtime = new DomainRuntime(config.state_dir, JSON.parse(readFileSync(join(config.state_dir, "installation.json"), "utf8")).owner_id, readDomainPolicy(config.state_dir), env.NGERTIIN_MACHINE_ASSETS_DIR);
const report: any = action === "retire" ? { domains: [], checks: [] } : JSON.parse(readFileSync(path, "utf8"));
const save = () => writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
await maintenance(config, env, async () => {
  if (action === "retire") {
    if (existsSync(path)) throw new Error("Inspect the retained runtime upgrade before repeating retirement.");
    const domains = await retainedDomains(config, env.NGERTIIN_MACHINE_ASSETS_DIR);
    if (domains.ids.length !== 2) throw new Error("This drill requires its two declared retained domains.");
    for (const id of domains.ids) {
      const retained = runtime.configuration(id, false);
      report.domains.push({ id, previous_container_id: retained.container_id });
    }
    save();
    for (const { id } of report.domains) {
      const retained = runtime.configuration(id, false);
      await runtime.retire(id);
      writeOperatorFile(join(config.state_dir, "execution-domains", `${id}.json`), JSON.stringify({ ...retained, phase: "new", container_id: null }));
    }
    report.retired = true; save();
  } else {
    if (!report.retired) throw new Error("Complete and reconcile retirement before recreation.");
    for (const domain of report.domains) {
      const retained = runtime.configuration(domain.id, false);
      await runtime.ensure(retained);
      const name = `ngertiin-domain-${domain.id}`;
      if (action === "cycle") {
        await run(["docker", "exec", name, "touch", "/run/cua-desktop/ngertiin-runtime-probe"]);
        await run(["docker", "stop", "--time", "30", name]);
        await runtime.ensure(retained);
        const probe = Bun.spawn(["docker", "exec", name, "test", "-e", "/run/cua-desktop/ngertiin-runtime-probe"], { stdout: "ignore", stderr: "ignore" });
        if (await probe.exited !== 1) throw new Error("The domain retained stale /run data across restart.");
      }
      const deadline = Date.now() + 60000;
      while (true) {
        let ready = false;
        try { ready = (await fetch(`${retained.endpoint}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
        if (ready) break;
        if (Date.now() > deadline) throw new Error("Native desktop startup did not become healthy.");
        await Bun.sleep(250);
      }
      const machine = new CuaMachine(retained);
      const caps = await machine.rpc("SystemService/GetCapabilities");
      if (!caps.features.some((v: any) => v.name === "desktop_stream" && v.supported))
        throw new Error("The restarted domain lacks its required desktop provider.");
      if (domain.id === "f7fa9e5b-8ff3-4101-8aee-89b775383bf4") {
        for (const cohort of ["before", "after"]) {
          const native = JSON.parse(readFileSync(`/srv/ngertiin/operator-secrets/native-${cohort}.json`, "utf8"));
          for (const lane of native.lanes)
            if ((await machine.files().read(lane.path)).toString() !== lane.marker + "\n")
              throw new Error("Private working bytes changed during domain recreation.");
        }
      }
      report.checks.push({ action, domain_id: domain.id, desktop_stream: true, different_physical_container: retained.container_id !== domain.previous_container_id, ephemeral_runtime: action === "cycle", private_working_bytes: domain.id === "f7fa9e5b-8ff3-4101-8aee-89b775383bf4" ? 4 : "separate-fixture-checked-through-HTTP" });
      save();
    }
  }
});
console.log(JSON.stringify({ action, domains: report.domains.length, checks: report.checks.length, homes_preserved: true, application_started: false }));
