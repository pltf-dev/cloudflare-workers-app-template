import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser, findUserByEmail, getUserById } from "../src/db/users";

describe("users repository", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.sessions);
    await db.delete(schema.users);
  });

  it("creates a user and finds it by email", async () => {
    const user = await createUser(db, { email: "a@example.com", name: "Ada" });
    expect(user.id).toBeGreaterThan(0);
    expect(await findUserByEmail(db, "a@example.com")).toMatchObject({ id: user.id, name: "Ada" });
    expect(await getUserById(db, user.id)).toMatchObject({ email: "a@example.com" });
  });

  it("returns null for an unknown email or id", async () => {
    expect(await findUserByEmail(db, "nobody@example.com")).toBeNull();
    expect(await getUserById(db, 999)).toBeNull();
  });

  it("rejects a duplicate email", async () => {
    await createUser(db, { email: "dup@example.com" });
    await expect(createUser(db, { email: "dup@example.com" })).rejects.toThrow();
  });
});
