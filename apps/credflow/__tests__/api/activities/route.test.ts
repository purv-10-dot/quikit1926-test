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
    db.qcfLead.findFirst.mockReset();
    db.qcfActivity.create.mockReset();
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
    db.qcfLead.findFirst.mockResolvedValue(null);
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
    db.qcfLead.findFirst.mockResolvedValue({ id: "L1", accountId: null } as never);
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      firstName: "Alice",
      lastName: "",
      email: "a@b.co",
    } as never);
    db.qcfActivity.create.mockResolvedValue({
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
    db.qcfLead.findMany.mockResolvedValue([{ id: "L1", name: "ACME" } as never]);

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
});

describe("GET /api/activities (relink-aware Opportunity reads)", () => {
  beforeEach(() => {
    db.qcfActivity.findMany.mockReset();
    setSession(null);
  });

  it("includes the direct opportunityId FK in the OR-branch when relatedKind=Opportunity", async () => {
    adminSession();
    db.qcfActivity.findMany.mockResolvedValue([] as never);
    const { GET } = await import("@/app/api/activities/route");
    const req = new Request(
      "http://test/api/activities?relatedKind=Opportunity&relatedObjectId=opp-1",
    );
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const findArg = db.qcfActivity.findMany.mock.calls[0]?.[0] as {
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
    db.qcfActivity.findMany.mockResolvedValue([] as never);
    const { GET } = await import("@/app/api/activities/route");
    const req = new Request(
      "http://test/api/activities?relatedKind=Contact&relatedObjectId=c-1",
    );
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const findArg = db.qcfActivity.findMany.mock.calls[0]?.[0] as {
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
    db.qcfActivity.findMany.mockResolvedValue([] as never);
    const { GET } = await import("@/app/api/activities/route");
    const req = new Request("http://test/api/activities?leadId=lead-old");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);

    const findArg = db.qcfActivity.findMany.mock.calls[0]?.[0] as {
      where: { AND: Array<Record<string, unknown>> };
    };
    const orBranch = findArg.where.AND.find((c) => Array.isArray(c.OR)) as
      | { OR: Array<Record<string, unknown>> }
      | undefined;
    expect(orBranch).toBeDefined();
    expect(orBranch!.OR).toContainEqual({ leadId: "lead-old" });
  });
});
