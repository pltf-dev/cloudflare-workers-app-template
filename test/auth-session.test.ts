import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import {
  createSession,
  validateSession,
  destroySession,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  serializeSessionCookie,
  parseSessionCookie,
  expireSessionCookie,
  sessionMetaFromRequest,
} from "../src/lib/auth/session";
import { describeUserAgent } from "../src/lib/auth/user-agent";

describe("sessions", () => {
  const db = getDb(env.DB);
  let userA: number;
  let userB: number;

  beforeEach(async () => {
    await db.delete(schema.sessions);
    await db.delete(schema.users);
    userA = (await createUser(db, { email: "a@example.com" })).id;
    userB = (await createUser(db, { email: "b@example.com" })).id;
  });

  it("round-trips a token to its user and never stores the token itself", async () => {
    const token = await createSession(db, userA);
    expect(token).toMatch(/^[a-f0-9]{32}$/);
    const session = await validateSession(db, token);
    expect(session).toMatchObject({ userId: userA, renewed: false });

    const [row] = await db.select().from(schema.sessions);
    expect(row.tokenHash).not.toBe(token);
  });

  it("rejects expired, random and empty tokens", async () => {
    const token = await createSession(db, userA, { ttlMs: 0 });
    expect(await validateSession(db, token)).toBeNull();
    expect(await validateSession(db, "deadbeef".repeat(4))).toBeNull();
    expect(await validateSession(db, "")).toBeNull();
  });

  it("flags renewal once the cookie is older than the renew interval", async () => {
    const token = await createSession(db, userA, { ttlMs: 3_600_000 });
    expect((await validateSession(db, token))!.renewed).toBe(true);
  });

  it("destroySession invalidates the token", async () => {
    const token = await createSession(db, userA);
    await destroySession(db, token);
    expect(await validateSession(db, token)).toBeNull();
  });

  it("lists, revokes and revokes-others strictly within one user", async () => {
    const a1 = await createSession(db, userA, { userAgent: "Mozilla/5.0 (iPhone) Safari/1" });
    await createSession(db, userA);
    await createSession(db, userB);

    const list = await listSessions(db, userA);
    expect(list).toHaveLength(2);

    const a1Id = (await validateSession(db, a1))!.sessionId;
    await revokeOtherSessions(db, userA, a1Id);
    expect(await listSessions(db, userA)).toHaveLength(1);
    expect(await listSessions(db, userB)).toHaveLength(1);

    const bId = (await listSessions(db, userB))[0].id;
    await revokeSession(db, userA, bId); // wrong owner → no-op
    expect(await listSessions(db, userB)).toHaveLength(1);
    await revokeSession(db, userB, bId);
    expect(await listSessions(db, userB)).toHaveLength(0);
  });

  it("cookie helpers use __Host- only when secure", () => {
    expect(serializeSessionCookie("abc", true)).toMatch(/^__Host-sid=abc; .*Secure.*Max-Age=259200$/);
    expect(serializeSessionCookie("abc", false)).toMatch(/^sid=abc; /);
    expect(parseSessionCookie("x=1; __Host-sid=abc; y=2")).toBe("abc");
    expect(parseSessionCookie("sid=def")).toBe("def");
    expect(parseSessionCookie("")).toBeNull();
    expect(expireSessionCookie(true)).toContain("Max-Age=0");
  });

  it("derives device metadata from the request", () => {
    const req = new Request("http://localhost/", {
      headers: { "user-agent": "Mozilla/5.0 (Macintosh) Chrome/120 Safari/537", "cf-ipcountry": "BR" },
    });
    expect(sessionMetaFromRequest(req)).toEqual({
      userAgent: "Mozilla/5.0 (Macintosh) Chrome/120 Safari/537",
      location: "BR",
    });
    expect(describeUserAgent("Mozilla/5.0 (Macintosh) Chrome/120 Safari/537")).toBe("Mac · Chrome");
    expect(describeUserAgent(null)).toBe("Unknown device");
  });
});
