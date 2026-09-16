export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../db/client";
import { listPublishedItems } from "../../db/items";
import { json } from "../../lib/http";

/** Public read API: published items, newest first. */
export async function GET() {
  const items = await listPublishedItems(getDb(env.DB));
  return json({
    ok: true,
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      body: i.body,
      imageUrl: i.imageKey ? `/media/${i.imageKey}` : null,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    })),
  });
}
