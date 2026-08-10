/**
 * POST /api/settings/prospects/[id]/convert — auth + prospect-visibility scope.
 *
 * The visibility fix has to hold at the API, not just on the server-rendered
 * page: a non-admin who guesses another user's prospect id must not be able to
 * convert it. The route now looks the prospect up through prospectScopeWhere,
 * so a foreign prospect simply isn't found → 404 (deliberately not 403; a user
 * who can't see the row must not learn it exists).
 *
 * Seam (mockDb): mocked Prisma + mocked requireApiUser via setSession.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

const ROUTE = "@/app/api/settings/prospects/[id]/convert/route";

function convertReq(body: unknown) {
  return new Request("http://test/api/settings/prospects/p1/convert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const ctx = (id = "p1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  setSession(null);
  db.crmProspect.findFirst.mockReset();
  db.crmProspect.update.mockReset();
  db.crmLead.findFirst.mockReset();
});

describe("POST /api/settings/prospects/[id]/convert", () => {
  it("401 when unauthenticated", async () => {
    const { POST } = await import(ROUTE);
    const res = await POST(convertReq({ leadId: "l1" }), ctx());
    expect(res.status).toBe(401);
    expect(db.crmProspect.findFirst).not.toHaveBeenCalled();
  });

  it("scopes a non-admin's lookup to their own savedById", async () => {
    setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });
    // The prospect belongs to someone else → the scoped query finds nothing.
    db.crmProspect.findFirst.mockResolvedValue(null);

    const { POST } = await import(ROUTE);
    const res = await POST(convertReq({ leadId: "l1" }), ctx());

    expect(res.status).toBe(404);
    expect(db.crmProspect.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1", orgId: "org1", savedById: "u1" },
      }),
    );
    // No write may happen on a prospect the caller cannot see.
    expect(db.crmProspect.update).not.toHaveBeenCalled();
  });

  it.each(["SalesManager", "MarketingUser", "FinanceUser", "TeamManager"])(
    "scopes %s to their own savedById too (no manager roll-up)",
    async (role) => {
      setSession({ userId: "u1", orgId: "org1", role });
      db.crmProspect.findFirst.mockResolvedValue(null);

      const { POST } = await import(ROUTE);
      await POST(convertReq({ leadId: "l1" }), ctx());

      expect(db.crmProspect.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "p1", orgId: "org1", savedById: "u1" },
        }),
      );
    },
  );

  it("does NOT narrow by savedById for an Administrator (org-wide)", async () => {
    setSession({ userId: "admin1", orgId: "org1", role: "Administrator" });
    db.crmProspect.findFirst.mockResolvedValue({
      id: "p1",
      status: "New",
      convertedLeadId: null,
    } as never);
    db.crmLead.findFirst.mockResolvedValue({ id: "l1" } as never);
    db.crmProspect.update.mockResolvedValue({
      id: "p1",
      status: "Converted",
      convertedLeadId: "l1",
      convertedAt: new Date(0),
    } as never);

    const { POST } = await import(ROUTE);
    const res = await POST(convertReq({ leadId: "l1" }), ctx());

    expect(res.status).toBe(200);
    expect(db.crmProspect.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "p1", orgId: "org1" } }),
    );
  });

  it("happy path: owner converts their own prospect", async () => {
    setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });
    db.crmProspect.findFirst.mockResolvedValue({
      id: "p1",
      status: "New",
      convertedLeadId: null,
    } as never);
    db.crmLead.findFirst.mockResolvedValue({ id: "l1" } as never);
    db.crmProspect.update.mockResolvedValue({
      id: "p1",
      status: "Converted",
      convertedLeadId: "l1",
      convertedAt: new Date(0),
    } as never);

    const { POST } = await import(ROUTE);
    const res = await POST(convertReq({ leadId: "l1" }), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe("Converted");
    expect(db.crmProspect.update).toHaveBeenCalled();
  });

  it("400 on a missing leadId", async () => {
    setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });
    const { POST } = await import(ROUTE);
    const res = await POST(convertReq({}), ctx());
    expect(res.status).toBe(400);
  });

  it("stays idempotent for an already-converted prospect", async () => {
    setSession({ userId: "u1", orgId: "org1", role: "SalesUser" });
    db.crmProspect.findFirst.mockResolvedValue({
      id: "p1",
      status: "Converted",
      convertedLeadId: "existing",
    } as never);

    const { POST } = await import(ROUTE);
    const res = await POST(convertReq({ leadId: "l2" }), ctx());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.convertedLeadId).toBe("existing");
    expect(db.crmProspect.update).not.toHaveBeenCalled();
  });
});
