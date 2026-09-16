import { eq, and, gt, desc, ne } from "drizzle-orm";
import type { Db } from "../../db/client";
import { sessions } from "../../db/schema";

export const SESSION_TTL_MS = 259_200_000; // 3 days (sliding window)
const RENEW_INTERVAL_MS = 43_200_000; // 12h: re-issue the cookie at most ~once per 12h of activity
const COOKIE_MAX_AGE = Math.floor(SESSION_TTL_MS / 1000); // seconds

export interface CreateSessionOpts {
  ttlMs?: number;
  userAgent?: string | null;
  location?: string | null;
}

export async function createSession(
  db: Db,
  userId: number,
  opts: CreateSessionOpts = {},
): Promise<string> {
  const ttlMs = opts.ttlMs ?? SESSION_TTL_MS;
  const raw = new Uint8Array(16);
  crypto.getRandomValues(raw);
  const token = Array.from(raw)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const tokenHash = await sha256(token);
  const now = new Date();

  await db.insert(sessions).values({
    tokenHash,
    userId,
    expiresAt: new Date(now.getTime() + ttlMs),
    lastSeen: now,
    createdAt: now,
    userAgent: opts.userAgent ?? null,
    location: opts.location ?? null,
  });

  return token;
}

export interface ValidatedSession {
  userId: number;
  sessionId: number;
  renewed: boolean;
}

/** True when at least RENEW_INTERVAL_MS has elapsed since the cookie was last issued. */
export function shouldRenewCookie(oldExpiresAt: Date, now: Date): boolean {
  return oldExpiresAt.getTime() - now.getTime() < SESSION_TTL_MS - RENEW_INTERVAL_MS;
}

/** Extract device metadata from an inbound request for session display. */
export function sessionMetaFromRequest(
  request: Request,
): { userAgent: string | null; location: string | null } {
  const userAgent = request.headers.get("user-agent");
  return { userAgent: userAgent || null, location: locationFromRequest(request) };
}

/** "City, CC" from the Cloudflare request geo, falling back to the country header. */
function locationFromRequest(request: Request): string | null {
  const cf = (request as unknown as { cf?: { city?: unknown; country?: unknown } }).cf;
  const city = typeof cf?.city === "string" ? cf.city : null;
  let country = typeof cf?.country === "string" ? cf.country : null;
  if (!country) {
    const header = request.headers.get("cf-ipcountry");
    if (header && header !== "XX") country = header;
  }
  if (!country) return null;
  return city ? `${city}, ${country}` : country;
}

export async function validateSession(
  db: Db,
  token: string,
): Promise<ValidatedSession | null> {
  if (!token) return null;

  const tokenHash = await sha256(token);
  const now = new Date();

  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);

  if (!row) return null;

  const renewed = shouldRenewCookie(row.expiresAt, now);

  await db
    .update(sessions)
    .set({ lastSeen: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) })
    .where(eq(sessions.id, row.id));

  return { userId: row.userId, sessionId: row.id, renewed };
}

export async function destroySession(db: Db, token: string): Promise<void> {
  if (!token) return;
  const tokenHash = await sha256(token);
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export interface SessionRow {
  id: number;
  userAgent: string | null;
  location: string | null;
  lastSeen: Date;
  createdAt: Date;
}

export async function listSessions(db: Db, userId: number): Promise<SessionRow[]> {
  return db
    .select({
      id: sessions.id,
      userAgent: sessions.userAgent,
      location: sessions.location,
      lastSeen: sessions.lastSeen,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeen));
}

export async function revokeSession(db: Db, userId: number, id: number): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.id, id), eq(sessions.userId, userId)));
}

export async function revokeOtherSessions(db: Db, userId: number, keepId: number): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.id, keepId)));
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Cookie helpers

export function serializeSessionCookie(token: string, secure: boolean): string {
  const name = secure ? "__Host-sid" : "sid";
  const flags = secure
    ? `Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${COOKIE_MAX_AGE}`
    : `Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
  return `${name}=${token}; ${flags}`;
}

export function parseSessionCookie(cookieHeader: string): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(";").map((p) => p.trim());
  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=");
    const name = key.trim();
    if (name === "__Host-sid" || name === "sid") {
      const val = rest.join("=").trim();
      return val || null;
    }
  }
  return null;
}

export function expireSessionCookie(secure: boolean): string {
  const name = secure ? "__Host-sid" : "sid";
  const flags = secure
    ? "Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0"
    : "Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  return `${name}=; ${flags}`;
}
