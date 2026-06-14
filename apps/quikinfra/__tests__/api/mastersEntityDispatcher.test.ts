import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/[entity]/route";

// The [entity] catch-all is auth-free: it always 404s, steering callers to
// the specific Prisma-backed route. No setContext needed.
function req(entity: string): NextRequest {
  return new NextRequest(`http://localhost/api/masters/${entity}`);
}

describe("GET /api/masters/[entity] dispatcher", () => {
  it("returns 404 + USE_SPECIFIC_ROUTE for a known entity", async () => {
    const res = await GET(req("companies"), { params: { entity: "companies" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("USE_SPECIFIC_ROUTE");
  });

  it("returns 404 + Unknown entity for an unknown entity", async () => {
    const res = await GET(req("nonsense"), { params: { entity: "nonsense" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown entity/);
  });
});

describe("POST /api/masters/[entity] dispatcher", () => {
  it("returns 404 + USE_SPECIFIC_ROUTE for a known entity", async () => {
    const res = await POST(req("companies"), { params: { entity: "companies" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("USE_SPECIFIC_ROUTE");
  });

  it("returns 404 + Unknown entity for an unknown entity", async () => {
    const res = await POST(req("nonsense"), { params: { entity: "nonsense" } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/Unknown entity/);
  });
});
