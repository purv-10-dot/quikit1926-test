import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";
import { assertModule } from "@/lib/auth/permissions";

const db = mockDb();

async function callPost(contactId: string, body: unknown) {
  const { POST } = await import("@/app/api/contacts/[id]/opportunities/route");
  const req = new Request(`http://test/api/contacts/${contactId}/opportunities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as import("next/server").NextRequest, {
    params: Promise.resolve({ id: contactId }),
  });
}

function futureIso(days = 30): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function pastIso(days = 1): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

describe("POST /api/contacts/[id]/opportunities", () => {
  beforeEach(() => {
    db.qcfContact.findFirst.mockReset();
    db.qcfOpportunity.create.mockReset();
    db.qcfActivity.create.mockReset();
    db.qcfAuditLog.create.mockReset();
    db.user.findUnique.mockReset();
    db.$transaction.mockReset();
    db.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") return (fn as (tx: typeof db) => unknown)(db);
      return undefined;
    });
    vi.mocked(assertModule).mockReset();
    vi.mocked(assertModule).mockResolvedValue(undefined);
    // Sensible defaults; tests override with mockResolvedValueOnce / mockRejectedValueOnce.
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      firstName: "Alice",
      lastName: "Doe",
    } as never);
    db.qcfActivity.create.mockResolvedValue({} as never);
    db.qcfAuditLog.create.mockResolvedValue({} as never);
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await callPost("c1", { title: "Test" });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user lacks opportunities:create permission", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    const forbidden = Object.assign(new Error("Forbidden"), { statusCode: 403 });
    vi.mocked(assertModule).mockRejectedValueOnce(forbidden);

    const res = await callPost("c1", { title: "Test" });
    expect(res.status).toBe(403);
  });

  it("returns 404 when contact doesn't exist or wrong tenant", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qcfContact.findFirst.mockResolvedValueOnce(null);

    const res = await callPost("c-missing", { title: "Test" });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/not found/i);
  });

  it("returns 400 with a clear message when contact.accountId is null", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qcfContact.findFirst.mockResolvedValueOnce({
      id: "c1",
      accountId: null,
    } as never);

    const res = await callPost("c1", { title: "Test" });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/must be linked to an Account/i);
    expect(db.qcfOpportunity.create).not.toHaveBeenCalled();
  });

  it("returns 400 when title is missing", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    const res = await callPost("c1", { amount: 100 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is whitespace-only", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    const res = await callPost("c1", { title: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 400 when amount is negative", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    const res = await callPost("c1", { title: "OK", amount: -50 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when closeDate is in the past", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    const res = await callPost("c1", { title: "OK", closeDate: pastIso(2) });
    expect(res.status).toBe(400);
  });

  it("creates a CrmOpportunity with correct fields and writes the audit row", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qcfContact.findFirst.mockResolvedValueOnce({
      id: "c1",
      accountId: "acc-1",
    } as never);
    db.qcfOpportunity.create.mockResolvedValueOnce({
      id: "opp-new",
      name: "Acme Deal",
      amount: 75000,
      stage: "Prospecting",
    } as never);

    const close = futureIso(45);
    const res = await callPost("c1", {
      title: "Acme Deal",
      amount: 75000,
      closeDate: close,
      stage: "Qualification",
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.opportunityId).toBe("opp-new");

    // Opportunity create call (via the service)
    const oppArg = db.qcfOpportunity.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(oppArg.orgId).toBe("t1");
    expect(oppArg.accountId).toBe("acc-1");
    expect(oppArg.leadId).toBeNull();
    expect(oppArg.name).toBe("Acme Deal");
    expect(oppArg.amount).toBe(75000);
    expect(oppArg.currency).toBe("INR");
    expect(oppArg.stage).toBe("Qualification");
    // Route computes probability from STAGE_DEFAULT_PROBABILITY[stage]; Qualification = 25.
    expect(oppArg.probability).toBe(25);
    expect(oppArg.closeDate).toBeInstanceOf(Date);
    expect(oppArg.ownerId).toBe("u1");
    expect(oppArg.ownerName).toBe("Alice Doe");

    // Audit log
    const auditArg = db.qcfAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(auditArg.orgId).toBe("t1");
    expect(auditArg.module).toBe("opportunities");
    expect(auditArg.action).toBe("create_from_contact");
    expect(auditArg.resourceId).toBe("opp-new");
    expect(auditArg.metadata).toEqual({
      fromContactId: "c1",
      title: "Acme Deal",
      amount: 75000,
      stage: "Prospecting",
    });
  });

  it("defaults stage to Prospecting when none is provided", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qcfContact.findFirst.mockResolvedValueOnce({
      id: "c1",
      accountId: "acc-1",
    } as never);
    db.qcfOpportunity.create.mockResolvedValueOnce({
      id: "opp-x",
      name: "X",
      amount: null,
      stage: "Prospecting",
    } as never);

    const res = await callPost("c1", { title: "X" });
    expect(res.status).toBe(201);
    const oppArg = db.qcfOpportunity.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(oppArg.stage).toBe("Prospecting");
  });
});
