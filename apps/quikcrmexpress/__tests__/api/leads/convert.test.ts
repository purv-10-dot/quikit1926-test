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
    db.qceLead.findFirst.mockReset();
    db.qceLead.update.mockReset();
    db.qceLead.updateMany.mockReset();
    // Default: the atomic idempotency claim succeeds (this request wins).
    // Tests that simulate a lost race override with { count: 0 }.
    db.qceLead.updateMany.mockResolvedValue({ count: 1 } as never);
    db.qceContact.create.mockReset();
    db.qceOpportunity.create.mockReset();
    db.qceAccount.findFirst.mockReset();
    db.qceAccount.create.mockReset();
    db.qceActivity.updateMany.mockReset();
    db.qceTask.updateMany.mockReset();
    db.qceNote.updateMany.mockReset();
    db.qceCallLog.updateMany.mockReset();
    db.qceAuditLog.create.mockReset();
    // Safe defaults so legacy tests don't have to know about the relink path.
    // Tests that pin specific counts override these via mockResolvedValueOnce.
    db.qceActivity.updateMany.mockResolvedValue({ count: 0 } as never);
    db.qceTask.updateMany.mockResolvedValue({ count: 0 } as never);
    db.qceNote.updateMany.mockResolvedValue({ count: 0 } as never);
    db.qceCallLog.updateMany.mockResolvedValue({ count: 0 } as never);
    db.qceAuditLog.create.mockResolvedValue({} as never);
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
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead1",
      orgId: "t1",
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
    db.qceAccount.findFirst.mockResolvedValueOnce(null);
    db.qceAccount.create.mockResolvedValueOnce({ id: "acc-new" } as never);
    db.qceContact.create.mockResolvedValueOnce({ id: "c1" } as never);
    db.qceLead.update.mockResolvedValueOnce({ id: "lead1" } as never);

    const res = await callConvert("lead1", { createContact: true, createOpportunity: false });
    expect(res.status).toBe(200);

    const contactCreateArg = db.qceContact.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(contactCreateArg.title).toBe("VP of Sales");
    expect(contactCreateArg.ownerId).toBe("u-owner");
    expect(contactCreateArg.ownerName).toBe("Alok Shukla");
    expect(contactCreateArg.firstName).toBe("Rohit");
    expect(contactCreateArg.lastName).toBe("Sharma");
  });

  it("auto-creates an account from lead.company when accountId is null and links the contact to it", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead2",
      orgId: "t1",
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
    db.qceAccount.findFirst.mockResolvedValueOnce(null);
    db.qceAccount.create.mockResolvedValueOnce({ id: "acc-new" } as never);
    db.qceContact.create.mockResolvedValueOnce({ id: "c2" } as never);
    db.qceLead.update.mockResolvedValueOnce({ id: "lead2" } as never);

    const res = await callConvert("lead2", { createContact: true });
    expect(res.status).toBe(200);

    expect(db.qceAccount.create).toHaveBeenCalledTimes(1);
    const accountCreateArg = db.qceAccount.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(accountCreateArg.name).toBe("Acme Corp");
    expect(accountCreateArg.orgId).toBe("t1");
    expect(accountCreateArg.ownerId).toBe("u-owner");

    const contactCreateArg = db.qceContact.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(contactCreateArg.accountId).toBe("acc-new");

    const leadUpdateArg = db.qceLead.update.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(leadUpdateArg.accountId).toBe("acc-new");
    expect(leadUpdateArg.linkedContactId).toBe("c2");
    expect(leadUpdateArg.status).toBe("Converted");
  });

  it("reuses an existing account by name (case-sensitive match) instead of creating a new one", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead3",
      orgId: "t1",
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
    db.qceAccount.findFirst.mockResolvedValueOnce({ id: "acc-existing" } as never);
    db.qceContact.create.mockResolvedValueOnce({ id: "c3" } as never);
    db.qceLead.update.mockResolvedValueOnce({ id: "lead3" } as never);

    const res = await callConvert("lead3", { createContact: true });
    expect(res.status).toBe(200);

    expect(db.qceAccount.create).not.toHaveBeenCalled();
    const contactCreateArg = db.qceContact.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(contactCreateArg.accountId).toBe("acc-existing");
  });

  // B2C convert (launch item 13): a company-less lead must still roll up to an
  // account — synthesized from the individual's name — not produce a silent
  // account-less Contact.
  it("synthesizes a personal account from lead.name when company is blank (B2C convert)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead-b2c",
      orgId: "t1",
      name: "Individual Person",
      email: "ip@x.com",
      phone: null,
      mobile: "+9199",
      jobTitle: null,
      company: null,
      industry: null,
      source: null,
      ownerId: "u-owner",
      ownerName: "Owner",
      accountId: null,
      status: "Open",
      linkedContactId: null,
    } as never);
    db.qceAccount.findFirst.mockResolvedValueOnce(null);
    db.qceAccount.create.mockResolvedValueOnce({ id: "acc-personal" } as never);
    db.qceContact.create.mockResolvedValueOnce({ id: "c-b2c" } as never);
    db.qceLead.update.mockResolvedValueOnce({ id: "lead-b2c" } as never);

    const res = await callConvert("lead-b2c", { createContact: true });
    expect(res.status).toBe(200);

    expect(db.qceAccount.create).toHaveBeenCalledTimes(1);
    const accArg = db.qceAccount.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(accArg.name).toBe("Individual Person");
    const contactArg = db.qceContact.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(contactArg.accountId).toBe("acc-personal");
  });

  it("returns 409 when the lead is already converted (linkedContactId is set)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead4",
      orgId: "t1",
      name: "Already Converted",
      linkedContactId: "c-existing",
      accountId: null,
    } as never);

    const res = await callConvert("lead4", { createContact: true });
    expect(res.status).toBe(409);
    expect(db.qceContact.create).not.toHaveBeenCalled();
  });

  // Idempotency regression (launch item 7): account-only converts never set
  // linkedContactId, so the fast-path must also reject on status === "Converted".
  it("returns 409 on an account-only re-convert (status already Converted, no linkedContactId)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead-reconv",
      orgId: "t1",
      name: "Re Convert",
      status: "Converted",
      linkedContactId: null,
      accountId: "acc-prev",
    } as never);

    const res = await callConvert("lead-reconv", { createContact: false });
    expect(res.status).toBe(409);
    expect(db.qceAccount.create).not.toHaveBeenCalled();
    expect(db.qceLead.update).not.toHaveBeenCalled();
  });

  // Simulates a lost double-submit race: the lead read as not-yet-converted, but
  // the atomic claim matches 0 rows because a concurrent request already won it.
  it("returns 409 when the atomic claim is lost (concurrent double-submit)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead-race",
      orgId: "t1",
      name: "Race Lead",
      status: "Open",
      company: "Race Co",
      accountId: null,
      linkedContactId: null,
    } as never);
    db.qceLead.updateMany.mockResolvedValueOnce({ count: 0 } as never);

    const res = await callConvert("lead-race", { createContact: true });
    expect(res.status).toBe(409);
    // The transaction returned early — no Account/Contact/Lead writes happened.
    expect(db.qceAccount.create).not.toHaveBeenCalled();
    expect(db.qceContact.create).not.toHaveBeenCalled();
    expect(db.qceLead.update).not.toHaveBeenCalled();
  });

  it("re-keys activities/tasks/notes to Contact and populates opportunityId on activities (full convert)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead-full",
      orgId: "t1",
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
    db.qceContact.create.mockResolvedValueOnce({ id: "c-new" } as never);
    db.qceOpportunity.create.mockResolvedValueOnce({ id: "opp-new" } as never);
    db.qceActivity.updateMany.mockResolvedValueOnce({ count: 5 } as never);
    db.qceTask.updateMany.mockResolvedValueOnce({ count: 2 } as never);
    db.qceNote.updateMany.mockResolvedValueOnce({ count: 1 } as never);
    db.qceCallLog.updateMany.mockResolvedValueOnce({ count: 3 } as never);
    db.qceAuditLog.create.mockResolvedValueOnce({} as never);
    db.qceLead.update.mockResolvedValueOnce({ id: "lead-full" } as never);

    const res = await callConvert("lead-full", {
      createContact: true,
      createOpportunity: true,
    });
    expect(res.status).toBe(200);

    const actArg = db.qceActivity.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(actArg.where).toEqual({ orgId: "t1", leadId: "lead-full" });
    expect(actArg.data).toEqual({
      relatedKind: "Contact",
      relatedObjectId: "c-new",
      opportunityId: "opp-new",
    });

    const taskArg = db.qceTask.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(taskArg.where).toEqual({ orgId: "t1", leadId: "lead-full" });
    expect(taskArg.data).toEqual({ relatedKind: "Contact", relatedObjectId: "c-new" });

    const noteArg = db.qceNote.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(noteArg.where).toEqual({ orgId: "t1", leadId: "lead-full" });
    expect(noteArg.data).toEqual({ relatedKind: "Contact", relatedObjectId: "c-new" });

    const callArg = db.qceCallLog.updateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(callArg.where).toEqual({ orgId: "t1", leadId: "lead-full" });
    expect(callArg.data).toEqual({ linkedContactId: "c-new" });

    const auditArg = db.qceAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(auditArg.module).toBe("leads");
    expect(auditArg.action).toBe("lead_convert_relink");
    expect(auditArg.resourceId).toBe("lead-full");
    expect(auditArg.orgId).toBe("t1");
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
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead-c-only",
      orgId: "t1",
      name: "C Only",
      jobTitle: null,
      company: null,
      accountId: "acc-1",
      linkedContactId: null,
    } as never);
    db.qceContact.create.mockResolvedValueOnce({ id: "c-only" } as never);
    db.qceActivity.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    db.qceTask.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    db.qceNote.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    db.qceCallLog.updateMany.mockResolvedValueOnce({ count: 0 } as never);
    db.qceAuditLog.create.mockResolvedValueOnce({} as never);
    db.qceLead.update.mockResolvedValueOnce({ id: "lead-c-only" } as never);

    const res = await callConvert("lead-c-only", {
      createContact: true,
      createOpportunity: false,
    });
    expect(res.status).toBe(200);

    const actData = db.qceActivity.updateMany.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(actData).toEqual({ relatedKind: "Contact", relatedObjectId: "c-only" });
    expect(actData.opportunityId).toBeUndefined();

    const auditArg = db.qceAuditLog.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect((auditArg.metadata as Record<string, unknown>).toOpportunityId).toBeNull();
  });

  it("does NOT re-key anything when createContact is false (Account-only convert)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead-acc-only",
      orgId: "t1",
      name: "Acc Only",
      company: "Some Co",
      accountId: null,
      linkedContactId: null,
    } as never);
    db.qceAccount.findFirst.mockResolvedValueOnce(null);
    db.qceAccount.create.mockResolvedValueOnce({ id: "acc-x" } as never);
    db.qceLead.update.mockResolvedValueOnce({ id: "lead-acc-only" } as never);

    const res = await callConvert("lead-acc-only", {
      createContact: false,
      createOpportunity: false,
    });
    expect(res.status).toBe(200);
    expect(db.qceActivity.updateMany).not.toHaveBeenCalled();
    expect(db.qceTask.updateMany).not.toHaveBeenCalled();
    expect(db.qceNote.updateMany).not.toHaveBeenCalled();
    expect(db.qceCallLog.updateMany).not.toHaveBeenCalled();
    expect(db.qceAuditLog.create).not.toHaveBeenCalled();
  });

  it("returns 400 when createOpportunity=true and createContact=false (Zod refinement)", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    const res = await callConvert("lead-x", {
      createContact: false,
      createOpportunity: true,
    });
    expect(res.status).toBe(400);
    expect(db.qceLead.findFirst).not.toHaveBeenCalled();
  });

  it("threads opportunityCloseDate through to CrmOpportunity.create", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    db.qceLead.findFirst.mockResolvedValueOnce({
      id: "lead-cd",
      orgId: "t1",
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
    db.qceContact.create.mockResolvedValueOnce({ id: "c-cd" } as never);
    db.qceOpportunity.create.mockResolvedValueOnce({ id: "opp-cd" } as never);
    db.qceLead.update.mockResolvedValueOnce({ id: "lead-cd" } as never);

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

    const oppArg = db.qceOpportunity.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(oppArg.name).toBe("Big Deal");
    expect(oppArg.amount).toBe(50000);
    expect(oppArg.closeDate).toBeInstanceOf(Date);
    expect((oppArg.closeDate as Date).toISOString()).toBe(futureIso);
  });

  it("returns 400 when opportunityCloseDate is in the past", async () => {
    setSession({ userId: "u1", orgId: "t1", role: "SalesUser" });
    const past = new Date();
    past.setDate(past.getDate() - 1);
    const res = await callConvert("lead-past", {
      createContact: true,
      createOpportunity: true,
      opportunityTitle: "Stale",
      opportunityCloseDate: past.toISOString(),
    });
    expect(res.status).toBe(400);
    expect(db.qceLead.findFirst).not.toHaveBeenCalled();
  });
});
