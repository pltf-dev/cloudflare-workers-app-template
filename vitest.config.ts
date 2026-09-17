import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));

  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2025-09-01",
          compatibilityFlags: ["nodejs_compat"],
          d1Databases: ["DB"],
          r2Buckets: ["MEDIA"],
          // TEST_MIGRATIONS feeds test/setup.ts; the rest mirrors what the Worker reads
          // from `cloudflare:workers` env in production.
          bindings: {
            TEST_MIGRATIONS: migrations,
            APP_ORIGIN: "https://cf-app.example.com",
            OTP_HMAC_SECRET: "test-hmac-secret",
            RESEND_API_KEY: "re_test",
          },
        },
      }),
    ],
    test: {
      // Without this, vitest's default glob also claims e2e/*.spec.ts, which are
      // Playwright specs and cannot run in the workers pool.
      include: ["test/**/*.test.ts"],
      setupFiles: ["./test/setup.ts"],
    },
  };
});
