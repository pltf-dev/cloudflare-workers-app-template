import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import { createSession, validateSession } from "../src/lib/auth/session";
import { POST } from "../src/pages/api/auth/logout";

describe("POST /api/auth/logout", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  it("destroys the session named by the cookie and expires it", async () => {
    const user = await createUser(db, { email: "u@example.com" });
    const token = await createSession(db, user.id);

    const res = await POST({
      request: new Request("http://localhost/api/auth/logout", { method: "POST", headers: { cookie: `sid=${token}` } }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await validateSession(db, token)).toBeNull();
  });

  it("is a no-op without a cookie", async () => {
    const res = await POST({ request: new Request("http://localhost/api/auth/logout", { method: "POST" }) });
    expect(res.status).toBe(200);
  });
});
