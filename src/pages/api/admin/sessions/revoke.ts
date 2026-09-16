export const prerender = false;
import { env } from "cloudflare:workers";
import { getDb } from "../../../../db/client";
import { redirect } from "../../../../lib/http";
import { revokeOtherSessions, revokeSession } from "../../../../lib/auth/session";

interface Context {
  request: Request;
  locals: { userId?: number; sessionId?: number };
}

/**
 * Form endpoint behind the account page. `all=1` signs out every other device;
 * otherwise `id` names one session. Both are scoped to the caller's user, so a
 * guessed id belonging to someone else is a no-op.
 */
export async function POST({ request, locals }: Context) {
  const { userId, sessionId } = locals;
  if (!userId || !sessionId) return new Response("Unauthorized", { status: 401 });

  const form = await request.formData();
  const db = getDb(env.DB);

  if (form.get("all") === "1") {
    await revokeOtherSessions(db, userId, sessionId);
    return redirect("/admin/account?saved=devices");
  }

  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return redirect("/admin/account?error=invalid");
  // Revoking the current session would strand the user without the cookie being
  // cleared; the header's "Sign out" is the path for that.
  if (id === sessionId) return redirect("/admin/account?error=current");
  await revokeSession(db, userId, id);
  return redirect("/admin/account?saved=device");
}
