export const prerender = false;
import { env } from "cloudflare:workers";
import { contentTypeForKey } from "../../lib/media";

/**
 * Streams an R2 object. The content-type comes from the key's extension, never
 * from the object's stored metadata, and `nosniff` stops browsers second-guessing
 * it, so a same-origin upload can never be interpreted as HTML.
 */
export async function GET({ params }: { params: { key?: string } }) {
  const key = params.key ?? "";
  if (!key || key.includes("..")) return new Response("Not found", { status: 404 });

  const object = await env.MEDIA.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  // The DOM and workers-types ReadableStream declarations disagree; the runtime type is the same.
  return new Response(object.body as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": contentTypeForKey(key),
      "x-content-type-options": "nosniff",
      "cache-control": "public, max-age=31536000, immutable",
      etag: object.httpEtag,
    },
  });
}
