export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../../db/client";
import { json } from "../../../lib/http";
import { isEmailAllowed } from "../../../lib/auth/allowlist";
import { generateCode, generateLinkToken, hashCode, storeCode, checkThrottle } from "../../../lib/auth/otp";
import { sendLoginCode } from "../../../lib/email/login-code";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(context: { request: Request }) {
  let body: { email?: string };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "body" }, 400);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "email" }, 400);

  // Every non-400 path answers the same `{ok:true}` so the endpoint cannot be
  // used to discover which addresses have accounts or are allowed in.
  if (!isEmailAllowed(env.AUTH_ALLOWED_EMAILS, email)) return json({ ok: true });

  const db = getDb(env.DB);
  const throttle = await checkThrottle(db, email);
  if (!throttle.allowed) return json({ ok: true });

  const code = generateCode();
  const linkToken = generateLinkToken();
  const hash = await hashCode(env.OTP_HMAC_SECRET, code);
  const linkHash = await hashCode(env.OTP_HMAC_SECRET, linkToken);
  await storeCode(db, email, hash, undefined, linkHash);

  // Email clients need an absolute URL. Dev uses the request origin so the link
  // opens against the dev server; production always uses the canonical origin.
  const origin = import.meta.env.DEV ? new URL(context.request.url).origin : env.APP_ORIGIN;
  const loginUrl = `${origin}/login/link?t=${linkToken}`;

  if (import.meta.env.DEV) {
    console.log(`\n[DEV] sign-in code for ${email}: ${code}\n[DEV] magic link: ${loginUrl}\n`);
  } else {
    try {
      await sendLoginCode(email, code, loginUrl);
    } catch (err) {
      console.error("send-code: email delivery failed", err);
    }
  }

  return json({ ok: true });
}
