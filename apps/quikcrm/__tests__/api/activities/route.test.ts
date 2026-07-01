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

describe("POST /api/activities (generic)", () => {
  beforeEach(() => {
    db.crmLead.findFirst.mockReset();
    db.crmActivity.create.mockReset();
    db.user.findUnique.mockReset();
    setSession(null);
  });

  it("returns 400 on missing required fields", async () => {
    adminSession();
    const { POST } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("rejects non-primary relatedKind (400)", async () => {
    adminSession();
    const { POST } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "Note",
        relatedKind: "Banana",
        relatedObjectId: "x",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the related Lead does not exist", async () => {
    adminSession();
    db.crmLead.findFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "Note",
        relatedKind: "Lead",
        relatedObjectId: "missing",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(404);
  });

  it("creates a generic activity with happy-path payload", async () => {
    adminSession();
    db.crmLead.findFirst.mockResolvedValue({ id: "L1", accountId: null } as never);
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      firstName: "Alice",
      lastName: "",
      email: "a@b.co",
    } as never);
    db.crmActivity.create.mockResolvedValue({
      id: "act1",
      orgId: "t1",
      type: "Note",
      relatedKind: "Lead",
      relatedObjectId: "L1",
      subject: "S",
      outcome: "O",
      ownerId: "u1",
      ownerName: "Alice",
      externalId: null,
      sourceSystem: null,
      occurredAt: new Date(),
      outreach: null,
      activityCode: null,
      logOutcome: null,
      detailNotes: null,
      followUpAt: null,
      opportunityId: null,
      leadId: "L1",
      linkedCallLogId: null,
      relatedOrphanedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    db.crmLead.findMany.mockResolvedValue([{ id: "L1", name: "ACME" } as never]);

    const { POST } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "Note",
        relatedKind: "Lead",
        relatedObjectId: "L1",
        subject: "S",
        outcome: "O",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.relatedKind).toBe("Lead");
    expect(body.data.relatedLabel).toBe("ACME");
  });

  it("creates a STANDALONE activity (relatedKind=None) with no related record", async () => {
    adminSession();
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      firstName: "Alice",
      lastName: "",
      email: "a@b.co",
    } as never);
    db.crmActivity.create.mockResolvedValue({
      id: "act-sa",
      orgId: "t1",
      type: "Note",
      relatedKind: "None",
      relatedObjectId: "standalone",
      subject: "",
      outcome: "",
      ownerId: "u1",
      ownerName: "Alice",
      externalId: null,
      sourceSystem: null,
      occurredAt: new Date(),
      outreach: null,
      activityCode: null,
      logOutcome: null,
      detailNotes: null,
      followUpAt: null,
      opportunityId: null,
      leadId: null,
      linkedCallLogId: null,
      relatedOrphanedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const { POST } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "Note", relatedKind: "None" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);

    // No related record is looked up for a standalone activity.
    expect(db.crmLead.findFirst).not.toHaveBeenCalled();
    expect(db.crmOpportunity.findFirst).not.toHaveBeenCalled();
    expect(db.crmContact.findFirst).not.toHaveBeenCalled();
    // The created row uses the standalone sentinel relatedKind/relatedObjectId.
    const createArg = db.crmActivity.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(createArg.relatedKind).toBe("None");
    expect(createArg.relatedObjectId).toBe("standalone");
    expect(createArg.leadId).toBeNull();
  });

  it("rejects a linked activity (Lead) with no relatedObjectId (400) — backward compat", async () => {
    adminSession();
    const { POST } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "Note", relatedKind: "Lead" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/activities (relink-aware Opportunity reads)", () => {
  beforeEach(async () => {
    db.crmActivity.findMany.mockReset();
    // The global setup's restoreAllMocks/clearAllMocks can strip the account-acl
    // factory mock's resolved value between tests; re-pin it (admin → unrestricted)
    // so buildActivityAclWhere resolves regardless of test order.
    const acl = await import("@/lib/auth/account-acl");
    (acl.getScope as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      unrestricted: true,
    });
    setSession(null);
  });

  it("includes the direct opportunityId FK in the OR-branch when relatedKind=Opportunity", async () => {
    adminSession();
    db.crmActivity.findMany.mockResolvedValue([] as never);
    const { GET } = await import("@/app/api/activities/route");
    const req = new Request(
      "http://test/api/activities?relatedKind=Opportunity&relatedObjectId=opp-1",
    );
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const findArg = db.crmActivity.findMany.mock.calls[0]?.[0] as {
      where: { AND: Array<Record<string, unknown>> };
    };
    const orBranch = findArg.where.AND.find((c) => Array.isArray(c.OR)) as
      | { OR: Array<Record<string, unknown>> }
      | undefined;
    expect(orBranch).toBeDefined();
    expect(orBranch!.OR).toContainEqual({ opportunityId: "opp-1" });
    expect(orBranch!.OR).toContainEqual({
      relatedKind: "Opportunity",
      relatedObjectId: "opp-1",
    });
  });

  it("does NOT add an opportunityId OR-clause for non-Opportunity reads (e.g. Contact)", async () => {
    adminSession();
    db.crmActivity.findMany.mockResolvedValue([] as never);
    const { GET } = await import("@/app/api/activities/route");
    const req = new Request(
      "http://test/api/activities?relatedKind=Contact&relatedObjectId=c-1",
    );
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const findArg = db.crmActivity.findMany.mock.calls[0]?.[0] as {
      where: { AND: Array<Record<string, unknown>> };
    };
    const orBranch = findArg.where.AND.find((c) => Array.isArray(c.OR)) as
      | { OR: Array<Record<string, unknown>> }
      | undefined;
    expect(orBranch).toBeDefined();
    expect(
      orBranch!.OR.some((cl) => "opportunityId" in cl),
    ).toBe(false);
  });

  it("preserves the leadId provenance read-path (GET ?leadId=oldLeadId still works)", async () => {
    adminSession();
    db.crmActivity.findMany.mockResolvedValue([] as never);
    const { GET } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities?leadId=lead-old");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const findArg = db.crmActivity.findMany.mock.calls[0]?.[0] as {
      where: { AND: Array<Record<string, unknown>> };
    };
    const orBranch = findArg.where.AND.find((c) => Array.isArray(c.OR)) as
      | { OR: Array<Record<string, unknown>> }
      | undefined;
    expect(orBranch).toBeDefined();
    expect(orBranch!.OR).toContainEqual({ leadId: "lead-old" });
  });

  it("excludes internal lead-creation init events (LeadSystem) from the JSON list", async () => {
    adminSession();
    db.crmActivity.findMany.mockResolvedValue([] as never);
    const { GET } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities?leadId=lead-1");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const findArg = db.crmActivity.findMany.mock.calls[0]?.[0] as {
      where: { AND: Array<Record<string, unknown>> };
    };
    expect(findArg.where.AND).toContainEqual({ NOT: { type: "LeadSystem" } });
  });
});
