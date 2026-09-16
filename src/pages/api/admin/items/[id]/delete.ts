export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../../../../db/client";
import { deleteItem, getItemForUser } from "../../../../../db/items";
import { parseId, redirect } from "../../../../../lib/http";

interface Context {
  params: Record<string, string | undefined>;
  locals: { userId?: number };
}

export async function POST({ params, locals }: Context) {
  const userId = locals.userId;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const id = parseId(params);
  if (!id) return new Response("Not found", { status: 404 });

  const db = getDb(env.DB);
  const item = await getItemForUser(db, userId, id);
  if (!item) return new Response("Not found", { status: 404 });

  // The row goes first; an orphaned object is recoverable, a dangling key is not.
  await deleteItem(db, userId, id);
  if (item.imageKey) await env.MEDIA.delete(item.imageKey);
  return redirect("/admin/items?deleted=1");
}
