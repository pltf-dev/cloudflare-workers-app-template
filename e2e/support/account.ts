import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ACCOUNT_FILE } from "./env.ts";

export type Account = { email: string; name: string };

/**
 * The account auth.setup.ts signs in as, handed to the specs that follow.
 *
 * Unique per run: the scratch D1 is rebuilt every time, but a rerun against a
 * surviving one (or a future spec that reuses state) must never collide on the
 * unique email constraint.
 */
export function newAccount(): Account {
  const stamp = Date.now().toString(36);
  return { email: `e2e-${stamp}@cf-app.test`, name: "E2E User" };
}

export function saveAccount(account: Account): void {
  mkdirSync(path.dirname(ACCOUNT_FILE), { recursive: true });
  writeFileSync(ACCOUNT_FILE, JSON.stringify(account, null, 2));
}

export function loadAccount(): Account {
  try {
    return JSON.parse(readFileSync(ACCOUNT_FILE, "utf8")) as Account;
  } catch {
    throw new Error(
      "no E2E account on disk — auth.setup.ts must run first (it is the `setup` project)",
    );
  }
}
