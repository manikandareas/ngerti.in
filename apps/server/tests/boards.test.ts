import { expect, test } from "bun:test";
import { Artifacts } from "../src/artifacts";
import { Boards } from "../src/boards/service";
import { fixture } from "./helpers";

test("board cards settle from the assigned native run and its verified artifact", async () => {
  const f = await fixture();
  try {
    const boards = new Boards(f.lifecycle);
    const create = async (title: string) =>
      boards.create({
        title,
        instruction: "Produce a verified shift count.",
        assignee_agent_id: f.agent.id,
        required_artifact_name: "shift.txt",
      });
    const start = async (title: string) => {
      const card = await create(title);
      const running = await boards.start(card.id, card.revision);
      await expect(boards.start(card.id, card.revision)).rejects.toMatchObject({
        code: "CONFLICT",
      });
      await f.lifecycle.bind(card.thread_id, f.agent.id, crypto.randomUUID());
      const run = await f.lifecycle.claimNext(card.thread_id, f.agent.id);
      if (!run?.dispatch_token || !run.workspace_id)
        throw new Error("Expected an admitted board run.");
      expect(running.current_run_id).toBe(run.id);
      await f.lifecycle.started(run.id, run.dispatch_token);
      return { card, run, workspaceId: run.workspace_id, token: run.dispatch_token };
    };
    const missing = await start("Missing result");
    await f.lifecycle.appendAnswer(missing.run.id, "Finished.");
    await f.lifecycle.settle(missing.run.id, missing.token, "succeeded");
    await boards.advance();
    expect(await f.store.get("board_card", missing.card.id)).toMatchObject({
      state: "blocked",
      result_artifact_ids: [],
    });
    const waiting = await start("Waiting for a ticket");
    const heartbeat = new Date();
    const ownsClaim = (run: { id: string }) => run.id === waiting.run.id;
    await boards.advance(heartbeat, ownsClaim);
    expect((await f.store.get("board_card", waiting.card.id)).claim_heartbeat_at).toBe(
      heartbeat.toISOString(),
    );
    const later = new Date(heartbeat.getTime() + 6000);
    await boards.advance(later, ownsClaim);
    expect((await f.store.get("board_card", waiting.card.id)).claim_heartbeat_at).toBe(
      later.toISOString(),
    );
    await boards.block(waiting.run.id, { blocker: "The operator ticket is missing." });
    await boards.advance();
    expect((await f.store.get("board_card", waiting.card.id)).state).toBe("running");
    await f.lifecycle.settle(waiting.run.id, waiting.token, "succeeded");
    await boards.advance();
    const blocked = await f.store.get("board_card", waiting.card.id);
    expect(blocked).toMatchObject({ state: "blocked", blocker: "The operator ticket is missing." });
    const resumed = await boards.resume(blocked.id, {
      expected_revision: blocked.revision,
      information: "Operator ticket LIFT-714",
    });
    expect(resumed).toMatchObject({
      id: blocked.id,
      state: "running",
      blocker: null,
      claim_heartbeat_at: null,
    });
    const resumedRun = await f.store.get("run", resumed.current_run_id);
    expect(resumedRun.id).not.toBe(waiting.run.id);
    expect((await f.store.get("message", resumedRun.input_message_id)).text).toContain(
      "Operator ticket LIFT-714",
    );
    await expect(
      boards.resume(blocked.id, {
        expected_revision: blocked.revision,
        information: "Operator ticket LIFT-714",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const { card, run, token, workspaceId } = await start("Verified result");
    await expect(
      boards.submit(run.id, { summary: "Checked", artifact_ids: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const successor = await boards.create({
      title: "Check the approved count",
      instruction: "Read the approved input.",
      assignee_agent_id: f.agent.id,
      dependency_ids: [card.id],
    });
    await boards.start(successor.id, successor.revision);

    const artifacts = new Artifacts(f.lifecycle);
    const files = await artifacts.workspaces.files(workspaceId);
    const authorize = () => f.lifecycle.authorizeDispatch(run.id, token).then(() => undefined);
    files.create("draft/shift.txt", Buffer.from("19 units\n"));
    const draft = await artifacts.publish(
      crypto.randomUUID(),
      { workspace_id: workspaceId, run_id: run.id, path: "draft/shift.txt" },
      authorize,
    );
    files.create("reviewed/shift.txt", Buffer.from("17 units\n"));
    const file = await artifacts.publish(
      crypto.randomUUID(),
      { workspace_id: workspaceId, run_id: run.id, path: "reviewed/shift.txt" },
      authorize,
    );
    await boards.submit(run.id, { summary: "Verified 17 units", artifact_ids: [file.id] });
    await boards.advance();
    expect((await f.store.get("board_card", card.id)).state).toBe("running");
    expect(await f.store.get("board_card", successor.id)).toMatchObject({
      state: "waiting",
      current_run_id: null,
    });
    await f.lifecycle.settle(run.id, token, "succeeded");
    await boards.advance();
    await boards.advance();
    expect((await boards.list()).find((item) => item.id === card.id)).toMatchObject({
      state: "done",
      submission: { summary: "Verified 17 units" },
      artifacts: [{ id: file.id, name: "shift.txt", workspace_id: workspaceId }],
    });
    const next = await f.store.get("board_card", successor.id);
    expect(next.state).toBe("running");
    const [queued] = await f.store.list("run", { thread_id: next.thread_id });
    expect(queued.id).toBe(next.current_run_id as string);
    const request = await f.store.get("message", queued.input_message_id);
    expect(request.artifact_ids).toHaveLength(1);
    const input = await f.store.get("artifact", request.artifact_ids[0]);
    expect(input).toMatchObject({ source_artifact_id: file.id, sha256: file.sha256 });
    expect(input.sha256).not.toBe(draft.sha256);
    const materialized = await artifacts.materialize(input.id);
    expect(materialized.materialization).toBe("ready");
    expect(
      (await artifacts.download(input.id, input.workspace_id as string)).bytes.toString(),
    ).toBe("17 units\n");
  } finally {
    await f.close();
  }
});

test("a review returns concrete changes to the same card and approves only the new submission", async () => {
  const f = await fixture();
  try {
    const worker = await f.store.get("agent", f.agent.id);
    const reviewer = await f.lifecycle.createAgent({
      name: "Reviewer",
      harness: "codex",
      connection_id: worker.connection_id,
    });
    const boards = new Boards(f.lifecycle);
    const card = await boards.create({
      title: "Verify a release",
      instruction: "Produce a signed release note.",
      assignee_agent_id: f.agent.id,
      reviewer_agent_id: reviewer.id,
      required_artifact_name: "release.txt",
    });
    await boards.start(card.id, card.revision);
    for (const agent of [f.agent, reviewer])
      await f.lifecycle.bind(card.thread_id, agent.id, crypto.randomUUID());
    const start = async (agentId: string) => {
      const run = await f.lifecycle.claimNext(card.thread_id, agentId);
      if (!run?.workspace_id || !run.dispatch_token) throw new Error("Expected card work.");
      await f.lifecycle.started(run.id, run.dispatch_token);
      return { run, token: run.dispatch_token, workspaceId: run.workspace_id };
    };
    const artifacts = new Artifacts(f.lifecycle);
    const work = async (path: string) => {
      const { run, token, workspaceId } = await start(f.agent.id);
      (await artifacts.workspaces.files(workspaceId)).create(path, Buffer.from(path));
      const file = await artifacts.publish(
        crypto.randomUUID(),
        { workspace_id: workspaceId, run_id: run.id, path },
        async () => {
          await f.lifecycle.authorizeDispatch(run.id, token);
        },
      );
      await boards.submit(run.id, { summary: "Release note", artifact_ids: [file.id] });
      await f.lifecycle.settle(run.id, token, "succeeded");
      await boards.advance();
      return file.id;
    };
    const draft = await work("draft/release.txt");
    const first = await start(reviewer.id);
    expect((await f.store.get("message", first.run.input_message_id)).artifact_ids).toEqual([
      draft,
    ]);
    await boards.review(first.run.id, {
      decision: "request_changes",
      findings: "Add the operator sign-off.",
    });
    await f.lifecycle.settle(first.run.id, first.token, "succeeded");
    await boards.advance();
    const revising = await f.store.get("board_card", card.id);
    expect(revising).toMatchObject({
      state: "running",
      review_feedback: "Add the operator sign-off.",
      result_artifact_ids: [],
    });
    const correction = await f.store.get("run", revising.current_run_id);
    expect((await f.store.get("message", correction.input_message_id)).text).toContain(
      "Add the operator sign-off.",
    );
    const revised = await work("revised/release.txt");
    const final = await start(reviewer.id);
    expect((await f.store.get("message", final.run.input_message_id)).artifact_ids).toEqual([
      revised,
    ]);
    await boards.review(final.run.id, {
      decision: "approve",
      findings: "Operator sign-off confirmed.",
    });
    await boards.advance();
    expect((await f.store.get("board_card", card.id)).state).toBe("review");
    await f.lifecycle.settle(final.run.id, final.token, "succeeded");
    await boards.advance();
    expect(await f.store.get("board_card", card.id)).toMatchObject({
      state: "done",
      result_artifact_ids: [revised],
      review_decision: { decision: "approve" },
    });
  } finally {
    await f.close();
  }
});
