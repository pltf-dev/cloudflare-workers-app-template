import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { getDb } from "../db/client";
import { listPublishedItems } from "../db/items";

export const prerender = false;

export type SitemapEntry = { loc: string; lastmod?: Date | null };

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build a sitemap.xml body. `loc`s are `origin` + each entry's path. */
export function renderSitemap(origin: string, entries: SitemapEntry[]): string {
  const base = origin.replace(/\/$/, "");
  const urls = entries
    .map((e) => {
      const lastmod = e.lastmod ? `\n    <lastmod>${e.lastmod.toISOString().slice(0, 10)}</lastmod>` : "";
      return `  <url>\n    <loc>${xmlEscape(base + e.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export async function GET({ url }: APIContext): Promise<Response> {
  const items = await listPublishedItems(getDb(env.DB));
  const entries: SitemapEntry[] = [
    { loc: "/" },
    ...items.map((i) => ({ loc: `/items/${i.id}`, lastmod: i.updatedAt })),
  ];
  return new Response(renderSitemap(url.origin, entries), {
    status: 200,
    headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
