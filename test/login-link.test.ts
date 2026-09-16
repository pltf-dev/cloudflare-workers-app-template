import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import { generateLinkToken, hashCode, storeCode } from "../src/lib/auth/otp";
import { GET } from "../src/pages/login/link";

const SECRET = env.OTP_HMAC_SECRET;

async function seedLink(email: string): Promise<string> {
  const token = generateLinkToken();
  await storeCode(getDb(env.DB), email, await hashCode(SECRET, "123456"), 600_000, await hashCode(SECRET, token));
  return token;
}

const get = (t: string) => GET({ request: new Request(`http://localhost/login/link?t=${t}`) });

describe("GET /login/link", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.sessions);
    await db.delete(schema.authCodes);
    await db.delete(schema.users);
  });

  it("signs in and redirects to /admin with a session cookie", async () => {
    await createUser(db, { email: "u@example.com" });
    const res = await get(await seedLink("u@example.com"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/admin");
    expect(res.headers.get("set-cookie")).toMatch(/sid=[a-f0-9]{32}/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("ignores any next parameter (fixed destination only)", async () => {
    await createUser(db, { email: "u@example.com" });
    const token = await seedLink("u@example.com");
    const res = await GET({ request: new Request(`http://localhost/login/link?t=${token}&next=//evil.example`) });
    expect(res.headers.get("location")).toBe("/admin");
  });

  it("sends malformed, unknown and reused tokens to the same generic error", async () => {
    const token = await seedLink("u@example.com");
    await get(token);
    for (const t of ["", "zzz", "0".repeat(32), token]) {
      const res = await get(t);
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/login?error=link");
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });
});
