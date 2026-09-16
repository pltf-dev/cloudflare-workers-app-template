import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { POST } from "../src/pages/api/auth/send-code";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/send-code", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/send-code", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.authCodes);
  });

  afterEach(() => {
    delete (env as { AUTH_ALLOWED_EMAILS?: string }).AUTH_ALLOWED_EMAILS;
  });

  it("stores a code and a link token for a valid email", async () => {
    const res = await POST({ request: makeRequest({ email: "user@example.com" }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const rows = await db.select().from(schema.authCodes);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("user@example.com");
    expect(rows[0].linkTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rows[0].linkTokenHash).not.toBe(rows[0].codeHash);
  });

  it("normalizes the email", async () => {
    await POST({ request: makeRequest({ email: "  User@EXAMPLE.com  " }) });
    const [row] = await db.select().from(schema.authCodes);
    expect(row.email).toBe("user@example.com");
  });

  it("returns 400 for a missing, malformed or non-JSON body", async () => {
    expect((await POST({ request: makeRequest({}) })).status).toBe(400);
    expect((await POST({ request: makeRequest({ email: "nope" }) })).status).toBe(400);
    const bad = new Request("http://localhost/api/auth/send-code", { method: "POST", body: "{" });
    expect((await POST({ request: bad })).status).toBe(400);
  });

  it("throttles after 3 codes but still answers ok (enumeration-safe)", async () => {
    for (let i = 0; i < 4; i++) {
      const res = await POST({ request: makeRequest({ email: "user@example.com" }) });
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(await db.select().from(schema.authCodes)).toHaveLength(3);
  });

  it("answers ok without storing a code for an address outside the allowlist", async () => {
    (env as { AUTH_ALLOWED_EMAILS?: string }).AUTH_ALLOWED_EMAILS = "ok@example.com";
    const res = await POST({ request: makeRequest({ email: "stranger@example.com" }) });
    expect(await res.json()).toEqual({ ok: true });
    expect(await db.select().from(schema.authCodes)).toHaveLength(0);

    await POST({ request: makeRequest({ email: "ok@example.com" }) });
    expect(await db.select().from(schema.authCodes)).toHaveLength(1);
  });
});
