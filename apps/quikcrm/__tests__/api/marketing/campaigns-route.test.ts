import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function adminSession() {
  setSession({
    userId: "u1",
    orgId: "t1",
    role: "Administrator",
    email: "a@b.co",
    name: "Alice",
  });
}

describe("POST /api/marketing/campaigns", () => {
  beforeEach(() => {
    db.crmCampaign.create.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/marketing/campaigns/route");
    const req = new Request("http://test/api/marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Diwali Offer" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("creates a campaign scoped to the tenant", async () => {
    adminSession();
    db.crmCampaign.create.mockResolvedValue({
      id: "c1",
      orgId: "t1",
      name: "Diwali Offer",
      status: "Draft",
      type: "Email",
    } as never);

    const { POST } = await import("@/app/api/marketing/campaigns/route");
    const req = new Request("http://test/api/marketing/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Diwali Offer",
        type: "Email",
        status: "Draft",
        budget: 50000,
        description: "Seasonal email blast",
        startDate: "2026-10-01",
        endDate: "2026-10-31",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);

    const data = db.crmCampaign.create.mock.calls[0]![0]!.data as {
      orgId: string;
      name: string;
      config?: { budget: number; description: string };
    };
    expect(data.orgId).toBe("t1");
    expect(data.name).toBe("Diwali Offer");
    expect(data.config).toMatchObject({
      budget: 50000,
      budgetCurrency: "INR",
      description: "Seasonal email blast",
    });
  });
});
