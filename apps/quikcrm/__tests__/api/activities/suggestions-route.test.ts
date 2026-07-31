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

function makeReq(q: string) {
  const url = q
    ? `http://test/api/activities/suggestions?q=${encodeURIComponent(q)}`
    : "http://test/api/activities/suggestions";
  return new Request(url) as unknown as import("next/server").NextRequest;
}

describe("GET /api/activities/suggestions", () => {
  beforeEach(async () => {
    db.crmActivity.findMany.mockReset();
    db.crmLead.findMany.mockReset();
    db.crmContact.findMany.mockReset();
    db.crmAccount.findMany.mockReset();
    db.crmOpportunity.findMany.mockReset();
    // Keep the account-acl scope pinned to unrestricted (admin) across tests —
    // the global setup can strip the factory mock's resolved value between runs.
    const acl = await import("@/lib/auth/account-acl");
    (acl.getScope as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      unrestricted: true,
    });
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/activities/suggestions/route");
    const res = await GET(makeReq("shakshi"));
    expect(res.status).toBe(401);
  });

  it("returns empty groups without a query (no DB hit)", async () => {
    adminSession();
    const { GET } = await import("@/app/api/activities/suggestions/route");
    const res = await GET(makeReq(""));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true, data: { owners: [], records: [] } });
    expect(db.crmActivity.findMany).not.toHaveBeenCalled();
  });

  it("suggests distinct owners matching the query, scoped to the org", async () => {
    adminSession();
    db.crmActivity.findMany.mockResolvedValueOnce([
      { ownerId: "o1", ownerName: "Shakshi Jain" },
      { ownerId: "o2", ownerName: "Shakti Rao" },
    ] as never);
    // No record candidates.
    db.crmLead.findMany.mockResolvedValue([] as never);
    db.crmContact.findMany.mockResolvedValue([] as never);
    db.crmAccount.findMany.mockResolvedValue([] as never);
    db.crmOpportunity.findMany.mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/activities/suggestions/route");
    const res = await GET(makeReq("sha"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.owners).toEqual([
      { id: "o1", name: "Shakshi Jain" },
      { id: "o2", name: "Shakti Rao" },
    ]);

    // Owner query is org-scoped and distinct by ownerId.
    const ownerCall = db.crmActivity.findMany.mock.calls[0]?.[0];
    expect(ownerCall?.distinct).toEqual(["ownerId"]);
    const and = (ownerCall?.where as { AND: Record<string, unknown>[] }).AND;
    expect(and).toContainEqual({ orgId: "t1" });
    expect(and).toContainEqual({ ownerName: { contains: "sha", mode: "insensitive" } });
  });

  it("only suggests records that have a linked activity", async () => {
    adminSession();
    // No owner matches.
    db.crmActivity.findMany
      .mockResolvedValueOnce([] as never) // owners query
      .mockResolvedValueOnce([
        // linked-existence query: only lead-1 has an activity
        { relatedKind: "Lead", relatedObjectId: "lead-1" },
      ] as never);
    db.crmLead.findMany.mockResolvedValue([
      { id: "lead-1", name: "Mandy Yap" },
      { id: "lead-2", name: "Mandy Other" }, // matches name but has no activity → dropped
    ] as never);
    db.crmContact.findMany.mockResolvedValue([] as never);
    db.crmAccount.findMany.mockResolvedValue([] as never);
    db.crmOpportunity.findMany.mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/activities/suggestions/route");
    const res = await GET(makeReq("mandy"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.records).toEqual([{ id: "lead-1", name: "Mandy Yap", kind: "Lead" }]);
  });
});
