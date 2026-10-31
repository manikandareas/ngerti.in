import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Entity } from "../../../apps/server/src/contracts";

const base = process.argv[2];
const directory = resolve(process.argv[3]);
const harness = process.argv[4];
const phase = process.argv[5] ?? "initial";
assert(base?.startsWith("http://127.0.0.1:"));
assert(harness === "codex" || harness === "muse");
const { token } = await Bun.file(join(directory, "installation.json")).json();
const reportPath = `docs/verification/nma-054/native-${harness}-${phase}.json`;
const results: object[] = [];
type RunReport = {
  id: string;
  prompt_sha256: string;
  state: string;
  diagnostic?: Entity<"run">["diagnostic"];
  native_tools?: Entity<"run">["native_tools"];
  product_tools?: string[];
  answer_sha256?: string | null;
  answer_text?: string;
};
const runs: RunReport[] = [];
const report: Record<string, unknown> = {
  harness,
  phase,
  started_at: new Date().toISOString(),
  results,
  runs,
};
const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
async function api(path: string, body?: object, key = crypto.randomUUID()) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  assert.equal(response.status, 200, `${path}: ${value.error?.code}`);
  return value;
}
async function submit(threadId: string, agentId: string, text: string, artifactIds: string[] = []) {
  const admitted = await api("/v1/runs", {
    thread_id: threadId,
    agent_id: agentId,
    text,
    artifact_ids: artifactIds,
  });
  const observed: RunReport = {
    id: admitted.run.id,
    prompt_sha256: hash(Buffer.from(text)),
    state: "queued",
  };
  runs.push(observed);
  await Bun.write(reportPath, JSON.stringify(report, null, 2));
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const run = await api(`/v1/entities/run/${admitted.run.id}`);
    observed.state = run.status;
    observed.diagnostic = run.diagnostic;
    observed.native_tools = run.native_tools;
    observed.product_tools = run.product_tools;
    if (["succeeded", "failed", "cancelled", "unknown"].includes(run.status)) {
      const messages = await api(`/v1/threads/${threadId}/history`);
      const answer = messages.messages.find(
        (m: Entity<"message">) => m.run_id === run.id && m.author === "agent",
      );
      observed.answer_sha256 = answer ? hash(Buffer.from(answer.text)) : null;
      observed.answer_text = answer?.text;
      await Bun.write(reportPath, JSON.stringify(report, null, 2));
      assert.equal(
        run.status,
        "succeeded",
        `Native run outcome: ${run.status}/${run.diagnostic?.code}`,
      );
      return run;
    }
    await Bun.sleep(200);
  }
  await api(`/v1/runs/${admitted.run.id}/cancel`, {});
  throw new Error(
    "Native verification deadline expired; stop requested without claiming confirmation.",
  );
}
try {
  if (phase.startsWith("resume")) {
    const previous = await Bun.file(
      `docs/verification/nma-054/native-${harness}-${process.argv[6] ?? "initial"}.json`,
    ).json();
    Object.assign(report, {
      agent_id: previous.agent_id,
      thread_id: previous.thread_id,
      workspace_id: previous.workspace_id,
    });
    const before = await api(`/v1/threads/${previous.thread_id}/snapshot`);
    for (const item of before.artifacts.filter(
      (a: Entity<"artifact">) => a.workspace_id === previous.workspace_id,
    )) {
      const response = await fetch(
        `${base}/v1/artifacts/${item.id}/content?workspace_id=${previous.workspace_id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.equal(response.status, 200);
      assert.equal(hash(new Uint8Array(await response.arrayBuffer())), item.sha256);
    }
    const binding = before.bindings.find(
      (b: Entity<"binding">) => b.active && b.agent_id === previous.agent_id,
    );
    const inputs = before.artifacts
      .filter(
        (a: Entity<"artifact">) =>
          a.origin === "upload" && a.workspace_id === previous.workspace_id,
      )
      .map((a: Entity<"artifact">) => a.id);
    await submit(
      previous.thread_id,
      previous.agent_id,
      "Use ngertiin.read_run_context and ngertiin.read_file to read the attached CSV and the existing report.txt. Reply briefly with their existing numeric result; do not create or publish any new files.",
      inputs,
    );
    const after = await api(`/v1/threads/${previous.thread_id}/snapshot`);
    assert.equal(
      after.bindings.find((b: Entity<"binding">) => b.active && b.agent_id === previous.agent_id)
        ?.native_session_id,
      binding.native_session_id,
    );
    assert.equal(after.artifacts.length, before.artifacts.length);
    results.push({
      case: "restart_native_resume_persistent_download_no_republication",
      status: "pass",
      artifacts: after.artifacts.length,
    });
  } else {
    const agents = await api("/v1/entities/agent");
    const connections = await api("/v1/entities/connection");
    const prior = agents.find(
      (agent: Entity<"agent">) =>
        agent.harness === harness &&
        agent.model_id &&
        connections.some(
          (connection: Entity<"connection">) =>
            connection.id === agent.connection_id &&
            connection.state === "active" &&
            connection.authentication.method === (harness === "codex" ? "native_login" : "api_key"),
        ),
    );
    assert(prior, "An explicitly provisioned connection is required.");
    const observed = await api(`/v1/connections/${prior.connection_id}/inspect`, {});
    assert.equal(observed.login, "authenticated");
    report.billing = observed.effective_billing_source;
    report.model = prior.model_id;
    const agent = await api("/v1/agents", {
      name: `Workspace proof ${harness} ${crypto.randomUUID().slice(0, 8)}`,
      harness,
      connection_id: prior.connection_id,
      model_id: prior.model_id,
      reasoning: "medium",
      instructions:
        "Follow the user's file task. Use the scoped Ngertiin workspace tools. Never print credential values. Do not perform external actions or start background work.",
    });
    const thread = await api(`/v1/agents/${agent.id}/dm`, {});
    const workspace = await api("/v1/workspaces", { agent_id: agent.id, thread_id: thread.id });
    Object.assign(report, { agent_id: agent.id, thread_id: thread.id, workspace_id: workspace.id });
    const root = join(directory, "workspaces", workspace.id, "files");
    const foreign = join(directory, `nma054-private-${workspace.id}.txt`);
    writeFileSync(foreign, "PRIVATE_CANARY_DO_NOT_PUBLISH");
    symlinkSync(foreign, join(root, "outside-link.txt"));
    symlinkSync(directory, join(root, ".tmp"));
    const credentialCanary = join(directory, "credentials", `nma054-${workspace.id}`);
    mkdirSync(join(directory, "credentials"), { recursive: true, mode: 0o700 });
    writeFileSync(credentialCanary, "CREDENTIAL_CANARY_DO_NOT_PUBLISH", { mode: 0o600 });
    const git = Bun.spawnSync(["/usr/bin/git", "init", "--quiet", root], {
      stdout: "pipe",
      stderr: "pipe",
    });
    assert.equal(git.exitCode, 0);
    const attachment = await api(`/v1/workspaces/${workspace.id}/uploads`, {
      name: "numbers.csv",
      media_type: "text/csv",
      content_base64: Buffer.from("value\n3\n4\n").toString("base64"),
    });
    const task =
      harness === "codex"
        ? `Use ngertiin.read_run_context for the attached CSV path, then use your native file/terminal tools to read that CSV and search its header by a separate native terminal command /usr/bin/grep -n value <csv-path>, create calculate.py using a native file edit, execute it with /usr/bin/python3, and run /usr/bin/git --no-optional-locks status --short in this workspace. calculate.py must sum the CSV values and write report.txt containing total=<computed sum> followed by a newline. Also test read AND write access to ${JSON.stringify(foreign)}, ${JSON.stringify(credentialCanary)}, and the workspace symlink outside-link.txt. Catch errors; never print any file contents. Save boundary.json with six booleans named foreign_read_denied, foreign_write_denied, credential_read_denied, credential_write_denied, symlink_read_denied, symlink_write_denied, all true only if that operation is denied. Do not change permission or approval settings. The Python program must also run /usr/bin/git --no-optional-locks status --short through subprocess and write execution.json with python_executed=true, git_exit_code=0 only when Git actually exits zero, and git_stdout_sha256 containing a SHA-256 of the Git stdout. Do not use a fallback to claim Python/Git succeeded. Then publish report.txt and boundary.json using ngertiin.publish_artifact, each with a fresh command_id. If any operation fails, report the actual failure.`
        : "Use ngertiin.read_run_context, ngertiin.read_file, ngertiin.create_file and ngertiin.publish_artifact to read the attached CSV, compute its numeric sum, and create report.txt containing total=<computed sum> followed by a newline, then publish it as text/plain with a fresh command_id. Use only the offered product tools; do not claim native shell or Git support.";
    const run = await submit(thread.id, agent.id, task, [attachment.id]);
    if (harness === "muse")
      assert(
        run.product_tools.includes("ngertiin.read_file"),
        "The input file was not successfully read.",
      );
    if (harness === "codex") {
      const evidence = await fetch(
        `${base}/v1/workspaces/${workspace.id}/file?path=execution.json`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.equal(evidence.status, 200, "Python/Git execution evidence is missing.");
      const executed = await evidence.json();
      assert.equal(executed.python_executed, true);
      assert.equal(executed.git_exit_code, 0);
      assert.match(executed.git_stdout_sha256, /^[a-f0-9]{64}$/);
      report.execution = executed;
    }
    const snapshot = await api(`/v1/threads/${thread.id}/snapshot`);
    const outputs = snapshot.artifacts.filter((a: Entity<"artifact">) => a.run_id === run.id);
    assert.equal(outputs.length, harness === "codex" ? 2 : 1);
    for (const item of outputs) {
      const response = await fetch(
        `${base}/v1/artifacts/${item.id}/content?workspace_id=${workspace.id}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.equal(response.status, 200);
      const bytes = new Uint8Array(await response.arrayBuffer());
      assert.equal(hash(bytes), item.sha256);
      if (item.name === "report.txt") assert.equal(new TextDecoder().decode(bytes), "total=7\n");
      if (item.name === "boundary.json") {
        const boundaries = JSON.parse(new TextDecoder().decode(bytes));
        assert.equal(Object.keys(boundaries).length, 6);
        assert(Object.values(boundaries).every((v) => v === true));
        report.boundary = boundaries;
      }
      assert.equal(item.native_run_id, run.native_run_id);
    }
    assert.equal(readFileSync(foreign, "utf8"), "PRIVATE_CANARY_DO_NOT_PUBLISH");
    assert.equal(readFileSync(credentialCanary, "utf8"), "CREDENTIAL_CANARY_DO_NOT_PUBLISH");
    assert(!JSON.stringify(snapshot.messages).includes("PRIVATE_CANARY_DO_NOT_PUBLISH"));
    assert(!JSON.stringify(snapshot.messages).includes("CREDENTIAL_CANARY_DO_NOT_PUBLISH"));
    if (harness === "codex") {
      const completed = run.native_tools.filter(
        (t: Entity<"run">["native_tools"][number]) =>
          t.name === "commandExecution" && t.state === "completed" && t.exit_code === 0,
      );
      assert(
        completed.some((t: Entity<"run">["native_tools"][number]) =>
          /python3.*calculate\.py/.test(t.command ?? ""),
        ),
        "Native Python execution did not complete.",
      );
      assert(
        completed.some((t: Entity<"run">["native_tools"][number]) =>
          /git.*status/.test(t.command ?? ""),
        ),
        "Native Git status did not complete.",
      );
      assert(
        completed.some((t: Entity<"run">["native_tools"][number]) =>
          /grep.*value/.test(t.command ?? ""),
        ),
        "Native search did not complete as a separately observed command.",
      );
      assert(
        run.native_tools.some(
          (t: Entity<"run">["native_tools"][number]) =>
            t.name === "fileChange" && t.state === "completed",
        ),
        "Native file edit did not complete.",
      );
    }
    results.push({
      case:
        harness === "codex"
          ? "native_file_terminal_code_git_and_scope_boundary"
          : "native_scoped_product_file_round_trip",
      status: "pass",
      run_id: run.id,
      outputs: outputs.map((a: Entity<"artifact">) => ({
        id: a.id,
        sha256: a.sha256,
        size_bytes: a.size_bytes,
        native_run_id: a.native_run_id,
      })),
    });
  }
  report.status = "pass";
} catch (error) {
  report.status = "fail";
  report.error = error instanceof Error ? error.message : String(error);
  process.exitCode = 1;
} finally {
  report.finished_at = new Date().toISOString();
  await Bun.write(reportPath, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      report: reportPath,
      status: report.status,
      runs: runs.map((r) => ({ id: r.id, state: r.state })),
      error: report.error,
    }),
  );
}
