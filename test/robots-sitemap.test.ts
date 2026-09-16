import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { getDb } from "../src/db/client";
import * as schema from "../src/db/schema";
import { createUser } from "../src/db/users";
import { createItem } from "../src/db/items";
import { robotsTxt } from "../src/pages/robots.txt";
import { renderSitemap, GET as sitemap } from "../src/pages/sitemap.xml";

describe("robots.txt", () => {
  it("blocks admin, api and login and advertises the sitemap", () => {
    const body = robotsTxt("https://cf-app.example.com/");
    expect(body).toContain("Disallow: /admin");
    expect(body).toContain("Disallow: /api/");
    expect(body).toContain("Disallow: /login");
    expect(body).toContain("Sitemap: https://cf-app.example.com/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  const db = getDb(env.DB);

  beforeEach(async () => {
    await db.delete(schema.items);
    await db.delete(schema.users);
  });

  it("escapes and formats entries", () => {
    const xml = renderSitemap("https://x.test", [{ loc: "/a?b=1&c=2", lastmod: new Date("2026-01-02T03:04:05Z") }]);
    expect(xml).toContain("<loc>https://x.test/a?b=1&amp;c=2</loc>");
    expect(xml).toContain("<lastmod>2026-01-02</lastmod>");
  });

  it("lists the home page and published items only", async () => {
    const user = await createUser(db, { email: "s@example.com" });
    const pub = await createItem(db, user.id, { title: "P", body: "", status: "published" });
    await createItem(db, user.id, { title: "D", body: "", status: "draft" });

    const res = await sitemap({ url: new URL("http://localhost/sitemap.xml") } as never);
    const xml = await res.text();
    expect(res.headers.get("content-type")).toContain("application/xml");
    expect(xml).toContain("<loc>http://localhost/</loc>");
    expect(xml).toContain(`<loc>http://localhost/items/${pub.id}</loc>`);
    expect(xml.match(/<url>/g)).toHaveLength(2);
  });
});
