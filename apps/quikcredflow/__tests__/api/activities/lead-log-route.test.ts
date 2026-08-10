import { describe, expect, it, beforeEach, vi } from "vitest";
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

describe("POST /api/activities/lead-log", () => {
  beforeEach(() => {
    db.qcfLead.findFirst.mockReset();
    db.qcfActivity.create.mockReset();
    db.qcfActivity.upsert.mockReset();
    db.user.findUnique.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/activities/lead-log/route");
    const req = new Request("http://test/api/activities/lead-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("rejects invalid activityCode", async () => {
    adminSession();
    const { POST } = await import("@/app/api/activities/lead-log/route");
    const req = new Request("http://test/api/activities/lead-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "L1",
        activityCode: "ZZZ. Not Real",
        logOutcome: "Follow-Up",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("creates an activity for a valid lead-log payload", async () => {
    adminSession();
    db.qcfLead.findFirst.mockResolvedValue({ id: "L1", accountId: null } as never);
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      firstName: "Alice",
      lastName: "Doe",
      email: "a@b.co",
    } as never);
    const created = {
      id: "act1",
      orgId: "t1",
      type: "01. Call Conversation",
      relatedKind: "Lead",
      relatedObjectId: "L1",
      subject: "01. Call Conversation",
      outcome: "Follow-Up",
      ownerId: "u1",
      ownerName: "Alice Doe",
      externalId: null,
      sourceSystem: null,
      occurredAt: new Date(),
      outreach: null,
      activityCode: "01. Call Conversation",
      logOutcome: "Follow-Up",
      detailNotes: null,
      followUpAt: null,
      opportunityId: null,
      leadId: "L1",
      linkedCallLogId: null,
      relatedOrphanedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    db.qcfActivity.create.mockResolvedValue(created as never);
    db.qcfLead.findMany.mockResolvedValue([{ id: "L1", name: "ACME Lead" } as never]);

    const { POST } = await import("@/app/api/activities/lead-log/route");
    const req = new Request("http://test/api/activities/lead-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "L1",
        activityCode: "01. Call Conversation",
        logOutcome: "Follow-Up",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.relatedKind).toBe("Lead");
    expect(body.data.outcome).toBe("Follow-Up");
  });

  it("returns 404 when lead is missing", async () => {
    adminSession();
    db.qcfLead.findFirst.mockResolvedValue(null);
    const { POST } = await import("@/app/api/activities/lead-log/route");
    const req = new Request("http://test/api/activities/lead-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "missing",
        activityCode: "01. Call Conversation",
        logOutcome: "Follow-Up",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(404);
  });
});
