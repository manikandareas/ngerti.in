import assert from "node:assert/strict";
import { createApi } from "../../../apps/server/src/api";
import { Artifacts } from "../../../apps/server/src/artifacts";
import { Background } from "../../../apps/server/src/background";
import { CONTRACT_VERSION, type Entity } from "../../../apps/server/src/contracts";
import { Groups } from "../../../apps/server/src/groups/service";
import { Connections } from "../../../apps/server/src/harness/connections";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { readMachineConfiguration } from "../../../apps/server/src/machines/config";
import { Machines } from "../../../apps/server/src/machines/service";
import { fixture } from "../../../apps/server/tests/helpers";

// Real retained machine; fixture application identities, no provider inference.
const configuration = readMachineConfiguration(".dev/harness-first");
assert(configuration);
const f = fixture();
const machines = new Machines(f.lifecycle, configuration);
const tools = new ProductTools(f.lifecycle);
const connections = new Connections(f.lifecycle);
const connection = f.store.get("connection", f.agent.connection_id);
connections.update(connection, { capabilities: { ...connection.capabilities, product_tools: "supported" } });
const peer = f.lifecycle.createAgent({ name: "Cleanup reviewer", harness: "codex", connection_id: connection.id });
const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id, peer.id] });
const groups = new Groups(f.lifecycle);
const start = (agentId: string) => {
  if (!f.store.list("binding").some((binding) => binding.active && binding.thread_id === group.id && binding.agent_id === agentId))
    f.lifecycle.bind(group.id, agentId, crypto.randomUUID());
  const claimed = f.lifecycle.claimNext(group.id, agentId)!;
  assert(claimed);
  f.lifecycle.started(claimed.id, claimed.dispatch_token!, crypto.randomUUID());
  const run = f.store.get("run", claimed.id);
  const lease = tools.issue(run);
  return { run, lease, call: (name: string, input: unknown) => tools.call(lease.token, lease.scope, name, input) };
};
const finish = async (agent: ReturnType<typeof start>) => {
  f.lifecycle.appendAnswer(agent.run.id, "The requested result is available.");
  f.lifecycle.settle(agent.run.id, agent.run.dispatch_token!, "succeeded");
  agent.lease.revoke();
  await machines.releaseRun(agent.run.id);
};
type WindowList = { windows?: { ref: { id: string; epoch: string } }[] };
const nativeWindows = async () => ((await machines.host!.rpc("WindowsService/ListWindows", { filter: { includeSystem: false } })) as WindowList).windows ?? [];
const checks: { name: string; detail?: unknown }[] = [];
const record = (name: string, detail?: unknown) => { checks.push({ name, detail }); console.log(JSON.stringify({ check: name, passed: true })); };
const evidence = "docs/verification/shared-machine";
let failed: string | undefined;
try {
  await machines.ready();
  const baseline = await nativeWindows();
  groups.send(group.id, { agent_id: f.agent.id, text: "Research, execute and review; then tidy temporary tools." });
  const a = start(f.agent.id);
  const beforeDriver = await a.call("ngertiin.computer_call", { command_id: crypto.randomUUID(), name: "list_windows", arguments: {} }) as { structuredJson: string };
  const previousIds = new Set(JSON.parse(beforeDriver.structuredJson).windows.map((item: { window_id: number }) => item.window_id));
  const browser = await a.call("ngertiin.machine_window", { command_id: crypto.randomUUID(), operation: "open_browser", url: "https://example.com" }) as Entity<"machine_window">;
  assert.equal(browser.state, "open");
  const currentDriver = await a.call("ngertiin.computer_call", { command_id: crypto.randomUUID(), name: "list_windows", arguments: {} }) as { structuredJson: string };
  const target = JSON.parse(currentDriver.structuredJson).windows.find((item: { pid: number; window_id: number }) => item.pid === browser.pid && !previousIds.has(item.window_id));
  assert(target, "The owned native browser window must be identifiable.");
  const opened = await a.call("ngertiin.computer_call", { command_id: crypto.randomUUID(), name: "hotkey", arguments: { pid: target.pid, window_id: Number(target.window_id), keys: ["ctrl", "t"], delivery_mode: "foreground" } }) as { isError: boolean };
  assert(!opened.isError);
  const prepared = await a.call("ngertiin.computer_call", { command_id: crypto.randomUUID(), name: "browser_prepare", arguments: { pid: target.pid, window_id: Number(target.window_id), strategy: { kind: "existing_profile" }, delivery_mode: "foreground" } }) as { isError: boolean; structuredJson: string };
  assert(!prepared.isError, prepared.structuredJson);
  const binding = await a.call("ngertiin.computer_call", { command_id: crypto.randomUUID(), name: "get_browser_state", arguments: { pid: target.pid, window_id: Number(target.window_id) } }) as { isError: boolean; structuredJson: string };
  assert(!binding.isError, binding.structuredJson);
  const browserState = JSON.parse(binding.structuredJson);
  assert(browserState.tabs.length >= 2, "Owned browser window must contain multiple tabs.");
  record("owned_browser_window_with_multiple_native_tabs", { tabs: browserState.tabs.length });
  const terminal = await a.call("ngertiin.machine_window", { command_id: crypto.randomUUID(), operation: "open_terminal" }) as Entity<"machine_window">;
  assert.equal(terminal.state, "open");
  const path = `.ngertiin-verification/cleanup-${crypto.randomUUID()}/result.txt`;
  await a.call("ngertiin.create_file", { command_id: crypto.randomUUID(), path, text: "Retained output after desktop cleanup.\n" });
  const artifact = await a.call("ngertiin.publish_artifact", { command_id: crypto.randomUUID(), path, media_type: "text/plain" }) as Entity<"artifact">;
  groups.handoff(a.run.id, { agent_id: peer.id, instruction: "Read the retained output and review it.", purpose: "review", continuation: "complete" });
  await finish(a);
  groups.advance(); await machines.desktop.idle();
  assert.equal(f.store.get("machine_window", browser.id).state, "open");
  assert.equal(f.store.get("machine_window", terminal.id).state, "open");
  record("parent_settlement_does_not_close_peer_resources");
  const b = start(peer.id);
  const read = await b.call("ngertiin.read_file", { path }) as { text: string };
  assert.equal(read.text, "Retained output after desktop cleanup.\n");
  await finish(b);
  groups.advance(); groups.advance(); await machines.desktop.idle();
  assert.equal(f.store.get("peer_task", a.run.task_id!).state, "completed");
  assert.equal(f.store.get("machine_window", browser.id).state, "closed");
  assert.equal(f.store.get("machine_window", terminal.id).state, "closed");
  const after = await nativeWindows();
  for (const prior of baseline) assert(after.some((item) => item.ref.id === prior.ref.id && item.ref.epoch === prior.ref.epoch));
  assert(!after.some((item) => item.ref.id === browser.native_ref!.id || item.ref.id === terminal.native_ref!.id));
  record("successful_chain_closes_owned_browser_tabs_and_terminal_only", { baseline_windows_preserved: baseline.length });
  assert.equal((await machines.files().read(path)).toString(), read.text);
  assert.equal(new Artifacts(f.lifecycle).download(artifact.id, artifact.workspace_id).bytes.toString(), read.text);
  record("working_file_and_immutable_artifact_survive_cleanup", { path, sha256: artifact.sha256 });
  groups.send(group.id, { agent_id: f.agent.id, text: "Show a preview that stays open." });
  const previewAgent = start(f.agent.id);
  const preview = await previewAgent.call("ngertiin.machine_window", { command_id: crypto.randomUUID(), operation: "open_browser", url: "https://example.com", keep_open: true }) as Entity<"machine_window">;
  await finish(previewAgent); groups.advance(); await machines.desktop.idle();
  assert.equal(f.store.get("machine_window", preview.id).state, "open");
  assert((await nativeWindows()).some((item) => item.ref.id === preview.native_ref!.id));
  record("explicit_result_preview_remains_open");
  const api = createApi(f.lifecycle, new Background(f.lifecycle), "native-cleanup-owner-token-".repeat(3), { tools, connections });
  const response = await api.handle(new Request("http://localhost/v1/contracts", { headers: { Authorization: `Bearer ${"native-cleanup-owner-token-".repeat(3)}` } }));
  assert.equal(response.status, 200);
  const contract = await response.json();
  assert.equal(contract.version, CONTRACT_VERSION);
  assert(contract.product_tools.some((tool: { name: string }) => tool.name === "ngertiin.machine_window"));
  await Bun.write(`docs/contracts/${CONTRACT_VERSION}.json`, JSON.stringify(contract, null, 2));
  record("versioned_api_and_product_tool_export", { version: CONTRACT_VERSION });
} catch (error) {
  failed = String(error);
  console.error(failed);
  process.exitCode = 1;
} finally {
  await machines.close();
  // Remove only windows this verifier created, including its deliberately retained preview.
  for (const item of machines.desktop.list())
    if (item.native_ref && item.state === "open")
      await machines.host!.rpc("WindowsService/CloseWindow", { window: item.native_ref, force: false });
  await Bun.write(`${evidence}/cleanup-native-2026-11-04.json`, JSON.stringify({
    date: "2026-11-04", contract_version: CONTRACT_VERSION, machine_id: configuration.id,
    cohort: "Real Cua SDK/spacesd/native windows and browser; fixture application identities, no provider inference or new login-persistence claim.",
    checks, failed: failed ?? null,
    resources: machines.desktop.list(),
    cleanup_receipts: machines.operations.list().filter((item) => item.name === "window.cleanup").map(({ id, name, state, error_code }) => ({ id, name, state, error_code })),
  }, null, 2));
  f.close();
}
