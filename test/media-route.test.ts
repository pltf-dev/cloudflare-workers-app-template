import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { GET } from "../src/pages/media/[...key]";
import { contentTypeForKey, extensionForType } from "../src/lib/media";

describe("GET /media/[...key]", () => {
  it("streams the object with a type derived from the key and nosniff", async () => {
    await env.MEDIA.put("items/1/pic.png", "png-bytes", { httpMetadata: { contentType: "text/html" } });
    const res = await GET({ params: { key: "items/1/pic.png" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("png-bytes");
  });

  it("404s for missing keys, empty keys and traversal attempts", async () => {
    expect((await GET({ params: { key: "nope.png" } })).status).toBe(404);
    expect((await GET({ params: {} })).status).toBe(404);
    expect((await GET({ params: { key: "../secret" } })).status).toBe(404);
  });
});

describe("media helpers", () => {
  it("maps types both ways and falls back to octet-stream", () => {
    expect(extensionForType("image/JPEG")).toBe("jpg");
    expect(extensionForType("text/html")).toBeNull();
    expect(contentTypeForKey("a/b.webp")).toBe("image/webp");
    expect(contentTypeForKey("a/b.bin")).toBe("application/octet-stream");
  });
});
