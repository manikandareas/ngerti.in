import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

if (process.env.NGERTIIN_NMA083_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the retained owner-operated acceptance deployment explicitly.");
process.umask(0o077);
const directory = resolve(".dev/verification/nma-083");
mkdirSync(directory, { recursive: true });
const workspace = JSON.parse(readFileSync(".dev/nma082-live/workspace.json", "utf8"));
const providers = JSON.parse(readFileSync(".dev/nma082-live/provider-target.json", "utf8"));
if (
  workspace.server_origin !== "https://demo.ngerti.in" ||
  workspace.gateway_origin !== "http://127.0.0.1:54985"
)
  throw new Error("The retained native target changed; inspect its profile.");
const statePath = resolve(".dev/nma083-deployed.json");
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { lanes: {} };
const reportPath = resolve(directory, "deployed-native.json");
const report = existsSync(reportPath)
  ? JSON.parse(readFileSync(reportPath, "utf8"))
  : {
      started_at: new Date().toISOString(),
      server: workspace.server_origin,
      lanes: {},
      planned_lanes: 2,
      completed: false,
      native_gateway: true,
      synthetic_attachment_contents: true,
    };
function save() {
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
async function request(path: string, body?: unknown, key = randomUUID(), raw = false) {
  const response = await fetch(`${workspace.gateway_origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: workspace.gateway_origin,
      "X-Ngertiin-Organization": workspace.organization_id,
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": key }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Acceptance request failed: ${path} (${response.status}).`);
  return raw ? response : response.json();
}
const session = await request("/v1/auth/session");
if (session.authentication !== "native" || session.user.id !== workspace.actor_id)
  throw new Error("The retained intended Owner must sign in through the actual Tauri client.");
if (process.argv.includes("--fresh-probe")) {
  if (report.completed) throw new Error("The native cohort is already complete.");
  for (const lane of Object.values(state.lanes) as { run_id: string }[]) {
    const run = await request(`/v1/entities/run/${lane.run_id}`);
    if (
      run.status !== "failed" ||
      run.native_run_id ||
      run.native_dispatch_id ||
      run.product_tools.length
    )
      throw new Error("Reconcile existing native effects before starting another probe.");
  }
  writeFileSync(
    resolve(directory, "deployed-native-before-fix.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { flag: "wx" },
  );
  writeFileSync(resolve(".dev/nma083-deployed-before-fix.json"), JSON.stringify(state, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  state.lanes = {};
  report.lanes = {};
  report.fresh_probe_after_fix = true;
  report.previous_failed_runs_preserved = true;
  save();
}
if (process.argv.includes("--renew-muse-probe")) {
  const previous = state.lanes.muse;
  const run = await request(`/v1/entities/run/${previous.run_id}`);
  const selected = run.provider_selection;
  const connection = await request(`/v1/entities/connection/${selected.connection_id}`);
  if (
    run.status !== "queued" ||
    run.preparation?.state !== "blocked" ||
    run.native_run_id ||
    run.native_dispatch_id ||
    run.product_tools.length ||
    selected.connection_generation === connection.grant_revision
  )
    throw new Error(
      "Only the observed undispatched stale-choice probe can be replaced explicitly.",
    );
  const cancelled = await request(`/v1/runs/${run.id}/cancel`, {});
  if (cancelled.status !== "cancelled" || cancelled.cancellation !== "confirmed")
    throw new Error("Confirm the original queued probe is stopped before admitting another.");
  writeFileSync(
    resolve(directory, "deployed-muse-stale-choice.json"),
    `${JSON.stringify(
      {
        run_id: run.id,
        selected_generation: selected.connection_generation,
        current_generation: connection.grant_revision,
        account_same: selected.account_id === connection.account_id,
        billing_same: selected.billing_source === connection.authentication.billing_source,
        native_accepted: false,
        tools_dispatched: 0,
        cancellation: "confirmed",
        previous_frozen_choice_preserved: true,
      },
      null,
      2,
    )}\n`,
    { flag: "wx" },
  );
  writeFileSync(resolve(".dev/nma083-muse-stale-choice.json"), JSON.stringify(previous, null, 2), {
    mode: 0o600,
    flag: "wx",
  });
  const provider = providers.muse;
  const inspected = await request(`/v1/connections/${provider.id}/inspect`, {});
  if (
    inspected.account_id !== connection.account_id ||
    inspected.effective_billing_source !== provider.billing_source
  )
    throw new Error(
      "The explicitly retained Muse account/billing changed; select it deliberately before proceeding.",
    );
  await request("/v1/ai/selections", {
    scope: "conversation",
    harness: "muse",
    thread_id: previous.thread_id,
    agent_id: previous.agent_id,
    selection: {
      connection_id: provider.id,
      model_id: provider.model_id,
      reasoning: provider.reasoning,
    },
  });
  state.lanes.muse = {
    agent_id: previous.agent_id,
    thread_id: previous.thread_id,
    command: randomUUID(),
    marker: `NMA083-file-muse-${randomUUID()}`,
  };
  report.muse_stale_choice_cancelled_before_new_probe = true;
  save();
}
if (process.argv.includes("--final-codex")) {
  if (!report.completed || !state.lanes.codex.verified)
    throw new Error("Complete both provider lanes before final-source re-verification.");
  const previous = state.lanes.codex;
  writeFileSync(
    resolve(directory, "deployed-codex-before-catalog-fix.json"),
    `${JSON.stringify(report.lanes.codex, null, 2)}\n`,
    { flag: "wx" },
  );
  state.lanes.codex = {
    agent_id: previous.agent_id,
    thread_id: previous.thread_id,
    command: randomUUID(),
    marker: `NMA083-file-codex-${randomUUID()}`,
    output_path: ".ngertiin-verification/nma083-codex-final.txt",
  };
  report.completed = false;
  report.final_source_reverification = true;
  save();
}
if (process.argv.includes("--codex-read")) {
  const lane = state.lanes.codex;
  if (!lane.run_id) throw new Error("Observe the retained final Codex file probe first.");
  if (!lane.read_probe) {
    lane.read_probe = {
      command: randomUUID(),
      body: {
        thread_id: lane.thread_id,
        agent_id: lane.agent_id,
        text: `Complete the bounded file-grounding verification: call ngertiin.read_attachment for artifact_id ${lane.body.artifact_ids[0]}, page 1, and reply with its exact returned marker. Use the attachment read tool explicitly. Do not write files, use host tools or create Goals/Routine.`,
      },
    };
    save();
  }
  const probe = lane.read_probe;
  if (!probe.run_id) {
    probe.run_id = (await request("/v1/runs", probe.body, probe.command)).run.id;
    save();
  }
  const deadline = Date.now() + 180000;
  let run;
  do {
    run = await request(`/v1/entities/run/${probe.run_id}`);
    if (["succeeded", "failed", "cancelled", "unknown"].includes(run.status)) break;
    if (Date.now() > deadline)
      throw new Error("Observe the existing read probe instead of admitting another.");
    await Bun.sleep(1000);
  } while (true);
  const snapshot = await request(`/v1/threads/${lane.thread_id}/snapshot`);
  const answer = snapshot.messages
    .filter(
      (entry: { author: string; run_id: string }) =>
        entry.author === "agent" && entry.run_id === run.id,
    )
    .map((entry: { text: string }) => entry.text)
    .join("\n");
  const read = run.attachment_observations.find(
    (entry: { artifact_id: string; operation: string }) =>
      entry.artifact_id === lane.body.artifact_ids[0] && entry.operation === "read",
  );
  report.codex_attachment_read_followup = {
    run_id: run.id,
    status: run.status,
    artifact_id: lane.body.artifact_ids[0],
    source_sha256: read?.source_sha256,
    successful_read: Boolean(read),
    marker_in_answer: answer.includes(lane.marker),
    billing: run.provider_selection?.billing_source,
    provider_preserved: run.provider_selection?.connection_id === providers.codex.id,
  };
  save();
  if (run.status !== "succeeded" || !read || !answer.includes(lane.marker))
    throw new Error("The explicit read probe did not establish grounded file access.");
  console.log(JSON.stringify(report.codex_attachment_read_followup));
  process.exit(0);
}
if (process.argv.includes("--schedule")) {
  if (state.routine)
    throw new Error("Observe the existing one-time responsibility before creating another.");
  const lane = state.lanes.codex;
  if (!lane?.verified) throw new Error("Complete the native lanes first.");
  const at = new Date(Date.now() + 45000).toISOString();
  const routine = await request("/v1/routines", {
    thread_id: lane.thread_id,
    agent_id: lane.agent_id,
    instruction:
      "One-time client Quit acceptance check: call ngertiin.read_run_context once and reply NMA083-RESPONSIBILITY-SURVIVED. Do not create any Goal or Routine.",
    schedule: { type: "once", at },
    timezone: "UTC",
  });
  state.routine = { id: routine.id, scheduled_at: at };
  report.routine = { ...state.routine, outcome: "pending_client_quit" };
  save();
  console.log(JSON.stringify({ scheduled: true, at, routine_id: routine.id }));
} else if (process.argv.includes("--observe-routine")) {
  const routine = await request(`/v1/entities/routine/${state.routine.id}`);
  const runs = await request("/v1/entities/run");
  const run = runs.find((entry: { routine_id: string }) => entry.routine_id === routine.id);
  report.routine = {
    ...report.routine,
    outcome: run?.status === "succeeded" ? "completed_while_client_closed" : "pending",
    observed_at: new Date().toISOString(),
    run_id: run?.id,
    status: run?.status ?? "not_admitted",
    native_accepted: Boolean(run?.native_run_id),
    product_tools: run?.product_tools,
    billing: run?.provider_selection?.billing_source,
  };
  save();
  console.log(JSON.stringify(report.routine));
  if (run?.status !== "succeeded") process.exitCode = 1;
} else {
  for (const harness of ["codex", "muse"] as const) {
    if (state.lanes[harness]) continue;
    const provider = providers[harness];
    const inspected = await request(`/v1/connections/${provider.id}/inspect`, {});
    if (
      inspected.login !== "authenticated" ||
      inspected.effective_billing_source !== provider.billing_source
    )
      throw new Error("The selected account/billing requires action; no alternative is allowed.");
    const agent = await request("/v1/agents", {
      name: `NMA-083 ${harness}`,
      harness,
      connection_id: provider.id,
      billing_source: provider.billing_source,
      model_id: provider.model_id,
      reasoning: provider.reasoning,
      instructions: "Complete one-time verification tasks without creating Goals or Routine.",
    });
    const thread = await request(`/v1/agents/${agent.id}/dm`, {});
    state.lanes[harness] = {
      agent_id: agent.id,
      thread_id: thread.id,
      command: randomUUID(),
      marker: `NMA083-file-${harness}-${randomUUID()}`,
    };
    save();
  }
  const outcomes = await Promise.allSettled(
    (["codex", "muse"] as const).map(async (harness) => {
      const lane = state.lanes[harness];
      const provider = providers[harness];
      if (lane.verified && !process.argv.includes("--audit")) return;
      if (!lane.body) {
        const artifact = await request(
          "/v1/message-uploads",
          {
            submission_id: lane.command,
            thread_id: lane.thread_id,
            agent_id: lane.agent_id,
            name: `nma083-${harness}-private.txt`,
            media_type: "text/plain",
            content_base64: Buffer.from(lane.marker + "\n").toString("base64"),
          },
          lane.command,
        );
        lane.body = {
          submission_id: lane.command,
          thread_id: lane.thread_id,
          agent_id: lane.agent_id,
          text: `Perform one-time integrated acceptance using application product tools only. Read the attached text file. Its unique marker is intentionally absent from this prompt. Write its exact bytes to workspace-relative ${lane.output_path ?? `.ngertiin-verification/nma083-${harness}.txt`}, read them back, publish that saved file as an artifact, and obtain Computer desktop state once. Reply with the marker you actually read and the saved file. Do not use host shell/file tools. Do not create a Goal or Routine.`,
          artifact_ids: [artifact.id],
        };
        save();
      }
      if (!lane.run_id) {
        const started = performance.now();
        const admission = await request("/v1/runs", lane.body, lane.command);
        lane.run_id = admission.run.id;
        lane.admission_ms = performance.now() - started;
        save();
      }
      console.log(JSON.stringify({ harness, run_id: lane.run_id, admitted: true }));
      const deadline = Date.now() + 600000;
      let run;
      do {
        run = await request(`/v1/entities/run/${lane.run_id}`);
        if (run.status === "queued" && run.preparation?.state === "blocked") {
          report.lanes[harness] = {
            run_id: run.id,
            status: run.status,
            preparation: run.preparation,
            diagnostic: run.diagnostic,
            native_accepted: Boolean(run.native_run_id),
            completed_inference: false,
          };
          save();
          throw new Error(
            "The existing queued run needs explicit preparation recovery; no new input is admitted.",
          );
        }
        if (["succeeded", "failed", "cancelled", "unknown"].includes(run.status)) break;
        if (Date.now() >= deadline)
          throw new Error("Observe the retained native run; do not resubmit it.");
        await Bun.sleep(1000);
      } while (true);
      const snapshot = await request(`/v1/threads/${lane.thread_id}/snapshot`);
      const answer = snapshot.messages
        .filter(
          (entry: { author: string; run_id: string }) =>
            entry.author === "agent" && entry.run_id === run.id,
        )
        .map((entry: { text: string }) => entry.text)
        .join("\n");
      const replay = await request("/v1/runs", lane.body, lane.command);
      const workspaceBinding = await request(
        `/v1/threads/${lane.thread_id}/workspace?agent_id=${lane.agent_id}`,
      );
      const path = lane.output_path ?? `.ngertiin-verification/nma083-${harness}.txt`;
      let workingBytesVerified = false;
      let artifactBytesVerified = false;
      if (run.status === "succeeded") {
        const content = await request(
          `/v1/workspaces/${workspaceBinding.id}/file?path=${encodeURIComponent(path)}`,
          undefined,
          undefined,
          true,
        );
        workingBytesVerified = (await content.text()) === lane.marker + "\n";
        const artifacts = await request("/v1/entities/artifact");
        const artifact = artifacts.find(
          (entry: { run_id: string; source_path: string }) =>
            entry.run_id === run.id && entry.source_path === path,
        );
        if (artifact) {
          const bytes = await request(
            `/v1/artifacts/${artifact.id}/content?workspace_id=${workspaceBinding.id}`,
            undefined,
            undefined,
            true,
          );
          artifactBytesVerified = (await bytes.text()) === lane.marker + "\n";
        }
      }
      const observation = {
        run_id: run.id,
        agent_id: lane.agent_id,
        thread_id: lane.thread_id,
        status: run.status,
        native_accepted: Boolean(run.native_run_id),
        product_tools: run.product_tools,
        tool_errors: run.tool_errors?.map((entry: { code: string }) => entry.code),
        diagnostic: run.diagnostic,
        admission_ms: lane.admission_ms,
        selected_connection_preserved: run.provider_selection?.connection_id === provider.id,
        billing: run.provider_selection?.billing_source,
        model: run.provider_selection?.model_id,
        account_fingerprint: createHash("sha256")
          .update(run.provider_selection?.account_id ?? "")
          .digest("hex")
          .slice(0, 12),
        file_marker_absent_from_prompt: !lane.body.text.includes(lane.marker),
        grounded_marker_in_answer: answer.includes(lane.marker),
        attachment_observations: run.attachment_observations,
        replay_same_run: replay.run.id === run.id,
        working_bytes_verified: workingBytesVerified,
        artifact_bytes_verified: artifactBytesVerified,
        explicit_attachment_read: run.attachment_observations.some(
          (entry: { artifact_id: string; operation: string }) =>
            entry.artifact_id === lane.body.artifact_ids[0] && entry.operation === "read",
        ),
        actual_computer_observation: run.product_tools.includes("ngertiin.computer_call"),
      };
      report.lanes[harness] = observation;
      save();
      if (
        run.status !== "succeeded" ||
        !observation.grounded_marker_in_answer ||
        !observation.selected_connection_preserved ||
        observation.billing !== provider.billing_source ||
        !observation.replay_same_run ||
        !workingBytesVerified ||
        !artifactBytesVerified ||
        (!observation.explicit_attachment_read &&
          !(
            report.codex_attachment_read_followup?.successful_read &&
            report.codex_attachment_read_followup?.marker_in_answer &&
            report.codex_attachment_read_followup?.artifact_id === lane.body.artifact_ids[0]
          )) ||
        !observation.actual_computer_observation
      )
        throw new Error(
          `The ${harness} native lane failed; inspect the retained report before retrying.`,
        );
      lane.verified = true;
      save();
      console.log(JSON.stringify({ harness, verified: true }));
    }),
  );
  if (outcomes.some((entry) => entry.status === "rejected"))
    throw new Error("Inspect both retained native outcomes before an explicit recovery or retry.");
  report.completed = true;
  report.completed_at = new Date().toISOString();
  save();
}
