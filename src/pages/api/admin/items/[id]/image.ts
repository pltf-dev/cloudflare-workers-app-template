export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../../../../db/client";
import { getItemForUser, setItemImage } from "../../../../../db/items";
import { json, parseId } from "../../../../../lib/http";
import { MAX_IMAGE_BYTES, extensionForType, imageKeyFor } from "../../../../../lib/media";

interface Context {
  request: Request;
  params: Record<string, string | undefined>;
  locals: { userId?: number };
}

/**
 * Multipart upload of one image (field `file`). Called by the ItemImage island,
 * so it answers JSON rather than redirecting. Replaces any previous image and
 * removes the old object once the new key is committed.
 */
export async function POST({ request, params, locals }: Context) {
  const userId = locals.userId;
  if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
  const id = parseId(params);
  if (!id) return json({ ok: false, error: "not_found" }, 404);

  const db = getDb(env.DB);
  const item = await getItemForUser(db, userId, id);
  if (!item) return json({ ok: false, error: "not_found" }, 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: "body" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ ok: false, error: "file" }, 400);

  const ext = extensionForType(file.type);
  if (!ext) return json({ ok: false, error: "type" }, 400);
  if (file.size > MAX_IMAGE_BYTES) return json({ ok: false, error: "size" }, 400);

  const key = imageKeyFor(id, ext);
  await env.MEDIA.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  await setItemImage(db, userId, id, key);
  if (item.imageKey && item.imageKey !== key) await env.MEDIA.delete(item.imageKey);

  return json({ ok: true, imageUrl: `/media/${key}` });
}

/** Remove the current image. */
export async function DELETE({ params, locals }: Context) {
  const userId = locals.userId;
  if (!userId) return json({ ok: false, error: "unauthorized" }, 401);
  const id = parseId(params);
  if (!id) return json({ ok: false, error: "not_found" }, 404);

  const db = getDb(env.DB);
  const item = await getItemForUser(db, userId, id);
  if (!item) return json({ ok: false, error: "not_found" }, 404);

  await setItemImage(db, userId, id, null);
  if (item.imageKey) await env.MEDIA.delete(item.imageKey);
  return json({ ok: true });
}
