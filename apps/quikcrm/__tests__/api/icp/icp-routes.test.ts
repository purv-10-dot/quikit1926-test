/**
 * ICP route tests — the three cases this app requires of every new API route:
 * unauthenticated → 401, org-isolation (another tenant's row is unreachable),
 * and the happy path. Plus the ICP-specific link-ownership guard, which is the
 * part most likely to regress into a cross-tenant leak.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session(orgId = "t1", role = "Administrator") {
  setSession({ userId: "u1", orgId, role, email: "a@b.co", name: "Alice" });
}

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
});

describe("GET /api/icp", () => {
  it("401s when unauthenticated", async () => {
    const { GET } = await import("@/app/api/icp/route");
    const res = await GET(jsonReq("http://test/api/icp", "GET"));
    expect(res.status).toBe(401);
  });

  it("scopes the query to the caller's orgId", async () => {
    session("t1");
    db.crmIcpProfile.findMany.mockResolvedValue([] as never);
    db.crmIcpProfile.count.mockResolvedValue(0 as never);

    const { GET } = await import("@/app/api/icp/route");
    const res = await GET(jsonReq("http://test/api/icp", "GET"));
    expect(res.status).toBe(200);

    const where = db.crmIcpProfile.findMany.mock.calls[0]?.[0]?.where as {
      orgId?: string;
      deletedAt?: unknown;
    };
    expect(where.orgId).toBe("t1");
    // Active list must exclude soft-deleted rows — no middleware covers Crm*.
    expect(where.deletedAt).toBeNull();
  });

  it("returns the paginated envelope on the happy path", async () => {
    session("t1");
    db.crmIcpProfile.findMany.mockResolvedValue([
      {
        id: "icp1",
        name: "Mid-market manufacturers",
        description: null,
        segment: "MidMarket",
        employeeCountMin: 50,
        employeeCountMax: 500,
        annualRevenueMin: null,
        annualRevenueMax: null,
        revenueCurrency: "INR",
        countryCodes: ["IN"],
        regions: [],
        isActive: true,
        deletedAt: null,
        createdAt: new Date("2026-08-01"),
        updatedAt: new Date("2026-08-02"),
        _count: { taxonomyLinks: 2, productLinks: 1, accountLinks: 3 },
      },
    ] as never);
    db.crmIcpProfile.count.mockResolvedValue(1 as never);

    const { GET } = await import("@/app/api/icp/route");
    const res = await GET(jsonReq("http://test/api/icp", "GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].name).toBe("Mid-market manufacturers");
    // _count is folded into flat counts for the table.
    expect(body.data.items[0].taxonomyCount).toBe(2);
    expect(body.data.items[0].accountCount).toBe(3);
    expect(body.data.items[0]._count).toBeUndefined();
  });

  it("400s on an out-of-contract pageSize", async () => {
    session("t1");
    const { GET } = await import("@/app/api/icp/route");
    const res = await GET(jsonReq("http://test/api/icp?pageSize=999", "GET"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/icp", () => {
  it("401s when unauthenticated", async () => {
    const { POST } = await import("@/app/api/icp/route");
    const res = await POST(jsonReq("http://test/api/icp", "POST", { name: "X" }));
    expect(res.status).toBe(401);
  });

  it("400s with fieldErrors when the name is missing", async () => {
    session("t1");
    const { POST } = await import("@/app/api/icp/route");
    const res = await POST(jsonReq("http://test/api/icp", "POST", { description: "no name" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.fieldErrors?.name).toBeTruthy();
  });

  it("400s when employee min exceeds max", async () => {
    session("t1");
    const { POST } = await import("@/app/api/icp/route");
    const res = await POST(
      jsonReq("http://test/api/icp", "POST", {
        name: "Bad range",
        employeeCountMin: 500,
        employeeCountMax: 50,
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.fieldErrors?.employeeCountMax).toBeTruthy();
  });

  it("REJECTS a product id from another tenant (link-ownership guard)", async () => {
    session("t1");
    // The product exists, but not in t1 — the count comes back short.
    db.crmProduct.count.mockResolvedValue(0 as never);

    const { POST } = await import("@/app/api/icp/route");
    const res = await POST(
      jsonReq("http://test/api/icp", "POST", {
        name: "Cross-tenant attempt",
        productIds: ["p-from-t2"],
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.fieldErrors?.productIds).toBeTruthy();
    expect(db.crmIcpProfile.create).not.toHaveBeenCalled();
  });

  it("REJECTS an account id from another tenant", async () => {
    session("t1");
    db.crmAccount.count.mockResolvedValue(0 as never);

    const { POST } = await import("@/app/api/icp/route");
    const res = await POST(
      jsonReq("http://test/api/icp", "POST", {
        name: "Cross-tenant accounts",
        accountIds: ["a-from-t2"],
      }),
    );
    expect(res.status).toBe(400);
    expect(db.crmIcpProfile.create).not.toHaveBeenCalled();
  });

  it("creates with 201 and stamps orgId + createdByUserId", async () => {
    session("t1");
    db.crmIcpProfile.create.mockResolvedValue({ id: "icp1", name: "Enterprise SaaS" } as never);

    const { POST } = await import("@/app/api/icp/route");
    const res = await POST(
      jsonReq("http://test/api/icp", "POST", { name: "Enterprise SaaS", segment: "Enterprise" }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    const data = db.crmIcpProfile.create.mock.calls[0]?.[0]?.data as {
      orgId?: string;
      createdByUserId?: string;
    };
    expect(data.orgId).toBe("t1");
    expect(data.createdByUserId).toBe("u1");
  });

  it("409s on a duplicate name (P2002)", async () => {
    session("t1");
    db.crmIcpProfile.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }) as never,
    );

    const { POST } = await import("@/app/api/icp/route");
    const res = await POST(jsonReq("http://test/api/icp", "POST", { name: "Dupe" }));
    expect(res.status).toBe(409);
  });
});

describe("GET/PATCH/DELETE /api/icp/[id]", () => {
  it("401s when unauthenticated", async () => {
    const { GET } = await import("@/app/api/icp/[id]/route");
    const res = await GET(jsonReq("http://test/api/icp/icp1", "GET"), {
      params: Promise.resolve({ id: "icp1" }),
    });
    expect(res.status).toBe(401);
  });

  it("404s for an id belonging to another org (isolation)", async () => {
    session("t1");
    // findFirst is org-scoped, so a t2 row resolves to null for t1.
    db.crmIcpProfile.findFirst.mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/icp/[id]/route");
    const res = await GET(jsonReq("http://test/api/icp/icp-t2", "GET"), {
      params: Promise.resolve({ id: "icp-t2" }),
    });
    expect(res.status).toBe(404);

    const where = db.crmIcpProfile.findFirst.mock.calls[0]?.[0]?.where as { orgId?: string };
    expect(where.orgId).toBe("t1");
  });

  it("PATCH 404s for another org's row before writing", async () => {
    session("t1");
    db.crmIcpProfile.findFirst.mockResolvedValue(null as never);

    const { PATCH } = await import("@/app/api/icp/[id]/route");
    const res = await PATCH(jsonReq("http://test/api/icp/icp-t2", "PATCH", { name: "Hijack" }), {
      params: Promise.resolve({ id: "icp-t2" }),
    });
    expect(res.status).toBe(404);
    expect(db.crmIcpProfile.update).not.toHaveBeenCalled();
  });

  it("PATCH 400s on an unknown key (strict schema)", async () => {
    session("t1");
    const { PATCH } = await import("@/app/api/icp/[id]/route");
    const res = await PATCH(
      jsonReq("http://test/api/icp/icp1", "PATCH", { orgId: "t2" }),
      { params: Promise.resolve({ id: "icp1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("DELETE soft-deletes by default", async () => {
    session("t1");
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmIcpProfile.update.mockResolvedValue({ id: "icp1" } as never);

    const { DELETE } = await import("@/app/api/icp/[id]/route");
    const res = await DELETE(jsonReq("http://test/api/icp/icp1", "DELETE"), {
      params: Promise.resolve({ id: "icp1" }),
    });

    expect(res.status).toBe(200);
    const data = db.crmIcpProfile.update.mock.calls[0]?.[0]?.data as { deletedAt?: Date };
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(db.crmIcpProfile.delete).not.toHaveBeenCalled();
  });

  it("DELETE ?permanent=true hard-deletes", async () => {
    session("t1");
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmIcpProfile.delete.mockResolvedValue({ id: "icp1" } as never);

    const { DELETE } = await import("@/app/api/icp/[id]/route");
    const res = await DELETE(jsonReq("http://test/api/icp/icp1?permanent=true", "DELETE"), {
      params: Promise.resolve({ id: "icp1" }),
    });

    expect(res.status).toBe(200);
    expect(db.crmIcpProfile.delete).toHaveBeenCalled();
  });
});
