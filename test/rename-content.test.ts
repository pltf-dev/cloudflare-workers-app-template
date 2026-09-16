import { describe, it, expect } from "vitest";
import { renameContent, titleCase, normalizeOptions } from "../scripts/rename-content.mjs";

const SAMPLE = [
  '"name": "cf-app",',
  '"database_name": "cf-app", "bucket_name": "cf-app-media",',
  '"APP_ORIGIN": "https://cf-app.example.com"',
  "<title>Sign in — CF App</title>",
  'FROM = "CF App <no-reply@cf-app.example.com>"',
].join("\n");

describe("renameContent", () => {
  it("rewrites domain, display name and app name without splitting longer matches", () => {
    const out = renameContent(SAMPLE, { name: "acme", domain: "acme.dev", display: "Acme Inc" });
    expect(out).toContain('"name": "acme",');
    expect(out).toContain('"bucket_name": "acme-media"');
    expect(out).toContain('"APP_ORIGIN": "https://acme.dev"');
    expect(out).toContain("Sign in — Acme Inc");
    expect(out).toContain("Acme Inc <no-reply@acme.dev>");
    expect(out).not.toContain("cf-app");
    expect(out).not.toContain("CF App");
  });

  it("is idempotent", () => {
    const once = renameContent(SAMPLE, { name: "acme" });
    expect(renameContent(once, { name: "acme" })).toBe(once);
  });

  it("derives sensible defaults and validates the name", () => {
    expect(normalizeOptions({ name: "my-cool-app" })).toEqual({
      name: "my-cool-app",
      domain: "my-cool-app.example.com",
      display: "My Cool App",
    });
    expect(titleCase("a_b-c")).toBe("A B C");
    expect(() => normalizeOptions({ name: "Bad Name" })).toThrow(/lowercase/);
  });
});
