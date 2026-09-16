import type { APIContext } from "astro";

export const prerender = false;

/** Public pages are crawlable; admin, API and auth paths are not. */
export function robotsTxt(origin: string): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /api/",
    "Disallow: /login",
    "",
    `Sitemap: ${origin.replace(/\/$/, "")}/sitemap.xml`,
    "",
  ].join("\n");
}

export function GET({ url }: APIContext): Response {
  return new Response(robotsTxt(url.origin), {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
