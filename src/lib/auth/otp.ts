import { eq, and, gt, isNull, desc, sql } from "drizzle-orm";
import type { Db } from "../../db/client";
import { authCodes } from "../../db/schema";

const CODE_TTL_MS = 600_000; // 10 minutes
const THROTTLE_WINDOW_MS = 900_000; // 15 minutes
const THROTTLE_MAX_CODES = 3;
const MAX_ATTEMPTS = 3;

export function generateCode(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return String(arr[0] % 1_000_000).padStart(6, "0");
}

/**
 * 128-bit random token for the emailed login link. Same shape and entropy as
 * the session token in `createSession`. Unlike the 6-digit code this needs no
 * attempt cap — the keyspace makes brute force irrelevant.
 */
export function generateLinkToken(): string {
  const raw = new Uint8Array(16);
  crypto.getRandomValues(raw);
  return Array.from(raw)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time comparison of two hex-encoded hashes (length-guarded). */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return (crypto.subtle as any).timingSafeEqual(ab, bb) as boolean;
}

export async function hashCode(secret: string, code: string): Promise<string> {
  if (!secret) throw new Error("OTP_HMAC_SECRET must not be empty");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(code));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function storeCode(
  db: Db,
  email: string,
  codeHash: string,
  ttlMs: number = CODE_TTL_MS,
  linkTokenHash?: string,
): Promise<void> {
  const now = Date.now();
  await db.insert(authCodes).values({
    email,
    codeHash,
    linkTokenHash: linkTokenHash ?? null,
    expiresAt: new Date(now + ttlMs),
    createdAt: new Date(now),
  });
}

export async function checkThrottle(
  db: Db,
  email: string,
  windowMs: number = THROTTLE_WINDOW_MS,
  maxCodes: number = THROTTLE_MAX_CODES,
): Promise<{ allowed: boolean; remaining: number }> {
  const since = new Date(Date.now() - windowMs);
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(authCodes)
    .where(and(eq(authCodes.email, email), gt(authCodes.createdAt, since)));

  const count = result?.count ?? 0;
  const remaining = Math.max(0, maxCodes - count);
  return { allowed: count < maxCodes, remaining };
}

type VerifyResult =
  | { valid: true }
  | { valid: false; reason: "no_code" | "max_attempts" | "mismatch" };

export async function verifyCode(
  db: Db,
  secret: string,
  email: string,
  code: string,
): Promise<VerifyResult> {
  const now = new Date();
  const [row] = await db
    .select()
    .from(authCodes)
    .where(
      and(
        eq(authCodes.email, email),
        isNull(authCodes.usedAt),
        gt(authCodes.expiresAt, now),
      ),
    )
    .orderBy(desc(authCodes.createdAt))
    .limit(1);

  if (!row) return { valid: false, reason: "no_code" };

  const newAttempts = row.attempts + 1;
  await db
    .update(authCodes)
    .set({ attempts: newAttempts })
    .where(eq(authCodes.id, row.id));

  if (newAttempts > MAX_ATTEMPTS) {
    await db
      .update(authCodes)
      .set({ usedAt: now })
      .where(eq(authCodes.id, row.id));
    return { valid: false, reason: "max_attempts" };
  }

  const inputHash = await hashCode(secret, code);
  if (!timingSafeEqualHex(row.codeHash, inputHash)) {
    return { valid: false, reason: "mismatch" };
  }

  await db
    .update(authCodes)
    .set({ usedAt: now })
    .where(eq(authCodes.id, row.id));

  return { valid: true };
}

type LinkVerifyResult =
  | { valid: true; email: string }
  | { valid: false; reason: "not_found" };

/**
 * Verify an emailed login-link token.
 *
 * The row is found *by* `link_token_hash` in an indexed WHERE, so there is no
 * application-level comparison to make constant-time (same approach as
 * `validateSession`). `timingSafeEqualHex` stays with the 6-digit code, whose
 * small keyspace is what makes timing leaks worth defending.
 *
 * Consumes only `link_used_at` — never `used_at`, never `attempts` — so the
 * typed code on the same row survives a link click (or a scanner prefetch).
 *
 * The verify-and-consume happens as a single conditional UPDATE (the WHERE
 * clause is the guard, the SET is the consume) rather than a SELECT followed
 * by an UPDATE. Two concurrent requests for the same token cannot both win a
 * read-then-write — a scanner prefetch racing the user's click would mint
 * two sessions from one single-use credential.
 *
 * One generic failure reason on purpose: callers must not be able to tell
 * "expired" from "already used" from "never existed".
 */
export async function verifyLinkToken(
  db: Db,
  secret: string,
  token: string,
): Promise<LinkVerifyResult> {
  if (!token) return { valid: false, reason: "not_found" };

  const now = new Date();
  const tokenHash = await hashCode(secret, token);

  // Single atomic statement: the WHERE clause is the guard and the UPDATE is the
  // consume, so two concurrent requests for the same token cannot both win. A
  // read-then-write here would let a scanner prefetch racing the user's click
  // mint two sessions from one single-use credential.
  const [row] = await db
    .update(authCodes)
    .set({ linkUsedAt: now })
    .where(
      and(
        eq(authCodes.linkTokenHash, tokenHash),
        isNull(authCodes.linkUsedAt),
        gt(authCodes.expiresAt, now),
      ),
    )
    .returning({ email: authCodes.email });

  if (!row) return { valid: false, reason: "not_found" };

  return { valid: true, email: row.email };
}
