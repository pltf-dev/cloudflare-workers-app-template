/**
 * Single source of truth for what the session middleware gates. Kept apart from
 * the middleware so it can be unit-tested (the workers test pool cannot import
 * `astro:middleware`).
 */
export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
}

export function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}
