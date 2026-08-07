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

describe("GET /api/marketing/campaigns/[id]", () => {
  beforeEach(() => {
    db.qcfCampaign.findFirst.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/marketing/campaigns/[id]/route");
    const req = new Request("http://test/api/marketing/campaigns/c1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 for missing campaign", async () => {
    adminSession();
    db.qcfCampaign.findFirst.mockResolvedValue(null);
    const { GET } = await import("@/app/api/marketing/campaigns/[id]/route");
    const req = new Request("http://test/api/marketing/campaigns/missing");
    const res = await GET(req as never, { params: Promise.resolve({ id: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns serialized campaign for tenant", async () => {
    adminSession();
    db.qcfCampaign.findFirst.mockResolvedValue({
      id: "c1",
      orgId: "t1",
      name: "Diwali Offer",
      status: "Draft",
      type: "Email",
      startDate: new Date("2026-10-01"),
      endDate: null,
      config: { budget: 50000, budgetCurrency: "INR", description: "Promo" },
      createdAt: new Date("2026-05-01"),
      updatedAt: new Date("2026-05-01"),
    } as never);

    const { GET } = await import("@/app/api/marketing/campaigns/[id]/route");
    const req = new Request("http://test/api/marketing/campaigns/c1");
    const res = await GET(req as never, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Diwali Offer");
    expect(body.budget).toBe(50000);
    expect(body.description).toBe("Promo");

    const where = db.qcfCampaign.findFirst.mock.calls[0]![0]!.where as {
      id: string;
      orgId: string;
    };
    expect(where).toEqual({ id: "c1", orgId: "t1" });
  });
});
