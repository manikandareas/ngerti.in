import { expect, test } from "bun:test";
import { authFixture } from "../../../apps/server/tests/auth/helpers";

test("forty sequential authentication initializations match the pinned schema on the deployment target", async () => {
  for (let i = 0; i < 40; i++) {
    const f = await authFixture();
    expect(f.auth.config.schema).toStartWith("auth_");
    await f.close();
  }
}, 120000);

test("forty concurrent-batch authentication initializations match the pinned schema on the deployment target", async () => {
  for (let batch = 0; batch < 10; batch++) {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => authFixture()));
    for (const result of results)
      if (result.status === "fulfilled") {
        expect(result.value.auth.config.schema).toStartWith("auth_");
        await result.value.close();
      }
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
}, 120000);
