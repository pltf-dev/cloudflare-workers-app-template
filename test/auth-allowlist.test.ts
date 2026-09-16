import { describe, it, expect } from "vitest";
import { isEmailAllowed } from "../src/lib/auth/allowlist";

describe("isEmailAllowed", () => {
  it("allows everyone when the allowlist is unset or blank", () => {
    expect(isEmailAllowed(undefined, "a@b.co")).toBe(true);
    expect(isEmailAllowed("  ", "a@b.co")).toBe(true);
  });

  it("matches case-insensitively and ignores whitespace around entries", () => {
    expect(isEmailAllowed(" A@b.co , c@d.co", "a@b.co")).toBe(true);
    expect(isEmailAllowed("a@b.co,c@d.co", "C@D.CO")).toBe(true);
    expect(isEmailAllowed("a@b.co", "x@y.z")).toBe(false);
  });
});
