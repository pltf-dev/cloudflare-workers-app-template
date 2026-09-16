import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser, findUserByEmail } from "../src/db/users";
import { hashCode, storeCode } from "../src/lib/auth/otp";
import { POST } from "../src/pages/api/auth/verify-code";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/verify-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function seedCode(email: string, code = "123456") {
  await storeCode(getDb(env.DB), email, await hashCode(env.OTP_HMAC_SECRET, code));
}

describe("POST /api/auth/verify-code", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.sessions);
    await db.delete(schema.authCodes);
    await db.delete(schema.users);
  });

  afterEach(() => {
    delete (env as { AUTH_ALLOWED_EMAILS?: string }).AUTH_ALLOWED_EMAILS;
  });

  it("signs an existing user in and sets the session cookie", async () => {
    const user = await createUser(db, { email: "known@example.com" });
    await seedCode("known@example.com");

    const res = await POST({ request: makeRequest({ email: "known@example.com", code: "123456" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("set-cookie")).toMatch(/sid=[a-f0-9]{32}; Path=\/; HttpOnly/);
    expect(res.headers.get("cache-control")).toBe("no-store");

    const [session] = await db.select().from(schema.sessions);
    expect(session.userId).toBe(user.id);
  });

  it("creates the user on first sign-in", async () => {
    await seedCode("new@example.com");
    const res = await POST({ request: makeRequest({ email: "new@example.com", code: "123456" }) });
    expect(await res.json()).toEqual({ ok: true });
    expect(await findUserByEmail(db, "new@example.com")).not.toBeNull();
  });

  it("refuses a new address outside the allowlist", async () => {
    (env as { AUTH_ALLOWED_EMAILS?: string }).AUTH_ALLOWED_EMAILS = "ok@example.com";
    await seedCode("stranger@example.com");
    const res = await POST({ request: makeRequest({ email: "stranger@example.com", code: "123456" }) });
    expect(await res.json()).toEqual({ ok: false, error: "not_allowed" });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a wrong, expired or replayed code with the same answer", async () => {
    await createUser(db, { email: "u@example.com" });
    await seedCode("u@example.com");
    const wrong = await POST({ request: makeRequest({ email: "u@example.com", code: "999999" }) });
    expect(await wrong.json()).toEqual({ ok: false, error: "invalid_code" });

    await POST({ request: makeRequest({ email: "u@example.com", code: "123456" }) });
    const replay = await POST({ request: makeRequest({ email: "u@example.com", code: "123456" }) });
    expect(await replay.json()).toEqual({ ok: false, error: "invalid_code" });

    await storeCode(db, "e@example.com", await hashCode(env.OTP_HMAC_SECRET, "123456"), 0);
    const expired = await POST({ request: makeRequest({ email: "e@example.com", code: "123456" }) });
    expect(await expired.json()).toEqual({ ok: false, error: "invalid_code" });
  });

  it("returns 400 for a malformed email or code", async () => {
    expect((await POST({ request: makeRequest({ email: "bad", code: "123456" }) })).status).toBe(400);
    expect((await POST({ request: makeRequest({ email: "u@example.com", code: "abc" }) })).status).toBe(400);
  });
});
