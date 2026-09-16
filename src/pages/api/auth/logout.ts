export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../../db/client";
import { destroySession, parseSessionCookie, expireSessionCookie } from "../../../lib/auth/session";

export async function POST(context: { request: Request }) {
  const token = parseSessionCookie(context.request.headers.get("cookie") ?? "");
  if (token) await destroySession(getDb(env.DB), token);

  const secure = !import.meta.env.DEV;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": expireSessionCookie(secure) },
  });
}
