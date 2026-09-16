import { describe, it, expect } from "vitest";
import { isAdminPath, isApiPath } from "../src/lib/auth/paths";

describe("isAdminPath", () => {
  it("gates /admin, /admin/* and /api/admin/*, nothing else", () => {
    expect(isAdminPath("/admin")).toBe(true);
    expect(isAdminPath("/admin/items")).toBe(true);
    expect(isAdminPath("/api/admin/items")).toBe(true);
    expect(isAdminPath("/administrator")).toBe(false);
    expect(isAdminPath("/login")).toBe(false);
    expect(isAdminPath("/api/auth/send-code")).toBe(false);
    expect(isAdminPath("/")).toBe(false);
  });
});

describe("isApiPath", () => {
  it("is true only under /api/", () => {
    expect(isApiPath("/api/admin/items")).toBe(true);
    expect(isApiPath("/admin/items")).toBe(false);
  });
});
