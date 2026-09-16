import type { Db } from "../../db/client";
import { createUser, findUserByEmail } from "../../db/users";
import { isEmailAllowed } from "./allowlist";
import { createSession, sessionMetaFromRequest } from "./session";

export type AuthOutcome = { ok: true; sessionToken: string } | { ok: false };

/**
 * What a proven email turns into, once ANY credential (the typed code or the
 * emailed link) has established that the caller controls `email`.
 *
 * Known user → a session. Unknown email → a new user, then a session, unless the
 * allowlist says otherwise. Callers must not reveal which case happened beyond
 * "signed in" / "not allowed".
 */
export async function completeAuth(
  db: Db,
  email: string,
  request: Request,
  allowlist: string | undefined,
): Promise<AuthOutcome> {
  let user = await findUserByEmail(db, email);
  if (!user) {
    if (!isEmailAllowed(allowlist, email)) return { ok: false };
    user = await createUser(db, { email });
  }
  const sessionToken = await createSession(db, user.id, sessionMetaFromRequest(request));
  return { ok: true, sessionToken };
}
