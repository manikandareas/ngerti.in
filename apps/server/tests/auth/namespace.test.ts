import { expect, test } from "bun:test";
import { getMigrations } from "better-auth/db/migration";
import { Pool } from "pg";
import { createAuthenticationProvider } from "../../src/auth/provider";
import { authFixture } from "./helpers";

test("provider queries and schema inspection use the explicit auth namespace across pooled search paths", async () => {
  const f = await authFixture();
  const pool = new Pool({
    connectionString: process.env.NGERTIIN_TEST_DATABASE_URL,
    options: "-c search_path=pg_catalog",
    max: 2,
  });
  try {
    const owner = await f.owner();
    const provider = createAuthenticationProvider(
      f.config,
      pool,
      async () => {},
      () => {},
    );
    const changes = await getMigrations(provider.options);
    expect(changes.toBeCreated).toHaveLength(0);
    expect(changes.toBeAdded).toHaveLength(0);
    expect(changes.toBeAddedIndexes).toHaveLength(0);
    const session = await provider.api.getSession({
      headers: new Headers({ Cookie: owner.cookie }),
      query: { disableCookieCache: true, disableRefresh: true },
    });
    expect(session?.user.email).toBe("owner@example.test");
  } finally {
    await pool.end();
    await f.close();
  }
});
