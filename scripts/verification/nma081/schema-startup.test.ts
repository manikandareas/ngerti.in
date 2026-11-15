import { test, expect } from "bun:test";
import { authFixture } from "../../../apps/server/tests/auth/helpers";

test("repeated independent authentication startup matches its pinned schema", async () => {
  for (let batch = 0; batch < 10; batch++) {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => authFixture()));
    for (const result of results) {
      if (result.status === "fulfilled") {
        expect(result.value.auth.config.schema).toStartWith("auth_");
        await result.value.close();
      }
    }
    const failed = results.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
  }
}, 45000);
