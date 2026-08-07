import { describe, expect, it, beforeEach, vi, type Mock } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();
const asMock = <T>(fn: T): Mock => fn as unknown as Mock;

describe("POST /api/reports/custom/run", () => {
  beforeEach(() => {
    asMock(db.qcfLead.groupBy).mockReset();
    setSession(null);
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/reports/custom/run/route");
    const req = new Request("http://test/api/reports/custom/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ object: "leads", groupBy: "source", metric: "count" }),
    });
    const res = await POST(req as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("runs a valid custom lead report", async () => {
    setSession({
      userId: "u1",
      tenantId: "t1",
      role: "Administrator",
      email: "a@x.co",
      name: "A",
    });
    asMock(db.qcfLead.groupBy).mockResolvedValueOnce([] as never);

    const { POST } = await import("@/app/api/reports/custom/run/route");
    const req = new Request("http://test/api/reports/custom/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        object: "leads",
        groupBy: "source",
        metric: "count",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-01-31T23:59:59.999Z",
      }),
    });
    const res = await POST(req as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.columns).toBeDefined();
  });
});
