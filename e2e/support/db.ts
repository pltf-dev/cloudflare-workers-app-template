import { execFileSync } from "node:child_process";
import { REPO_ROOT, STATE_DIR } from "./env.ts";

const D1_EXECUTE = ["d1", "execute", "cf-app", "--local", "--persist-to", STATE_DIR];

/**
 * Run SQL against the scratch D1 the E2E dev server is using.
 *
 * `wrangler d1 execute --local --persist-to` writes the same SQLite file the
 * running dev server reads, so a row written here is visible to the next
 * request — no restart, no cache to bust.
 */
export function execSql(sql: string): void {
  wrangler([...D1_EXECUTE, "--command", sql]);
}

/** As `execSql`, but returns the selected rows. */
export function querySql<T = Record<string, unknown>>(sql: string): T[] {
  const out = wrangler([...D1_EXECUTE, "--json", "--command", sql]);
  // pnpm prefixes its own lines before wrangler's JSON; take from the first bracket.
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`no JSON in wrangler output:\n${out}`);
  const parsed = JSON.parse(out.slice(start)) as Array<{ results: T[] }>;
  return parsed[0]?.results ?? [];
}

/** Apply every migration to a freshly created scratch state dir. */
export function applyMigrations(): void {
  wrangler(["d1", "migrations", "apply", "cf-app", "--local", "--persist-to", STATE_DIR]);
}

/**
 * SQL string literal escaping. Only ever wraps values this suite generates
 * (emails, hex hashes), but quoting them properly keeps a stray
 * apostrophe from turning into a confusing syntax error.
 */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function wrangler(args: string[]): string {
  try {
    return execFileSync("pnpm", ["exec", "wrangler", ...args], {
      cwd: REPO_ROOT,
      stdio: "pipe",
      encoding: "utf8",
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    throw new Error(
      `wrangler ${args.slice(0, 3).join(" ")} failed:\n${e.stderr ?? ""}${e.stdout ?? ""}`,
    );
  }
}
