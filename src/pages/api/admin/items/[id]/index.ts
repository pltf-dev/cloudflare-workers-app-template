export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../../../../db/client";
import { updateItem } from "../../../../../db/items";
import { parseItemForm } from "../../../../../lib/form-parse";
import { parseId, redirect } from "../../../../../lib/http";

interface Context {
  request: Request;
  params: Record<string, string | undefined>;
  locals: { userId?: number };
}

/** Update. Form POST from /admin/items/[id]/edit. */
export async function POST({ request, params, locals }: Context) {
  const userId = locals.userId;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const id = parseId(params);
  if (!id) return new Response("Not found", { status: 404 });

  const { valid, input } = parseItemForm(await request.formData());
  if (!valid) return redirect(`/admin/items/${id}/edit?error=invalid`);

  const updated = await updateItem(getDb(env.DB), userId, id, input);
  if (!updated) return new Response("Not found", { status: 404 });
  return redirect(`/admin/items/${id}/edit?saved=1`);
}
