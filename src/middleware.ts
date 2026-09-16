import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { getDb } from "./db/client";
import { isAdminPath, isApiPath } from "./lib/auth/paths";
import {
  validateSession,
  parseSessionCookie,
  expireSessionCookie,
  serializeSessionCookie,
} from "./lib/auth/session";

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  if (!isAdminPath(pathname)) return next();

  const token = parseSessionCookie(context.request.headers.get("cookie") ?? "");
  const session = token ? await validateSession(getDb(env.DB), token) : null;
  const secure = !import.meta.env.DEV;

  if (!session) {
    if (isApiPath(pathname)) {
      return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(null, {
      status: 303,
      headers: {
        location: `/login?next=${encodeURIComponent(pathname + search)}`,
        "set-cookie": expireSessionCookie(secure),
      },
    });
  }

  context.locals.userId = session.userId;
  context.locals.sessionId = session.sessionId;
  const response = await next();
  if (session.renewed && token) {
    response.headers.append("set-cookie", serializeSessionCookie(token, secure));
  }
  return response;
});
