import { hashCode } from "../../src/lib/auth/otp.ts";
import { execSql, querySql, sqlString } from "./db.ts";
import { resolveOtpSecret } from "./env.ts";

/** The code every spec types. Any 6 digits work; the hash is what must match. */
export const E2E_CODE = "123456";

const TTL_MS = 600_000;

/**
 * Give the browser a login code it can actually type.
 *
 * In dev the real code is only logged by /api/auth/send-code, never emailed, so
 * there is nothing a browser can legitimately read. Instead of scraping the dev
 * server's stdout, the suite mints its own, hashing it with the app's own
 * `hashCode()` and writing the row straight into `auth_codes`. Importing that
 * function rather than re-deriving the HMAC here means a change to the hashing
 * scheme breaks this loudly instead of silently.
 *
 * Call this AFTER the UI has submitted the email. It asserts send-code stored a
 * row first (so a broken send-code still fails the test), then replaces the rows
 * for that email so `verifyCode` (newest unused, unexpired row) can't tie-break
 * against the app's own row on an identical created_at.
 */
export async function mintLoginCode(email: string): Promise<void> {
  const rows = querySql<{ n: number }>(
    `SELECT count(*) AS n FROM auth_codes WHERE email = ${sqlString(email)} AND used_at IS NULL;`,
  );
  if ((rows[0]?.n ?? 0) === 0) {
    throw new Error(`no pending auth_codes row for ${email}: /api/auth/send-code did not store a code`);
  }

  const now = Date.now();
  const hash = await hashCode(resolveOtpSecret(), E2E_CODE);
  execSql(
    `DELETE FROM auth_codes WHERE email = ${sqlString(email)};` +
      ` INSERT INTO auth_codes (email, code_hash, expires_at, attempts, created_at)` +
      ` VALUES (${sqlString(email)}, ${sqlString(hash)}, ${now + TTL_MS}, 0, ${now});`,
  );
}
