import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProfileLaunch } from "../../../apps/server/src/harness/acp/profiles";

/** Verification-only native event observation; no raw provider messages or tool data. */
export function observeOpenCode(launch: ProfileLaunch) {
  const file = join(launch.context.state_directory, "opencode-event-probe.mjs");
  writeFileSync(file, `
const send = value => process.stderr.write("NGERTIIN_ACP_EVENT " + JSON.stringify(value) + "\\n");
export default async () => {
  send({ kind: "ready" });
  return { event: async ({event}) => {
    const props = event.properties;
    if (event.type === "session.status") send({sessionId: props.sessionID, kind: props.status.type, reason: props.status.action?.reason, attempt: props.status.attempt, next: props.status.next});
    if (event.type === "session.error") send({sessionId: props.sessionID, kind: "error", name: props.error?.name});
  }};
};
`, { mode: 0o600 });
  const configuration = JSON.parse(launch.context.env.OPENCODE_CONFIG_CONTENT);
  launch.context.env.OPENCODE_CONFIG_CONTENT = JSON.stringify({ ...configuration, plugin: [...configuration.plugin, pathToFileURL(file).href] });
}
