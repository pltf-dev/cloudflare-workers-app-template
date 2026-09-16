export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../db/client";
import { verifyLinkToken } from "../../lib/auth/otp";
import { completeAuth } from "../../lib/auth/complete-auth";
import { serializeSessionCookie } from "../../lib/auth/session";

const TOKEN_RE = /^[a-f0-9]{32}$/;

/**
 * Every failure lands on the same generic destination: expired, already used,
 * malformed and never-existed must be indistinguishable, so the endpoint can't
 * be used to probe which addresses have accounts.
 */
function redirect(location: string, cookie?: string): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export async function GET(context: { request: Request }) {
  const token = new URL(context.request.url).searchParams.get("t") ?? "";
  if (!TOKEN_RE.test(token)) return redirect("/login?error=link");

  const db = getDb(env.DB);
  const result = await verifyLinkToken(db, env.OTP_HMAC_SECRET, token);
  if (!result.valid) return redirect("/login?error=link");

  const outcome = await completeAuth(db, result.email, context.request, env.AUTH_ALLOWED_EMAILS);
  if (!outcome.ok) return redirect("/login?error=link");

  // Fixed destination only. Any `next` on the URL is ignored on purpose: the
  // email can't know it, so honouring one is pure open-redirect surface.
  return redirect("/admin", serializeSessionCookie(outcome.sessionToken, !import.meta.env.DEV));
}
