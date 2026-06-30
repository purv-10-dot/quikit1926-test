/**
 * Lead change-log API — conversion entry enrichment.
 *
 * The conversion writes an audit row with action "lead_convert_relink" and the
 * created Account/Contact/Opportunity ids in `metadata`. The changelog API must
 * resolve those ids to names and return a `conversion` block so the UI can show
 * "Lead Converted → Account/Contact/Opportunity" without exposing raw ids or the
 * internal action name. Existing audit rows are never mutated.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

async function callChangelog(leadId = "lead-1") {
  const { GET } = await import("@/app/api/leads/[id]/changelog/route");
  const req = new Request(`http://test/api/leads/${leadId}/changelog`);
  return GET(req as unknown as import("next/server").NextRequest, {
    params: Promise.resolve({ id: leadId }),
  });
}

describe("GET /api/leads/[id]/changelog — conversion entry", () => {
  beforeEach(() => {
    db.crmLead.findUnique.mockReset();
    db.crmAuditLog.findMany.mockReset();
    db.crmAuditLog.count.mockReset();
    db.user.findMany.mockReset();
    db.crmAccount.findMany.mockReset();
    db.crmContact.findMany.mockReset();
    db.crmOpportunity.findMany.mockReset();
    db.user.findMany.mockResolvedValue([]);
    db.crmAccount.findMany.mockResolvedValue([]);
    db.crmContact.findMany.mockResolvedValue([]);
    db.crmOpportunity.findMany.mockResolvedValue([]);
    db.crmAuditLog.count.mockResolvedValue(1);
    setSession({ userId: "u1", orgId: "t1", role: "Administrator" });
  });

  it("resolves the conversion metadata ids to names and labels nothing internal", async () => {
    db.crmLead.findUnique.mockResolvedValue({ id: "lead-1", orgId: "t1", accountId: "acc-1" } as never);
    db.crmAuditLog.findMany.mockResolvedValue([
      {
        id: "a1",
        action: "lead_convert_relink",
        userId: "u1",
        resourceId: "lead-1",
        before: null,
        after: null,
        metadata: { toAccountId: "acc-1", toContactId: "c-1", toOpportunityId: "opp-1" },
        createdAt: new Date(),
      },
    ] as never);
    db.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Adarsh", lastName: "Jain", email: "a@x.co" },
    ] as never);
    db.crmAccount.findMany.mockResolvedValue([{ id: "acc-1", name: "ABC Pvt Ltd" }] as never);
    db.crmContact.findMany.mockResolvedValue([
      { id: "c-1", firstName: "John", lastName: "Doe", email: "j@x.co" },
    ] as never);
    db.crmOpportunity.findMany.mockResolvedValue([{ id: "opp-1", name: "ABC Deal" }] as never);

    const res = await callChangelog();
    expect(res.status).toBe(200);
    const body = await res.json();
    const entry = body.data.items[0];
    // The raw action is preserved in the data (UI maps it to "Lead Converted"),
    // and the resolved names are returned for display.
    expect(entry.action).toBe("lead_convert_relink");
    expect(entry.conversion).toEqual({
      accountName: "ABC Pvt Ltd",
      contactName: "John Doe",
      opportunityName: "ABC Deal",
    });
  });

  it("falls back to the lead's account for legacy rows missing toAccountId", async () => {
    db.crmLead.findUnique.mockResolvedValue({ id: "lead-1", orgId: "t1", accountId: "acc-legacy" } as never);
    db.crmAuditLog.findMany.mockResolvedValue([
      {
        id: "a1",
        action: "lead_convert_relink",
        userId: "u1",
        resourceId: "lead-1",
        before: null,
        after: null,
        metadata: { toContactId: "c-1", toOpportunityId: "opp-1" }, // no toAccountId
        createdAt: new Date(),
      },
    ] as never);
    db.crmAccount.findMany.mockResolvedValue([{ id: "acc-legacy", name: "Legacy Co" }] as never);
    db.crmContact.findMany.mockResolvedValue([
      { id: "c-1", firstName: "Jane", lastName: "Roe", email: "jr@x.co" },
    ] as never);
    db.crmOpportunity.findMany.mockResolvedValue([{ id: "opp-1", name: "Legacy Deal" }] as never);

    const res = await callChangelog();
    const body = await res.json();
    expect(body.data.items[0].conversion.accountName).toBe("Legacy Co");
  });

  it("returns conversion=null for ordinary UPDATE entries", async () => {
    db.crmLead.findUnique.mockResolvedValue({ id: "lead-1", orgId: "t1", accountId: null } as never);
    db.crmAuditLog.findMany.mockResolvedValue([
      {
        id: "a2",
        action: "UPDATE",
        userId: "u1",
        resourceId: "lead-1",
        before: { stage: "Contacted" },
        after: { stage: "Qualified" },
        metadata: null,
        createdAt: new Date(),
      },
    ] as never);

    const res = await callChangelog();
    const body = await res.json();
    const entry = body.data.items[0];
    expect(entry.action).toBe("UPDATE");
    expect(entry.conversion).toBeNull();
    expect(entry.fields).toContain("stage");
  });
});
