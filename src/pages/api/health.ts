import { env } from "cloudflare:workers";
import { getDb } from "../../db/client";
import { sql } from "drizzle-orm";

export const prerender = false;

export async function GET() {
  let db = false;
  try {
    const d = getDb(env.DB);
    await d.run(sql`SELECT 1`);
    db = true;
  } catch {
    db = false;
  }
  return new Response(JSON.stringify({ status: "ok", db }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
