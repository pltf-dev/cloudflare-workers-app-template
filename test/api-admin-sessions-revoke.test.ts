import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import { createSession, listSessions, validateSession } from "../src/lib/auth/session";
import { POST } from "../src/pages/api/admin/sessions/revoke";

function post(form: Record<string, string>, locals: { userId?: number; sessionId?: number }) {
  const body = new URLSearchParams(form);
  return POST({
    request: new Request("http://localhost/api/admin/sessions/revoke", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
    locals,
  });
}

describe("POST /api/admin/sessions/revoke", () => {
  const db = getDb(env.DB);
  let alice: number;
  let bob: number;
  let current: number;
  let other: number;
  let bobs: number;

  beforeEach(async () => {
    await db.delete(schema.sessions);
    await db.delete(schema.users);
    alice = (await createUser(db, { email: "alice@example.com" })).id;
    bob = (await createUser(db, { email: "bob@example.com" })).id;
    current = (await validateSession(db, await createSession(db, alice)))!.sessionId;
    other = (await validateSession(db, await createSession(db, alice)))!.sessionId;
    bobs = (await validateSession(db, await createSession(db, bob)))!.sessionId;
  });

  it("revokes one of the caller's other sessions", async () => {
    const res = await post({ id: String(other) }, { userId: alice, sessionId: current });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/admin/account?saved=device");
    expect((await listSessions(db, alice)).map((s) => s.id)).toEqual([current]);
  });

  it("refuses to revoke the current session and ignores other users' ids", async () => {
    const self = await post({ id: String(current) }, { userId: alice, sessionId: current });
    expect(self.headers.get("location")).toBe("/admin/account?error=current");

    await post({ id: String(bobs) }, { userId: alice, sessionId: current });
    expect(await listSessions(db, bob)).toHaveLength(1);
    expect(await listSessions(db, alice)).toHaveLength(2);
  });

  it("all=1 signs out every other device", async () => {
    const res = await post({ all: "1" }, { userId: alice, sessionId: current });
    expect(res.headers.get("location")).toBe("/admin/account?saved=devices");
    expect((await listSessions(db, alice)).map((s) => s.id)).toEqual([current]);
    expect(await listSessions(db, bob)).toHaveLength(1);
  });

  it("returns 401 without locals (middleware normally guarantees them)", async () => {
    expect((await post({ all: "1" }, {})).status).toBe(401);
  });
});
