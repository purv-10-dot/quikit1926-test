import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

async function callConvert(leadId: string, body: unknown) {
  const { POST } = await import("@/app/api/leads/[id]/convert/route");
  const req = new Request(`http://test/api/leads/${leadId}/convert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return POST(req as unknown as import("next/server").NextRequest, {
    params: Promise.resolve({ id: leadId }),
  });
}

describe("POST /api/leads/[id]/convert", () => {
  beforeEach(() => {
    db.crmLead.findFirst.mockReset();
    db.crmLead.update.mockReset();
    db.crmContact.create.mockReset();
    db.crmOpportunity.create.mockReset();
    db.crmAccount.findFirst.mockReset();
    db.crmAccount.create.mockReset();
    db.crmActivity.updateMany.mockReset();
    db.crmTask.updateMany.mockReset();
    db.crmNote.updateMany.mockReset();
    db.crmCallLog.updateMany.mockReset();
    db.crmAuditLog.create.mockReset();
    // Safe defaults so legacy tests don't have to know about the relink path.
    // Tests that pin specific counts override these via mockResolvedValueOnce.
    db.crmActivity.updateMany.mockResolvedValue({ count: 0 } as never);
    db.crmTask.updateMany.mockResolvedValue({ count: 0 } as never);
    db.crmNote.updateMany.mockResolvedValue({ count: 0 } as never);
    db.crmCallLog.updateMany.mockResolvedValue({ count: 0 } as never);
    db.crmAuditLog.create.mockResolvedValue({} as never);
    db.$transaction.mockReset();
    db.$transaction.mockImplementation(async (fn: unknown) => {
      if (typeof fn === "function") return (fn as (tx: typeof db) => unknown)(db);
      return undefined;
    });
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await callConvert("lead1", { createContact: true });
    expect(res.status).toBe(401);
  });

  it("creates contact with title (jobTitle), ownerId, ownerName from lead", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    db.crmLead.findFirst.mockResolvedValueOnce({
      id: "lead1",
      tenantId: "t1",
      name: "Rohit Sharma",
      email: "rohit@x.com",
      phone: "+919999",
      mobile: null,
      jobTitle: "VP of Sales",
      company: "Acme Corp",
      industry: "SaaS",
      source: "LinkedIn Outreach",
      ownerId: "u-owner",
      ownerName: "Alok Shukla",
      accountId: null,
      linkedContactId: null,
    } as never);
    db.crmAccount.findFirst.mockResolvedValueOnce(null);
    db.crmAccount.create.mockResolvedValueOnce({ id: "acc-new" } as never);
    db.crmContact.create.mockResolvedValueOnce({ id: "c1" } as never);
    db.crmLead.update.mockResolvedValueOnce({ id: "lead1" } as never);

    const res = await callConvert("lead1", { createContact: true, createOpportunity: false });
    expect(res.status).toBe(200);

    const contactCreateArg = db.crmContact.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(contactCreateArg.title).toBe("VP of Sales");
    expect(contactCreateArg.ownerId).toBe("u-owner");
    expect(contactCreateArg.ownerName).toBe("Alok Shukla");
    expect(contactCreateArg.firstName).toBe("Rohit");
    expect(contactCreateArg.lastName).toBe("Sharma");
  });

  it("auto-creates an account from lead.company when accountId is null and links the contact to it", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    db.crmLead.findFirst.mockResolvedValueOnce({
      id: "lead2",
      tenantId: "t1",
      name: "Jane Doe",
      email: null,
      phone: null,
      mobile: null,
      jobTitle: "CTO",
      company: "Acme Corp",
      industry: "SaaS",
      source: null,
      ownerId: "u-owner",
      ownerName: "Alok",
      accountId: null,
      linkedContactId: null,
    } as never);
    db.crmAccount.findFirst.mockResolvedValueOnce(null);
    db.crmAccount.create.mockResolvedValueOnce({ id: "acc-new" } as never);
    db.crmContact.create.mockResolvedValueOnce({ id: "c2" } as never);
    db.crmLead.update.mockResolvedValueOnce({ id: "lead2" } as never);

    const res = await callConvert("lead2", { createContact: true });
    expect(res.status).toBe(200);

    expect(db.crmAccount.create).toHaveBeenCalledTimes(1);
    const accountCreateArg = db.crmAccount.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(accountCreateArg.name).toBe("Acme Corp");
    expect(accountCreateArg.tenantId).toBe("t1");
    expect(accountCreateArg.ownerId).toBe("u-owner");

    const contactCreateArg = db.crmContact.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(contactCreateArg.accountId).toBe("acc-new");

    const leadUpdateArg = db.crmLead.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(leadUpdateArg.accountId).toBe("acc-new");
    expect(leadUpdateArg.linkedContactId).toBe("c2");
    expect(leadUpdateArg.status).toBe("Converted");
  });

  it("reuses an existing account by name (case-sensitive match) instead of creating a new one", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    db.crmLead.findFirst.mockResolvedValueOnce({
      id: "lead3",
      tenantId: "t1",
      name: "Bob",
      email: null,
      phone: null,
      mobile: null,
      jobTitle: null,
      company: "  Acme Corp  ",
      industry: null,
      source: null,
      ownerId: null,
      ownerName: null,
      accountId: null,
      linkedContactId: null,
    } as never);
    db.crmAccount.findFirst.mockResolvedValueOnce({ id: "acc-existing" } as never);
    db.crmContact.create.mockResolvedValueOnce({ id: "c3" } as never);
    db.crmLead.update.mockResolvedValueOnce({ id: "lead3" } as never);

    const res = await callConvert("lead3", { createContact: true });
    expect(res.status).toBe(200);

    expect(db.crmAccount.create).not.toHaveBeenCalled();
    const contactCreateArg = db.crmContact.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(contactCreateArg.accountId).toBe("acc-existing");
  });

  it("returns 409 when the lead is already converted (linkedContactId is set)", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    db.crmLead.findFirst.mockResolvedValueOnce({
      id: "lead4",
      tenantId: "t1",
      name: "Already Converted",
      linkedContactId: "c-existing",
      accountId: null,
    } as never);

    const res = await callConvert("lead4", { createContact: true });
    expect(res.status).toBe(409);
    expect(db.crmContact.create).not.toHaveBeenCalled();
  });

  it("re-keys activities/tasks/notes to Contact and populates opportunityId on activities (full convert)", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    db.crmLead.findFirst.mockResolvedValueOnce({
      id: "lead-full",
      tenantId: "t1",
      name: "Full Convert",
      email: "fc@x.com",
      phone: "+9199",
      mobile: null,
      jobTitle: "CEO",
      company: "Co",
      industry: null,
      source: null,
      ownerId: "u-o",
      ownerName: "O",
      accountId: "acc-1",
      linkedContactId: null,
    } as never);
    db.crmContact.create.mockResolvedValueOnce({ id: "c-new" } as never);
    db.crmOpportunity.create.mockResolvedValueOnce({ id: "opp-new" } as never);
    db.crmActivity.updateMany.mockResolvedValueOnce({ count: 5 } as never);
    db.crmTask.updateMany.mockResolvedValueOnce({ count: 2 } as never);
    db.crmNote.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    db.crmCallLog.updateMany.mockResolvedValueOnce({ count: 3 } as never);
    db.crmAuditLog.create.mockResolvedValueOnce({} as never);
    db.crmLead.update.mockResolvedValueOnce({ id: "lead-full" } as never);

    const res = await callConvert("lead-full", {
      createContact: true,
      createOpportunity: true,
    });
    expect(res.status).toBe(200);

    const actArg = db.crmActivity.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(actArg.where).toEqual({ tenantId: "t1", leadId: "lead-full" });
    expect(actArg.data).toEqual({
      relatedKind: "Contact",
      relatedObjectId: "c-new",
      opportunityId: "opp-new",
    });

    const taskArg = db.crmTask.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(taskArg.where).toEqual({ tenantId: "t1", leadId: "lead-full" });
    expect(taskArg.data).toEqual({ relatedKind: "Contact", relatedObjectId: "c-new" });

    const noteArg = db.crmNote.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(noteArg.where).toEqual({ tenantId: "t1", leadId: "lead-full" });
    expect(noteArg.data).toEqual({ relatedKind: "Contact", relatedObjectId: "c-new" });

    const callArg = db.crmCallLog.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(callArg.where).toEqual({ tenantId: "t1", leadId: "lead-full" });
    expect(callArg.data).toEqual({ linkedContactId: "c-new" });

    const auditArg = db.crmAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(auditArg.module).toBe("leads");
    expect(auditArg.action).toBe("lead_convert_relink");
    expect(auditArg.resourceId).toBe("lead-full");
    expect(auditArg.tenantId).toBe("t1");
    expect(auditArg.metadata).toEqual({
      fromLeadId: "lead-full",
      toContactId: "c-new",
      toOpportunityId: "opp-new",
      activitiesRelinked: 5,
      tasksRelinked: 2,
      notesRelinked: 1,
      callsRelinked: 3,
    });
  });

  it("re-keys to Contact but does NOT populate activity.opportunityId when no Opp is created", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    db.crmLead.findFirst.mockResolvedValueOnce({
      id: "lead-c-only",
      tenantId: "t1",
      name: "C Only",
      jobTitle: null,
      company: null,
      accountId: "acc-1",
      linkedContactId: null,
    } as never);
    db.crmContact.create.mockResolvedValueOnce({ id: "c-only" } as never);
    db.crmActivity.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    db.crmTask.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    db.crmNote.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    db.crmCallLog.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    db.crmAuditLog.create.mockResolvedValueOnce({} as never);
    db.crmLead.update.mockResolvedValueOnce({ id: "lead-c-only" } as never);

    const res = await callConvert("lead-c-only", {
      createContact: true,
      createOpportunity: false,
    });
    expect(res.status).toBe(200);

    const actData = db.crmActivity.updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(actData).toEqual({ relatedKind: "Contact", relatedObjectId: "c-only" });
    expect(actData.opportunityId).toBeUndefined();

    const auditArg = db.crmAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect((auditArg.metadata as Record<string, unknown>).toOpportunityId).toBeNull();
  });

  it("does NOT re-key anything when createContact is false (Account-only convert)", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    db.crmLead.findFirst.mockResolvedValueOnce({
      id: "lead-acc-only",
      tenantId: "t1",
      name: "Acc Only",
      company: "Some Co",
      accountId: null,
      linkedContactId: null,
    } as never);
    db.crmAccount.findFirst.mockResolvedValueOnce(null);
    db.crmAccount.create.mockResolvedValueOnce({ id: "acc-x" } as never);
    db.crmLead.update.mockResolvedValueOnce({ id: "lead-acc-only" } as never);

    const res = await callConvert("lead-acc-only", {
      createContact: false,
      createOpportunity: false,
    });
    expect(res.status).toBe(200);
    expect(db.crmActivity.updateMany).not.toHaveBeenCalled();
    expect(db.crmTask.updateMany).not.toHaveBeenCalled();
    expect(db.crmNote.updateMany).not.toHaveBeenCalled();
    expect(db.crmCallLog.updateMany).not.toHaveBeenCalled();
    expect(db.crmAuditLog.create).not.toHaveBeenCalled();
  });

  it("returns 400 when createOpportunity=true and createContact=false (Zod refinement)", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    const res = await callConvert("lead-x", {
      createContact: false,
      createOpportunity: true,
    });
    expect(res.status).toBe(400);
    expect(db.crmLead.findFirst).not.toHaveBeenCalled();
  });

  it("threads opportunityCloseDate through to CrmOpportunity.create", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    db.crmLead.findFirst.mockResolvedValueOnce({
      id: "lead-cd",
      tenantId: "t1",
      name: "CloseDate Test",
      email: null,
      phone: null,
      mobile: null,
      jobTitle: null,
      company: "ACo",
      industry: null,
      source: null,
      ownerId: "u-o",
      ownerName: "O",
      accountId: "acc-1",
      linkedContactId: null,
    } as never);
    db.crmContact.create.mockResolvedValueOnce({ id: "c-cd" } as never);
    db.crmOpportunity.create.mockResolvedValueOnce({ id: "opp-cd" } as never);
    db.crmLead.update.mockResolvedValueOnce({ id: "lead-cd" } as never);

    // 10 days in the future — guarantees today-or-future passes regardless of test clock.
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const futureIso = future.toISOString();

    const res = await callConvert("lead-cd", {
      createContact: true,
      createOpportunity: true,
      opportunityTitle: "Big Deal",
      opportunityAmount: 50000,
      opportunityCloseDate: futureIso,
    });
    expect(res.status).toBe(200);

    const oppArg = db.crmOpportunity.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(oppArg.name).toBe("Big Deal");
    expect(oppArg.amount).toBe(50000);
    expect(oppArg.closeDate).toBeInstanceOf(Date);
    expect((oppArg.closeDate as Date).toISOString()).toBe(futureIso);
  });

  it("returns 400 when opportunityCloseDate is in the past", async () => {
    setSession({ userId: "u1", tenantId: "t1", role: "SalesUser" });
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const res = await callConvert("lead-past", {
      createContact: true,
      createOpportunity: true,
      opportunityTitle: "Stale",
      opportunityCloseDate: past.toISOString(),
    });
    expect(res.status).toBe(400);
    expect(db.crmLead.findFirst).not.toHaveBeenCalled();
  });
});
