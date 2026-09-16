/**
 * `AUTH_ALLOWED_EMAILS` is a comma-separated list. Unset or blank means anyone
 * who can prove control of an email address may sign up.
 */
export function isEmailAllowed(allowlist: string | undefined, email: string): boolean {
  const entries = (allowlist ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return entries.length === 0 || entries.includes(email.trim().toLowerCase());
}
