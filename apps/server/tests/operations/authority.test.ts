import { expect, test } from "bun:test";
import { offlineDatabase } from "../../src/operations/database";
import { Store } from "../../src/store";
import { fixture } from "../helpers";

test("offline recovery and application lifecycle authority are mutually exclusive", async () => {
  const f = await fixture();
  const env = {
    NGERTIIN_DATABASE_URL: f.options.connectionString as string,
    NGERTIIN_DATABASE_SCHEMA: f.store.schema,
  };
  let offline: Awaited<ReturnType<typeof offlineDatabase>> | undefined;
  let reopened: Store | undefined;
  try {
    await expect(offlineDatabase(env)).rejects.toThrow("authority could not be acquired");
    await f.store.close();
    offline = await offlineDatabase(env);
    await expect(Store.open(f.store.path, f.owner, f.options)).rejects.toThrow(
      "Another application authority",
    );
    await offline.end();
    offline = undefined;
    reopened = await Store.open(f.store.path, f.owner, f.options);
    await reopened.assertAuthority();
    expect(reopened.closed).toBe(false);
  } finally {
    await offline?.end();
    await reopened?.close();
    await f.close();
  }
});
