export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db/client";
import { createItem } from "../../../../db/items";
import { parseItemForm } from "../../../../lib/form-parse";
import { redirect } from "../../../../lib/http";

interface Context {
  request: Request;
  locals: { userId?: number };
}

/** Create. Form POST from /admin/items/new; redirects back with a status marker. */
export async function POST({ request, locals }: Context) {
  const userId = locals.userId;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { valid, input } = parseItemForm(await request.formData());
  if (!valid) return redirect("/admin/items/new?error=invalid");

  const item = await createItem(getDb(env.DB), userId, input);
  return redirect(`/admin/items/${item.id}/edit?saved=1`);
}
