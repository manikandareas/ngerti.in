// Account authority fixture only; never performs provider inference or conversation execution.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

let account = process.env.OPENAI_API_KEY
  ? { type: "apiKey" }
  : { type: "chatgpt", email: "fixture@example.test", planType: "plus" };
for await (const line of (await import("node:readline")).createInterface({
  input: process.stdin,
})) {
  const message = JSON.parse(line);
  const p = message.params ?? {};
  let result: unknown;
  switch (message.method) {
    case "initialize":
      result = { userAgent: "fixture-0.169.0" };
      break;
    case "initialized":
      continue;
    case "account/read": {
      if (p.refreshToken) {
        const file = join(process.env.CODEX_HOME as string, "fixture-auth-count.json");
        const previous = (await Bun.file(file).exists())
          ? await Bun.file(file).json()
          : { refreshes: 0 };
        writeFileSync(file, JSON.stringify({ refreshes: previous.refreshes + 1 }));
      }
      result = { account };
      break;
    }
    case "account/login/start":
      if (p.type === "apiKey") {
        account = { type: "apiKey" };
        result = { type: "apiKey" };
      } else
        result = {
          type: "chatgptDeviceCode",
          loginId: crypto.randomUUID(),
          verificationUrl: "https://auth.openai.com/codex/device",
          userCode: "FIXTURE-ONLY",
        };
      break;
    case "account/login/cancel":
    case "account/logout":
      result = {};
      break;
    case "model/list":
      result = {
        data: [
          {
            id: "model-a",
            model: "model-a",
            supportedReasoningEfforts: [{ reasoningEffort: "high" }],
          },
        ],
        nextCursor: null,
      };
      break;
    default:
      throw new Error("Execution methods must never reach the credential authority.");
  }
  process.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`);
}
