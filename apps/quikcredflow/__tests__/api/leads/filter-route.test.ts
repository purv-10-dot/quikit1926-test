import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

vi.mock("@/lib/services/fields/repo", () => ({
  listCustomFields: vi.fn().mockResolvedValue([]),
}));

describe("POST /api/leads/filter", () => {
  beforeEach(() => {
    db.qcfLead.findMany.mockReset();
    db.qcfLead.count.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/leads/filter/route");
    const req = new Request("http://test/api/leads/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filter: { matchMode: "ALL", conditions: [] },
        page: 1,
        pageSize: 10,
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("translates contains conditions with tenant scope", async () => {
    setSession({
      userId: "u1",
      orgId: "t1",
      role: "Administrator",
      email: "a@b.co",
      name: "Alice",
    });
    db.qcfLead.findMany.mockResolvedValue([]);
    db.qcfLead.count.mockResolvedValue(0);

    const { POST } = await import("@/app/api/leads/filter/route");
    const req = new Request("http://test/api/leads/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filter: {
          matchMode: "ALL",
          conditions: [{ field: "company", operator: "contains", value: "Acme" }],
        },
        page: 1,
        pageSize: 25,
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);

    const where = db.qcfLead.findMany.mock.calls[0]![0]!.where as {
      AND: Array<Record<string, unknown>>;
    };
    expect(where.AND[0]).toMatchObject({ orgId: "t1" });
    const filterFrag = where.AND[1] as { company?: { contains?: string } };
    expect(filterFrag.company?.contains).toBe("Acme");
  });

  it("applies toolbar search across email and company", async () => {
    setSession({
      userId: "u1",
      orgId: "t1",
      role: "Administrator",
      email: "a@b.co",
      name: "Alice",
    });
    db.qcfLead.findMany.mockResolvedValue([]);
    db.qcfLead.count.mockResolvedValue(0);

    const { POST } = await import("@/app/api/leads/filter/route");
    const req = new Request("http://test/api/leads/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        // Toolbar search is expressed as a "__quickSearch" pseudo-field
        // condition (LEAD_QUICK_SEARCH_FIELD), not a top-level `search` param;
        // the engine expands it to an OR across name/email/company/phone/…
        filter: {
          matchMode: "ALL",
          conditions: [{ field: "__quickSearch", operator: "contains", value: "acme@example.com" }],
        },
        page: 1,
        pageSize: 25,
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const where = db.qcfLead.findMany.mock.calls[0]![0]!.where as {
      AND: Array<Record<string, unknown>>;
    };
    const searchFrag = where.AND[1] as { OR: Array<Record<string, unknown>> };
    expect(searchFrag.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: { contains: "acme@example.com", mode: "insensitive" } }),
        expect.objectContaining({ company: { contains: "acme@example.com", mode: "insensitive" } }),
      ]),
    );
  });

  it("returns 400 for invalid match mode", async () => {
    setSession({
      userId: "u1",
      orgId: "t1",
      role: "Administrator",
      email: "a@b.co",
      name: "Alice",
    });
    const { POST } = await import("@/app/api/leads/filter/route");
    const req = new Request("http://test/api/leads/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filter: { matchMode: "INVALID", conditions: [] } }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });
});
