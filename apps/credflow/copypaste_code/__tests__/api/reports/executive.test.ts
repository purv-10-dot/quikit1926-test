import { describe, expect, it, beforeEach, vi } from "vitest";
import { setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";
import { buildSummary } from "@/lib/services/dashboard/summary-service";

vi.mock("@/lib/services/dashboard/summary-service");

describe("GET /api/reports/executive", () => {
  beforeEach(() => {
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
    vi.mocked(buildSummary).mockReset();
    vi.mocked(buildSummary).mockResolvedValue({
      leadCount: 5,
      executive: { wonDealsCount: 1 },
    } as Awaited<ReturnType<typeof buildSummary>>);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/reports/executive/route");
    const req = new Request("http://test/api/reports/executive");
    const res = await GET(req as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns executive summary for authenticated user", async () => {
    setSession({
      userId: "u1",
      tenantId: "t1",
      role: "Administrator",
      email: "a@x.co",
      name: "A",
    });
    const { GET } = await import("@/app/api/reports/executive/route");
    const req = new Request(
      "http://test/api/reports/executive?from=2026-01-01&to=2026-01-31",
      { headers: { "X-Client-TZ": "Asia/Kolkata" } },
    );
    const res = await GET(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.leadCount).toBe(5);
  });
});
