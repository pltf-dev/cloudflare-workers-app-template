import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import {
  checkThrottle,
  generateCode,
  generateLinkToken,
  hashCode,
  storeCode,
  verifyCode,
  verifyLinkToken,
} from "../src/lib/auth/otp";

const SECRET = env.OTP_HMAC_SECRET;
const EMAIL = "otp@example.com";
const CODE = "123456";

describe("generateCode", () => {
  it("returns 6 digits", () => {
    for (let i = 0; i < 20; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });
});

describe("hashCode", () => {
  it("is deterministic per secret and refuses an empty secret", async () => {
    expect(await hashCode("s", CODE)).toBe(await hashCode("s", CODE));
    expect(await hashCode("s", CODE)).not.toBe(await hashCode("t", CODE));
    await expect(hashCode("", CODE)).rejects.toThrow();
  });
});

describe("verifyCode", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.authCodes);
  });

  it("accepts the stored code once", async () => {
    await storeCode(db, EMAIL, await hashCode(SECRET, CODE));
    expect(await verifyCode(db, SECRET, EMAIL, CODE)).toEqual({ valid: true });
    expect((await verifyCode(db, SECRET, EMAIL, CODE)).valid).toBe(false);
  });

  it("rejects a wrong code and burns the code after 3 attempts", async () => {
    await storeCode(db, EMAIL, await hashCode(SECRET, CODE));
    for (let i = 0; i < 3; i++) {
      expect(await verifyCode(db, SECRET, EMAIL, "000000")).toEqual({ valid: false, reason: "mismatch" });
    }
    expect(await verifyCode(db, SECRET, EMAIL, CODE)).toEqual({ valid: false, reason: "max_attempts" });
  });

  it("rejects an expired code", async () => {
    await storeCode(db, EMAIL, await hashCode(SECRET, CODE), -1000);
    expect(await verifyCode(db, SECRET, EMAIL, CODE)).toEqual({ valid: false, reason: "no_code" });
  });
});

describe("checkThrottle", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.authCodes);
  });

  it("allows three codes per window and then refuses", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await checkThrottle(db, EMAIL)).allowed).toBe(true);
      await storeCode(db, EMAIL, await hashCode(SECRET, CODE));
    }
    expect(await checkThrottle(db, EMAIL)).toEqual({ allowed: false, remaining: 0 });
  });
});

describe("verifyLinkToken", () => {
  const db = getDb(env.DB);

  async function seed(token: string, ttlMs = 600_000) {
    await storeCode(db, EMAIL, await hashCode(SECRET, CODE), ttlMs, await hashCode(SECRET, token));
  }

  beforeEach(async () => {
    await db.delete(schema.authCodes);
  });

  it("returns 32 lowercase hex chars that do not repeat", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateLinkToken()));
    expect(tokens.size).toBe(20);
    for (const t of tokens) expect(t).toMatch(/^[a-f0-9]{32}$/);
  });

  it("accepts a valid token exactly once", async () => {
    const token = generateLinkToken();
    await seed(token);
    expect(await verifyLinkToken(db, SECRET, token)).toEqual({ valid: true, email: EMAIL });
    expect((await verifyLinkToken(db, SECRET, token)).valid).toBe(false);
  });

  it("rejects expired, garbage and empty tokens", async () => {
    const token = generateLinkToken();
    await seed(token, -1000);
    expect((await verifyLinkToken(db, SECRET, token)).valid).toBe(false);
    expect((await verifyLinkToken(db, SECRET, "nope")).valid).toBe(false);
    expect((await verifyLinkToken(db, SECRET, "")).valid).toBe(false);
  });

  // A mail scanner that prefetches the link must not break the code the user types.
  it("using the link leaves the typed code valid, and vice versa", async () => {
    const token = generateLinkToken();
    await seed(token);
    expect((await verifyLinkToken(db, SECRET, token)).valid).toBe(true);
    expect((await verifyCode(db, SECRET, EMAIL, CODE)).valid).toBe(true);

    const [row] = await db.select().from(schema.authCodes);
    expect(row.attempts).toBe(1);
  });
});
