export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../../db/client";
import { json } from "../../../lib/http";
import { verifyCode } from "../../../lib/auth/otp";
import { serializeSessionCookie } from "../../../lib/auth/session";
import { completeAuth } from "../../../lib/auth/complete-auth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

export async function POST(context: { request: Request }) {
  let body: { email?: string; code?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "body" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();
  if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "email" }, 400);
  if (!CODE_RE.test(code)) return json({ ok: false, error: "code" }, 400);

  const db = getDb(env.DB);
  const result = await verifyCode(db, env.OTP_HMAC_SECRET, email, code);
  if (!result.valid) return json({ ok: false, error: "invalid_code" });

  const outcome = await completeAuth(db, email, context.request, env.AUTH_ALLOWED_EMAILS);
  if (!outcome.ok) return json({ ok: false, error: "not_allowed" });

  const secure = !import.meta.env.DEV;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": serializeSessionCookie(outcome.sessionToken, secure),
      "cache-control": "no-store",
    },
  });
}
