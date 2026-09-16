import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import { createItem, getItem, setItemImage } from "../src/db/items";
import { POST as create } from "../src/pages/api/admin/items/index";
import { POST as update } from "../src/pages/api/admin/items/[id]/index";
import { POST as remove } from "../src/pages/api/admin/items/[id]/delete";

function formRequest(url: string, fields: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
}

describe("admin item endpoints", () => {
  const db = getDb(env.DB);
  let alice: number;
  let bob: number;

  beforeEach(async () => {
    await db.delete(schema.items);
    await db.delete(schema.users);
    alice = (await createUser(db, { email: "alice@example.com" })).id;
    bob = (await createUser(db, { email: "bob@example.com" })).id;
  });

  it("creates an item and redirects to its edit page", async () => {
    const res = await create({
      request: formRequest("http://localhost/api/admin/items", { title: "New", body: "Text", status: "published" }),
      locals: { userId: alice },
    });
    expect(res.status).toBe(303);
    const [item] = await db.select().from(schema.items);
    expect(res.headers.get("location")).toBe(`/admin/items/${item.id}/edit?saved=1`);
    expect(item).toMatchObject({ userId: alice, title: "New", status: "published" });
  });

  it("rejects an empty title and an unknown status falls back to draft", async () => {
    const bad = await create({
      request: formRequest("http://localhost/api/admin/items", { title: "  ", body: "x" }),
      locals: { userId: alice },
    });
    expect(bad.headers.get("location")).toBe("/admin/items/new?error=invalid");

    await create({
      request: formRequest("http://localhost/api/admin/items", { title: "T", body: "", status: "hacked" }),
      locals: { userId: alice },
    });
    const [item] = await db.select().from(schema.items);
    expect(item.status).toBe("draft");
  });

  it("updates only the owner's item", async () => {
    const item = await createItem(db, alice, { title: "A", body: "", status: "draft" });
    const params = { id: String(item.id) };

    const ok = await update({
      request: formRequest(`http://localhost/api/admin/items/${item.id}`, { title: "A2", body: "b", status: "published" }),
      params,
      locals: { userId: alice },
    });
    expect(ok.headers.get("location")).toBe(`/admin/items/${item.id}/edit?saved=1`);
    expect(await getItem(db, item.id)).toMatchObject({ title: "A2", status: "published" });

    const forbidden = await update({
      request: formRequest(`http://localhost/api/admin/items/${item.id}`, { title: "Hijack", body: "", status: "draft" }),
      params,
      locals: { userId: bob },
    });
    expect(forbidden.status).toBe(404);
    expect((await getItem(db, item.id))!.title).toBe("A2");
  });

  it("deletes the row and its R2 object, scoped to the owner", async () => {
    const item = await createItem(db, alice, { title: "A", body: "", status: "draft" });
    await env.MEDIA.put("items/x/photo.png", "bytes");
    await setItemImage(db, alice, item.id, "items/x/photo.png");
    const params = { id: String(item.id) };

    expect((await remove({ params, locals: { userId: bob } })).status).toBe(404);
    expect(await env.MEDIA.get("items/x/photo.png")).not.toBeNull();

    const res = await remove({ params, locals: { userId: alice } });
    expect(res.headers.get("location")).toBe("/admin/items?deleted=1");
    expect(await getItem(db, item.id)).toBeNull();
    expect(await env.MEDIA.get("items/x/photo.png")).toBeNull();
  });

  it("returns 401 without a user and 404 for a bad id", async () => {
    expect((await create({ request: formRequest("http://localhost/x", { title: "t" }), locals: {} })).status).toBe(401);
    expect((await remove({ params: { id: "abc" }, locals: { userId: alice } })).status).toBe(404);
  });
});
