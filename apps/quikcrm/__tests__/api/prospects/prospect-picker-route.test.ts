/**
 * GET /api/prospects/picker — dropdown source for the Log Activity composer's
 * Prospect selector ("Link to" → Prospect).
 *
 * Covers the three standard cases (401 / org-isolation / happy path) plus the
 * search filter, since the whole point of the endpoint is search-and-select.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function session(orgId = "t1", role = "Administrator") {
  setSession({ userId: "u1", orgId, role, email: "a@b.co", name: "Alice" });
}

function req(qs = "") {
  return new Request(
    `http://test/api/prospects/picker${qs}`,
  ) as unknown as import("next/server").NextRequest;
}

beforeEach(() => {
  setSession(null);
  vi.clearAllMocks();
});

describe("GET /api/prospects/picker", () => {
  it("401s when unauthenticated", async () => {
    const { GET } = await import("@/app/api/prospects/picker/route");
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("scopes the query to the caller's org", async () => {
    session("t1");
    db.crmProspect.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/prospects/picker/route");
    await GET(req());

    const where = db.crmProspect.findMany.mock.calls[0]?.[0]?.where;
    // Org isolation: a prospect from another tenant can never be selected.
    expect(where).toMatchObject({ orgId: "t1" });
  });

  it("returns id/name/company for the picker", async () => {
    session();
    db.crmProspect.findMany.mockResolvedValue([
      { id: "p1", name: "Jane Doe", company: "Acme" },
    ]);
    const { GET } = await import("@/app/api/prospects/picker/route");
    const res = await GET(req());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.items).toEqual([{ id: "p1", name: "Jane Doe", company: "Acme" }]);
  });

  it("applies a case-insensitive search across name/email/company", async () => {
    session();
    db.crmProspect.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/prospects/picker/route");
    await GET(req("?q=acme"));

    const where = db.crmProspect.findMany.mock.calls[0]?.[0]?.where as {
      OR?: unknown[];
    };
    expect(where.OR).toEqual([
      { name: { contains: "acme", mode: "insensitive" } },
      { email: { contains: "acme", mode: "insensitive" } },
      { company: { contains: "acme", mode: "insensitive" } },
    ]);
  });

  it("clamps limit to at most 100", async () => {
    session();
    db.crmProspect.findMany.mockResolvedValue([]);
    const { GET } = await import("@/app/api/prospects/picker/route");
    await GET(req("?limit=9999"));

    expect(db.crmProspect.findMany.mock.calls[0]?.[0]?.take).toBe(100);
  });
});
