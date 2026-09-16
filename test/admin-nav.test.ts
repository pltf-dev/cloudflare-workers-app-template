import { describe, it, expect } from "vitest";
import { adminNav, adminNavSections } from "../src/lib/admin/nav";

describe("admin nav", () => {
  it("flattens sections in display order with unique keys and hrefs under /admin", () => {
    const flat = adminNav();
    expect(flat.map((i) => i.key)).toEqual(["items", "account"]);
    for (const item of flat) expect(item.href.startsWith("/admin/")).toBe(true);
    expect(adminNavSections()[0].id).toBe("manage");
  });
});
