import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import { createItem, getItem } from "../src/db/items";
import { POST, DELETE } from "../src/pages/api/admin/items/[id]/image";

// A 1x1 PNG. Only the bytes matter for R2; the type check reads `file.type`.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="), (c) => c.charCodeAt(0));

function upload(id: number, file: File, userId?: number) {
  const form = new FormData();
  form.set("file", file);
  return POST({
    request: new Request(`http://localhost/api/admin/items/${id}/image`, { method: "POST", body: form }),
    params: { id: String(id) },
    locals: { userId },
  });
}

describe("POST /api/admin/items/[id]/image", () => {
  const db = getDb(env.DB);
  let alice: number;
  let itemId: number;

  beforeEach(async () => {
    await db.delete(schema.items);
    await db.delete(schema.users);
    alice = (await createUser(db, { email: "alice@example.com" })).id;
    itemId = (await createItem(db, alice, { title: "A", body: "", status: "draft" })).id;
  });

  it("stores the image in R2 under the item's prefix and records the key", async () => {
    const res = await upload(itemId, new File([PNG], "photo.png", { type: "image/png" }), alice);
    const body = (await res.json()) as { ok: boolean; imageUrl: string };
    expect(res.status).toBe(200);
    expect(body.imageUrl).toMatch(new RegExp(`^/media/items/${itemId}/[a-f0-9]{16}\\.png$`));

    const key = body.imageUrl.replace("/media/", "");
    const object = await env.MEDIA.get(key);
    expect(object).not.toBeNull();
    expect(object!.httpMetadata?.contentType).toBe("image/png");
    expect((await getItem(db, itemId))!.imageKey).toBe(key);
  });

  it("replaces a previous image and deletes the old object", async () => {
    const first = (await (await upload(itemId, new File([PNG], "a.png", { type: "image/png" }), alice)).json()) as { imageUrl: string };
    await upload(itemId, new File([PNG], "b.png", { type: "image/png" }), alice);
    expect(await env.MEDIA.get(first.imageUrl.replace("/media/", ""))).toBeNull();
  });

  it("rejects non-image types and oversized files", async () => {
    const html = await upload(itemId, new File(["<script>"], "x.html", { type: "text/html" }), alice);
    expect(html.status).toBe(400);
    expect(await html.json()).toEqual({ ok: false, error: "type" });

    const big = await upload(itemId, new File([new Uint8Array(5_000_001)], "big.png", { type: "image/png" }), alice);
    expect(await big.json()).toEqual({ ok: false, error: "size" });
  });

  it("refuses strangers and unknown items", async () => {
    const bob = (await createUser(db, { email: "bob@example.com" })).id;
    expect((await upload(itemId, new File([PNG], "a.png", { type: "image/png" }), bob)).status).toBe(404);
    expect((await upload(itemId, new File([PNG], "a.png", { type: "image/png" }))).status).toBe(401);
  });

  it("DELETE clears the key and removes the object", async () => {
    const { imageUrl } = (await (await upload(itemId, new File([PNG], "a.png", { type: "image/png" }), alice)).json()) as { imageUrl: string };
    const res = await DELETE({
      request: new Request("http://localhost/x", { method: "DELETE" }),
      params: { id: String(itemId) },
      locals: { userId: alice },
    });
    expect(await res.json()).toEqual({ ok: true });
    expect((await getItem(db, itemId))!.imageKey).toBeNull();
    expect(await env.MEDIA.get(imageUrl.replace("/media/", ""))).toBeNull();
  });
});
