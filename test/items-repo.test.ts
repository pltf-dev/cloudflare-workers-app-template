import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import {
  createItem,
  deleteItem,
  getItem,
  getItemForUser,
  listItemsForUser,
  listPublishedItems,
  setItemImage,
  updateItem,
} from "../src/db/items";

describe("items repository", () => {
  const db = getDb(env.DB);
  let alice: number;
  let bob: number;

  beforeEach(async () => {
    await db.delete(schema.items);
    await db.delete(schema.users);
    alice = (await createUser(db, { email: "alice@example.com" })).id;
    bob = (await createUser(db, { email: "bob@example.com" })).id;
  });

  it("creates, reads, updates and deletes within the owner's scope", async () => {
    const item = await createItem(db, alice, { title: "Hello", body: "World", status: "draft" });
    expect(item).toMatchObject({ userId: alice, title: "Hello", status: "draft", imageKey: null });

    expect(await getItem(db, item.id)).toMatchObject({ id: item.id });
    expect(await getItemForUser(db, alice, item.id)).toMatchObject({ id: item.id });
    expect(await getItemForUser(db, bob, item.id)).toBeNull();

    expect(await updateItem(db, bob, item.id, { title: "Hijack", body: "", status: "published" })).toBe(false);
    expect((await getItem(db, item.id))!.title).toBe("Hello");

    expect(await updateItem(db, alice, item.id, { title: "Hello 2", body: "Body", status: "published" })).toBe(true);
    const updated = (await getItem(db, item.id))!;
    expect(updated).toMatchObject({ title: "Hello 2", status: "published" });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(item.updatedAt.getTime());

    await setItemImage(db, alice, item.id, "items/1/abc.png");
    expect((await getItem(db, item.id))!.imageKey).toBe("items/1/abc.png");

    expect(await deleteItem(db, bob, item.id)).toBe(false);
    expect(await deleteItem(db, alice, item.id)).toBe(true);
    expect(await getItem(db, item.id)).toBeNull();
  });

  it("lists published items newest first and per-user items regardless of status", async () => {
    const a = await createItem(db, alice, { title: "A", body: "", status: "published" });
    await createItem(db, alice, { title: "Draft", body: "", status: "draft" });
    const b = await createItem(db, bob, { title: "B", body: "", status: "published" });
    await db.update(schema.items).set({ createdAt: new Date(a.createdAt.getTime() + 1000) }).where(
      eq(schema.items.id, b.id),
    );

    const published = await listPublishedItems(db);
    expect(published.map((i) => i.title)).toEqual(["B", "A"]);

    expect((await listItemsForUser(db, alice)).map((i) => i.title).sort()).toEqual(["A", "Draft"]);
    expect(await listItemsForUser(db, bob)).toHaveLength(1);
  });
});
