import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, PORT, STATE_DIR, STORAGE_STATE } from "./e2e/support/env.ts";

const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  // The specs share one scratch database and one user account, so they must
  // not race each other. Ordering is expressed through project dependencies.
  workers: 1,
  reporter: CI ? [["html", { open: "never" }], ["list"]] : [["list"]],

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "en-US",
  },

  projects: [
    {
      // Creating the account is itself a test AND the precondition for the rest.
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: STORAGE_STATE },
    },
  ],

  webServer: {
    // The reset is chained onto the server's own command rather than run from a
    // `globalSetup` hook: Playwright starts web servers BEFORE globalSetup, so
    // resetting there would delete the database out from under the running dev
    // server. See e2e/prepare-state.ts.
    command: `node e2e/prepare-state.ts && pnpm dev --port ${PORT}`,
    url: BASE_URL,
    // Never adopt a dev server this suite didn't start: another checkout may be
    // running its own, and testing the wrong app is a silent failure mode.
    reuseExistingServer: false,
    timeout: 120_000,
    // Surfaced so the dev server's own errors (and the OTP it logs) show up in
    // the test output; stderr is piped by default.
    stdout: "pipe",
    env: { E2E_STATE_DIR: STATE_DIR },
  },
});
