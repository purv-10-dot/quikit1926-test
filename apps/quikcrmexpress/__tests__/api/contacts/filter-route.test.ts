import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

describe("POST /api/contacts/filter", () => {
  beforeEach(() => {
    db.qceContact.findMany.mockReset();
    db.qceContact.count.mockReset();
    db.qceAccount.findMany.mockReset();
    setSession(null);
  });

  it("translates contains conditions and applies tenant scope", async () => {
    setSession({
      userId: "u1",
      orgId: "t1",
      role: "Administrator",
      email: "a@b.co",
      name: "Alice",
    });
    db.qceContact.findMany.mockResolvedValue([]);
    db.qceContact.count.mockResolvedValue(0);
    db.qceAccount.findMany.mockResolvedValue([]);

    const { POST } = await import("@/app/api/contacts/filter/route");
    const req = new Request("http://test/api/contacts/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filter: {
          matchMode: "ALL",
          conditions: [{ field: "email", operator: "contains", value: "@acme.test" }],
        },
        page: 1,
        pageSize: 25,
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const where = db.qceContact.findMany.mock.calls[0]![0]!.where as {
      AND: Array<Record<string, unknown>>;
    };
    expect(Array.isArray(where.AND)).toBe(true);
    expect(where.AND[0]).toMatchObject({ orgId: "t1" });
    // Filter fragment should appear next.
    const filterFrag = where.AND[1] as { email?: { contains?: string } };
    expect(filterFrag.email?.contains).toBe("@acme.test");
  });

  it("merges search with advanced filter conditions", async () => {
    setSession({
      userId: "u1",
      orgId: "t1",
      role: "Administrator",
      email: "a@b.co",
      name: "Alice",
    });
    db.qceContact.findMany.mockResolvedValue([]);
    db.qceContact.count.mockResolvedValue(0);
    db.qceAccount.findMany.mockResolvedValue([]);

    const { POST } = await import("@/app/api/contacts/filter/route");
    const req = new Request("http://test/api/contacts/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filter: {
          matchMode: "ALL",
          conditions: [{ field: "contactStage", operator: "eq", value: "Qualified" }],
        },
        page: 1,
        pageSize: 25,
        search: "acme",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const where = db.qceContact.findMany.mock.calls[0]![0]!.where as {
      AND: Array<Record<string, unknown>>;
    };
    const searchFrag = where.AND.find((p) => "OR" in p) as { OR: unknown[] } | undefined;
    expect(searchFrag?.OR).toBeDefined();
    expect(searchFrag!.OR.length).toBeGreaterThan(0);
  });

  it("returns 400 for an invalid payload", async () => {
    setSession({
      userId: "u1",
      orgId: "t1",
      role: "Administrator",
      email: "a@b.co",
      name: "Alice",
    });
    const { POST } = await import("@/app/api/contacts/filter/route");
    const req = new Request("http://test/api/contacts/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filter: { matchMode: "INVALID", conditions: [] } }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });
});
