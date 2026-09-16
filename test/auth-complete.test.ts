import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser, findUserByEmail } from "../src/db/users";
import { completeAuth } from "../src/lib/auth/complete-auth";
import { validateSession } from "../src/lib/auth/session";

const request = () => new Request("http://localhost/api/auth/verify-code", { method: "POST" });

describe("completeAuth", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  it("signs an existing user in", async () => {
    const user = await createUser(db, { email: "known@example.com" });
    const outcome = await completeAuth(db, "known@example.com", request(), undefined);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error();
    expect((await validateSession(db, outcome.sessionToken))!.userId).toBe(user.id);
  });

  it("creates the user on first sign-in when signup is open", async () => {
    const outcome = await completeAuth(db, "new@example.com", request(), undefined);
    expect(outcome.ok).toBe(true);
    expect(await findUserByEmail(db, "new@example.com")).not.toBeNull();
  });

  it("refuses an unknown email that is not on the allowlist, and admits one that is", async () => {
    expect(await completeAuth(db, "x@example.com", request(), "ok@example.com")).toEqual({ ok: false });
    expect(await findUserByEmail(db, "x@example.com")).toBeNull();
    expect((await completeAuth(db, "ok@example.com", request(), "ok@example.com")).ok).toBe(true);
  });
});
