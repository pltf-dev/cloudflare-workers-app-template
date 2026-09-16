import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import { createItem, setItemImage } from "../src/db/items";
import { GET } from "../src/pages/api/items";

describe("GET /api/items", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.items);
    await db.delete(schema.users);
  });

  it("returns published items with media URLs and ISO dates", async () => {
    const user = await createUser(db, { email: "p@example.com" });
    const pub = await createItem(db, user.id, { title: "Pub", body: "Hi", status: "published" });
    await setItemImage(db, user.id, pub.id, "items/1/x.png");
    await createItem(db, user.id, { title: "Draft", body: "", status: "draft" });

    const res = await GET();
    const body = (await res.json()) as { ok: boolean; items: Array<Record<string, unknown>> };
    expect(body.ok).toBe(true);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: pub.id, title: "Pub", imageUrl: "/media/items/1/x.png" });
    expect(body.items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.items[0]).not.toHaveProperty("userId");
  });
});
