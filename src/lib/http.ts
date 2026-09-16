export function redirect(path: string): Response {
  return new Response(null, { status: 303, headers: { location: path } });
}

export function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
}

export function parseId(params: Record<string, string | undefined>, key = "id"): number | null {
  const n = Number(params[key]);
  return Number.isInteger(n) && n > 0 ? n : null;
}
