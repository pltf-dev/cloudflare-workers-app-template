import { describe, it, expect } from "vitest";
import { GET } from "../src/pages/api/health";

describe("GET /api/health", () => {
  it("returns ok and db:true when D1 is reachable", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok", db: true });
  });
});
