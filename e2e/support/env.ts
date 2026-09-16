import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Where the E2E dev server keeps its D1/R2. Handed to `astro dev` as
 * E2E_STATE_DIR (see astro.config.mjs) and to `wrangler --persist-to`, which
 * agree on the same `<dir>/v3/...` layout. Kept out of `.wrangler/state` so a
 * run can never read or clobber local dev data.
 */
export const STATE_DIR = path.join(REPO_ROOT, ".e2e/state");

/** Written by auth.setup.ts, read by login.spec.ts. */
export const AUTH_DIR = path.join(REPO_ROOT, ".e2e/auth");
export const STORAGE_STATE = path.join(AUTH_DIR, "user.json");
export const ACCOUNT_FILE = path.join(AUTH_DIR, "account.json");

/**
 * Deliberately not 4321: other checkouts run their own dev servers,
 * and Astro silently walks to the next free port when its first choice is
 * taken — which historically meant testing a *different* checkout's app.
 * A dedicated port plus `reuseExistingServer: false` makes that impossible.
 */
export const PORT = Number(process.env.E2E_PORT ?? 4399);

/** The dev server binds IPv6-only, so `127.0.0.1` is refused. Always `localhost`. */
export const BASE_URL = `http://localhost:${PORT}`;

const DEV_VARS = path.join(REPO_ROOT, ".dev.vars");
const SECRET_KEY = "OTP_HMAC_SECRET";

/**
 * The OTP secret the dev server will hash codes with, so the suite can mint a
 * code the UI will accept (see support/otp.ts).
 *
 * An existing `.dev.vars` is read and never written to — it holds the
 * maintainer's real local secrets. Only when the file is absent (CI, a fresh
 * worktree) is a minimal one created. `.dev.vars` is gitignored either way.
 */
export function resolveOtpSecret(): string {
  if (existsSync(DEV_VARS)) {
    const found = readDevVar(readFileSync(DEV_VARS, "utf8"), SECRET_KEY);
    if (found) return found;
    throw new Error(
      `.dev.vars exists but has no ${SECRET_KEY}. Add one (openssl rand -hex 32) — ` +
        "the E2E suite needs it to mint a login code the app will accept.",
    );
  }

  const secret = randomBytes(32).toString("hex");
  writeFileSync(
    DEV_VARS,
    "# Created by the Playwright E2E suite because no .dev.vars was present.\n" +
      "# Safe to edit or delete; it is gitignored.\n" +
      `${SECRET_KEY}="${secret}"\n`,
  );
  return secret;
}

/** Minimal `KEY="value"` reader — enough for the one var we need. */
function readDevVar(contents: string, key: string): string | null {
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1 || trimmed.slice(0, eq).trim() !== key) continue;
    return trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return null;
}
