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

describe("POST /api/activities/smb-outreach", () => {
  beforeEach(() => {
    db.crmLead.findFirst.mockReset();
    db.crmLead.update.mockReset();
    db.crmActivity.create.mockReset();
    db.user.findUnique.mockReset();
    db.$transaction.mockReset();
    setSession(null);
  });

  it("rejects an invalid disposition chain (400)", async () => {
    adminSession();
    db.crmLead.findFirst.mockResolvedValue({ id: "L1", accountId: null } as never);
    const { POST } = await import("@/app/api/activities/smb-outreach/route");
    const req = new Request("http://test/api/activities/smb-outreach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "L1",
        country: "India",
        followupPriority: "P1",
        channel: "Phone",
        competitor: "No Software",
        disposition: "Interested",
        subDisposition: "Bogus",
        subSubDisposition: "Nope",
        detailNotes: "x",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("logs activity AND patches the parent lead's country + followupPriority", async () => {
    adminSession();
    db.crmLead.findFirst.mockResolvedValue({ id: "L1", accountId: null } as never);
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      firstName: "Alice",
      lastName: "",
      email: "a@b.co",
    } as never);

    // Capture the inner transactional calls.
    const createMock = db.crmActivity.create;
    const updateMock = db.crmLead.update;
    db.$transaction.mockImplementation(async (fn: unknown) => {
      // For tx-callback form, invoke with the same mocked client.
      if (typeof fn === "function") {
        return (fn as (tx: typeof db) => unknown)(db);
      }
      // For array form (unused here), just resolve.
      return [];
    });
    db.crmActivity.create.mockResolvedValue({
      id: "act1",
      orgId: "t1",
      type: "SMB Outreach",
      relatedKind: "Lead",
      relatedObjectId: "L1",
      subject: "SMB Outreach",
      outcome: "Phone · Interested · Follow Up Required",
      ownerId: "u1",
      ownerName: "Alice",
      externalId: null,
      sourceSystem: null,
      occurredAt: new Date(),
      outreach: {},
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
    db.crmLead.update.mockResolvedValue({} as never);
    db.crmLead.findMany.mockResolvedValue([{ id: "L1", name: "ACME" } as never]);

    const { POST } = await import("@/app/api/activities/smb-outreach/route");
    const req = new Request("http://test/api/activities/smb-outreach", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        leadId: "L1",
        country: "India",
        followupPriority: "P1",
        channel: "Phone",
        competitor: "No Software",
        disposition: "Interested",
        subDisposition: "Follow Up Required",
        subSubDisposition: "Product Demo",
        detailNotes: "demo set up",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0]![0]!.data).toMatchObject({
      country: "India",
      followupPriority: "P1",
    });
  });
});
