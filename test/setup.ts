import { applyD1Migrations, env, type D1Migration } from "cloudflare:test";
import { beforeAll } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

// The Worker bindings are declared on `Cloudflare.Env` in
// src/env.d.ts. Here we only add the test-only migrations binding that
// vitest.config.ts injects via miniflare.
declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
