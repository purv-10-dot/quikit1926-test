import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

describe("GET /api/opportunities", () => {
  beforeEach(() => {
    db.crmOpportunity.findMany.mockReset();
    db.crmOpportunity.count.mockReset();
    db.crmUserAccountAccess.findMany.mockReset();
    db.crmSalesGroupMember.findMany.mockReset();
    db.crmSalesGroupManager.findMany.mockReset();
    db.crmSalesGroupAccount.findMany.mockReset();
    db.crmUserPermissionTemplate.findMany.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/opportunities/route");
    const req = new Request("http://test/api/opportunities");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns the {success, data} envelope on a happy GET", async () => {
    setSession({
      userId: "u1",
      orgId: "t1",
      role: "admin",
      email: "a@b.co",
      name: "Alice",
    });
    db.crmUserAccountAccess.findMany.mockResolvedValue([]);
    db.crmSalesGroupMember.findMany.mockResolvedValue([]);
    db.crmSalesGroupManager.findMany.mockResolvedValue([]);
    db.crmSalesGroupAccount.findMany.mockResolvedValue([]);
    db.crmUserPermissionTemplate.findMany.mockResolvedValue([]);
    db.crmOpportunity.findMany.mockResolvedValue([
      {
        id: "o1",
        name: "Acme Q4",
        accountId: "a1",
        account: { id: "a1", name: "Acme" },
        leadId: null,
        stage: "Prospecting",
        amount: "100000",
        currency: "INR",
        probability: 25,
        weightedAmount: "25000",
        closeDate: null,
        ownerId: null,
        ownerName: null,
        lastStageChangeAt: new Date(),
        lastActivityAt: null,
        deletedAt: null,
        createdAt: new Date(),
      } as never,
    ]);
    db.crmOpportunity.count.mockResolvedValue(1);

    const { GET } = await import("@/app/api/opportunities/route");
    const req = new Request("http://test/api/opportunities");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0]).toMatchObject({
      id: "o1",
      name: "Acme Q4",
      amountDisplay: expect.stringContaining("₹"),
    });
    expect(body.data.total).toBe(1);
  });
});

describe("POST /api/opportunities — tenant isolation", () => {
  beforeEach(() => {
    db.crmAccount.findFirst.mockReset();
    db.crmOpportunity.create.mockReset();
    db.crmActivity.create.mockReset();
    db.user.findUnique.mockReset();
    db.crmUserPermissionTemplate.findMany.mockReset();
    setSession(null);
  });

  it("returns 404 when the referenced account belongs to another tenant", async () => {
    setSession({
      userId: "u1",
      orgId: "tenant-A",
      role: "admin",
      email: "a@b.co",
      name: "Alice",
    });
    db.crmUserPermissionTemplate.findMany.mockResolvedValue([]);
    // assertAccountAccess: admin role shortcut returns immediately, so no
    // ACL queries are needed.
    // crmAccount lookup is scoped by orgId — return null to simulate that
    // the account exists only in tenant B.
    db.crmAccount.findFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/opportunities/route");
    const req = new Request("http://test/api/opportunities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Cross-tenant attempt",
        accountId: "acct-from-tenant-B",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});
