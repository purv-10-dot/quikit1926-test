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

describe("POST /api/activities/filter", () => {
  beforeEach(async () => {
    db.crmActivity.findMany.mockReset();
    db.crmActivity.count.mockReset();
    db.crmLead.findMany.mockReset();
    db.crmOpportunity.findMany.mockReset();
    db.crmContact.findMany.mockReset();
    db.crmAccount.findMany.mockReset();
    // The global setup's restoreAllMocks/clearAllMocks can strip the account-acl
    // factory mock's resolved value between tests; re-pin it so every test in
    // this file resolves a real scope (admin → unrestricted) regardless of order.
    const acl = await import("@/lib/auth/account-acl");
    (acl.getScope as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      unrestricted: true,
    });
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/activities/filter/route");
    const req = new Request("http://test/api/activities/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filter: { matchMode: "ALL", conditions: [] } }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("batches related-label lookups (one query per kind, not per row)", async () => {
    adminSession();
    const rows = Array.from({ length: 50 }).flatMap((_, i) => [
      {
        id: `a${i}-lead`,
        orgId: "t1",
        type: "Call",
        relatedKind: "Lead",
        relatedObjectId: `lead-${i}`,
        subject: "x",
        outcome: "y",
        ownerName: "Alice",
        ownerId: "u1",
        externalId: null,
        sourceSystem: null,
        occurredAt: new Date(),
        outreach: null,
        activityCode: null,
        logOutcome: null,
        detailNotes: null,
        followUpAt: null,
        opportunityId: null,
        leadId: `lead-${i}`,
        linkedCallLogId: null,
        relatedOrphanedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
      {
        id: `a${i}-opp`,
        orgId: "t1",
        type: "Note",
        relatedKind: "Opportunity",
        relatedObjectId: `opp-${i}`,
        subject: "x",
        outcome: "y",
        ownerName: "Alice",
        ownerId: "u1",
        externalId: null,
        sourceSystem: null,
        occurredAt: new Date(),
        outreach: null,
        activityCode: null,
        logOutcome: null,
        detailNotes: null,
        followUpAt: null,
        opportunityId: `opp-${i}`,
        leadId: null,
        linkedCallLogId: null,
        relatedOrphanedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
    ]);
    db.crmActivity.findMany.mockResolvedValue(rows.slice(0, 25));
    db.crmActivity.count.mockResolvedValue(100);
    db.crmLead.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({ id: `lead-${i}`, name: `Lead ${i}` }) as never),
    );
    db.crmOpportunity.findMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) => ({ id: `opp-${i}`, name: `Opp ${i}` }) as never),
    );

    const { POST } = await import("@/app/api/activities/filter/route");
    const req = new Request("http://test/api/activities/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        filter: { matchMode: "ALL", conditions: [] },
        page: 1,
        pageSize: 25,
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    // N+1 guard: each parent table is hit at most once.
    expect(db.crmLead.findMany.mock.calls.length).toBeLessThanOrEqual(1);
    expect(db.crmOpportunity.findMany.mock.calls.length).toBeLessThanOrEqual(1);
    expect(db.crmContact.findMany.mock.calls.length).toBeLessThanOrEqual(1);
    expect(db.crmAccount.findMany.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("returns 400 for invalid match mode", async () => {
    adminSession();
    const { POST } = await import("@/app/api/activities/filter/route");
    const req = new Request("http://test/api/activities/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filter: { matchMode: "INVALID", conditions: [] } }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("excludes internal lead-creation init events (LeadSystem) from the list query", async () => {
    adminSession();
    db.crmActivity.findMany.mockResolvedValue([]);
    db.crmActivity.count.mockResolvedValue(0);

    const { POST } = await import("@/app/api/activities/filter/route");
    const req = new Request("http://test/api/activities/filter", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filter: { matchMode: "ALL", conditions: [] }, page: 1, pageSize: 25 }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const where = db.crmActivity.findMany.mock.calls[0]?.[0]?.where as {
      AND: Record<string, unknown>[];
    };
    expect(where.AND).toContainEqual({ NOT: { type: "LeadSystem" } });
    // The count (used for pagination) must apply the same exclusion.
    const countWhere = db.crmActivity.count.mock.calls[0]?.[0]?.where as {
      AND: Record<string, unknown>[];
    };
    expect(countWhere.AND).toContainEqual({ NOT: { type: "LeadSystem" } });
  });
});
