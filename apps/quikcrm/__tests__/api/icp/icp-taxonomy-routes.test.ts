/**
 * ICP taxonomy master route tests: 401, org-isolation, happy path, plus the
 * two guards that protect referential integrity — delete-while-in-use and
 * parent-must-match-kind.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session(orgId = "t1") {
  setSession({ userId: "u1", orgId, role: "Administrator", email: "a@b.co", name: "Alice" });
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

describe("GET /api/icp/taxonomy", () => {
  it("401s when unauthenticated", async () => {
    const { GET } = await import("@/app/api/icp/taxonomy/route");
    const res = await GET(jsonReq("http://test/api/icp/taxonomy", "GET"));
    expect(res.status).toBe(401);
  });

  it("filters by orgId and kind", async () => {
    session("t1");
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);
    db.crmIcpTaxonomy.count.mockResolvedValue(0 as never);

    const { GET } = await import("@/app/api/icp/taxonomy/route");
    const res = await GET(jsonReq("http://test/api/icp/taxonomy?kind=Industry", "GET"));
    expect(res.status).toBe(200);

    const where = db.crmIcpTaxonomy.findMany.mock.calls[0]?.[0]?.where as {
      orgId?: string;
      kind?: string;
    };
    expect(where.orgId).toBe("t1");
    expect(where.kind).toBe("Industry");
  });

  it("400s on an invalid kind", async () => {
    session("t1");
    const { GET } = await import("@/app/api/icp/taxonomy/route");
    const res = await GET(jsonReq("http://test/api/icp/taxonomy?kind=Nonsense", "GET"));
    expect(res.status).toBe(400);
  });

  it("folds _count into usageCount", async () => {
    session("t1");
    db.crmIcpTaxonomy.findMany.mockResolvedValue([
      {
        id: "tx1",
        kind: "Industry",
        name: "Manufacturing",
        code: null,
        parentId: null,
        parent: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { profileLinks: 4 },
      },
    ] as never);
    db.crmIcpTaxonomy.count.mockResolvedValue(1 as never);

    const { GET } = await import("@/app/api/icp/taxonomy/route");
    const res = await GET(jsonReq("http://test/api/icp/taxonomy", "GET"));
    const body = await res.json();
    expect(body.data.items[0].usageCount).toBe(4);
    expect(body.data.items[0]._count).toBeUndefined();
  });
});

describe("POST /api/icp/taxonomy", () => {
  it("creates with orgId stamped", async () => {
    session("t1");
    db.crmIcpTaxonomy.create.mockResolvedValue({
      id: "tx1",
      kind: "Industry",
      name: "Manufacturing",
    } as never);

    const { POST } = await import("@/app/api/icp/taxonomy/route");
    const res = await POST(
      jsonReq("http://test/api/icp/taxonomy", "POST", { kind: "Industry", name: "Manufacturing" }),
    );
    expect(res.status).toBe(201);
    const data = db.crmIcpTaxonomy.create.mock.calls[0]?.[0]?.data as { orgId?: string };
    expect(data.orgId).toBe("t1");
  });

  it("409s on a duplicate name within a kind", async () => {
    session("t1");
    db.crmIcpTaxonomy.create.mockRejectedValue(
      Object.assign(new Error("Unique"), { code: "P2002" }) as never,
    );

    const { POST } = await import("@/app/api/icp/taxonomy/route");
    const res = await POST(
      jsonReq("http://test/api/icp/taxonomy", "POST", { kind: "Vertical", name: "Dupe" }),
    );
    expect(res.status).toBe(409);
  });

  it("rejects a parent of a different kind", async () => {
    session("t1");
    // Parent exists but is an Industry while we're creating a Technology.
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({ id: "p1", kind: "Industry" } as never);

    const { POST } = await import("@/app/api/icp/taxonomy/route");
    const res = await POST(
      jsonReq("http://test/api/icp/taxonomy", "POST", {
        kind: "Technology",
        name: "Child",
        parentId: "p1",
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.fieldErrors?.parentId).toBeTruthy();
    expect(db.crmIcpTaxonomy.create).not.toHaveBeenCalled();
  });

  it("rejects a parent from another org", async () => {
    session("t1");
    db.crmIcpTaxonomy.findFirst.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/icp/taxonomy/route");
    const res = await POST(
      jsonReq("http://test/api/icp/taxonomy", "POST", {
        kind: "Industry",
        name: "Child",
        parentId: "p-from-t2",
      }),
    );
    expect(res.status).toBe(400);
    expect(db.crmIcpTaxonomy.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/icp/taxonomy/[id]", () => {
  it("409s while the entry is used by an ICP profile", async () => {
    session("t1");
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({
      id: "tx1",
      _count: { profileLinks: 3, children: 0 },
    } as never);

    const { DELETE } = await import("@/app/api/icp/taxonomy/[id]/route");
    const res = await DELETE(jsonReq("http://test/api/icp/taxonomy/tx1", "DELETE"), {
      params: Promise.resolve({ id: "tx1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/in use by 3 ICP profiles/i);
    expect(db.crmIcpTaxonomy.delete).not.toHaveBeenCalled();
  });

  it("409s while the entry still has children", async () => {
    session("t1");
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({
      id: "tx1",
      _count: { profileLinks: 0, children: 2 },
    } as never);

    const { DELETE } = await import("@/app/api/icp/taxonomy/[id]/route");
    const res = await DELETE(jsonReq("http://test/api/icp/taxonomy/tx1", "DELETE"), {
      params: Promise.resolve({ id: "tx1" }),
    });
    expect(res.status).toBe(409);
    expect(db.crmIcpTaxonomy.delete).not.toHaveBeenCalled();
  });

  it("deletes an unused entry", async () => {
    session("t1");
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({
      id: "tx1",
      _count: { profileLinks: 0, children: 0 },
    } as never);
    db.crmIcpTaxonomy.delete.mockResolvedValue({ id: "tx1" } as never);

    const { DELETE } = await import("@/app/api/icp/taxonomy/[id]/route");
    const res = await DELETE(jsonReq("http://test/api/icp/taxonomy/tx1", "DELETE"), {
      params: Promise.resolve({ id: "tx1" }),
    });
    expect(res.status).toBe(200);
    expect(db.crmIcpTaxonomy.delete).toHaveBeenCalled();
  });

  it("404s for another org's entry", async () => {
    session("t1");
    db.crmIcpTaxonomy.findFirst.mockResolvedValue(null as never);

    const { DELETE } = await import("@/app/api/icp/taxonomy/[id]/route");
    const res = await DELETE(jsonReq("http://test/api/icp/taxonomy/tx-t2", "DELETE"), {
      params: Promise.resolve({ id: "tx-t2" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/icp/taxonomy/[id]", () => {
  it("rejects a kind change (kind is omitted from the update schema)", async () => {
    session("t1");
    const { PATCH } = await import("@/app/api/icp/taxonomy/[id]/route");
    const res = await PATCH(
      jsonReq("http://test/api/icp/taxonomy/tx1", "PATCH", { kind: "Vertical" }),
      { params: Promise.resolve({ id: "tx1" }) },
    );
    expect(res.status).toBe(400);
    expect(db.crmIcpTaxonomy.update).not.toHaveBeenCalled();
  });

  it("refuses to make an entry its own parent", async () => {
    session("t1");
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({ id: "tx1", kind: "Industry" } as never);

    const { PATCH } = await import("@/app/api/icp/taxonomy/[id]/route");
    const res = await PATCH(
      jsonReq("http://test/api/icp/taxonomy/tx1", "PATCH", { parentId: "tx1" }),
      { params: Promise.resolve({ id: "tx1" }) },
    );
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.fieldErrors?.parentId).toBeTruthy();
  });
});
