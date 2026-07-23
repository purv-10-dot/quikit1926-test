/**
 * Tests for record matching + thread scope roll-up (P2 req 4/5).
 * Lead/Contact are the addressable owners; Account/Opportunity surface their
 * linked people's threads via resolveThreadScope.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import {
  matchRecordByEmail,
  matchRecordByAnyAddress,
  resolveThreadScope,
} from "@/lib/services/email/record-emails";

const db = mockDb();

beforeEach(() => {
  db.crmLead.findFirst.mockReset();
  db.crmContact.findFirst.mockReset();
  db.crmOpportunity.findFirst.mockReset();
  db.crmContact.findMany.mockReset();
  db.crmLead.findMany.mockReset();
});

describe("matchRecordByEmail", () => {
  it("matches a Lead by email (highest precedence) and rolls up its account+opp", async () => {
    db.crmLead.findFirst.mockResolvedValue({ id: "lead1", accountId: "acc1" });
    db.crmOpportunity.findFirst.mockResolvedValue({ id: "opp1" });
    const r = await matchRecordByEmail("org1", "Customer@Acme.com");
    expect(r).toMatchObject({ kind: "Lead", id: "lead1", accountId: "acc1", opportunityId: "opp1" });
    // Normalized (lowercased) value, matched case-INSENSITIVELY against the
    // stored column (which may be mixed-case), on both email + secondaryEmail.
    expect(db.crmLead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgId: "org1",
          OR: [
            { email: { equals: "customer@acme.com", mode: "insensitive" } },
            { secondaryEmail: { equals: "customer@acme.com", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });

  it("matches a Lead whose stored email is MIXED-CASE (the Kanishka bug)", async () => {
    // Stored email "Kanishka.Jedhe@moreyeahs.com"; inbound reply address is
    // lowercase. Before the fix this missed (Postgres = is case-sensitive).
    db.crmLead.findFirst.mockResolvedValue({ id: "leadK", accountId: null });
    const r = await matchRecordByEmail("org1", "kanishka.jedhe@moreyeahs.com");
    expect(r).toMatchObject({ kind: "Lead", id: "leadK" });
    const where = db.crmLead.findFirst.mock.calls[0][0].where;
    expect(where.OR[0].email.mode).toBe("insensitive");
  });

  it("falls to Contact when no Lead matches", async () => {
    db.crmLead.findFirst.mockResolvedValue(null);
    db.crmContact.findFirst.mockResolvedValue({ id: "c1", accountId: null });
    const r = await matchRecordByEmail("org1", "c@acme.com");
    expect(r).toMatchObject({ kind: "Contact", id: "c1", accountId: null, opportunityId: null });
  });

  it("returns null for an unknown address (skip non-CRM mail)", async () => {
    db.crmLead.findFirst.mockResolvedValue(null);
    db.crmContact.findFirst.mockResolvedValue(null);
    expect(await matchRecordByEmail("org1", "stranger@nowhere.com")).toBeNull();
  });

  it("returns null for empty input", async () => {
    expect(await matchRecordByEmail("org1", "  ")).toBeNull();
  });
});

describe("matchRecordByAnyAddress", () => {
  it("skips the mailbox's own address and matches a counterparty", async () => {
    db.crmLead.findFirst.mockImplementation(({ where }: any) => {
      const target = where.OR?.[0]?.email?.equals; // case-insensitive clause shape
      return Promise.resolve(target === "customer@acme.com" ? { id: "lead1", accountId: null } : null);
    });
    db.crmContact.findFirst.mockResolvedValue(null);
    const r = await matchRecordByAnyAddress(
      "org1",
      ["rep@company.com", "customer@acme.com"],
      "rep@company.com",
    );
    expect(r).toMatchObject({ kind: "Lead", id: "lead1" });
  });
});

describe("resolveThreadScope", () => {
  it("returns just itself for a Lead", async () => {
    expect(await resolveThreadScope("org1", "Lead", "lead1")).toEqual([
      { relatedKind: "Lead", relatedObjectId: "lead1" },
    ]);
  });

  it("rolls up an Account to its linked contacts and leads", async () => {
    db.crmContact.findMany.mockResolvedValue([{ id: "c1" }, { id: "c2" }]);
    db.crmLead.findMany.mockResolvedValue([{ id: "l1" }]);
    const scope = await resolveThreadScope("org1", "Account", "acc1");
    expect(scope).toEqual(
      expect.arrayContaining([
        { relatedKind: "Account", relatedObjectId: "acc1" },
        { relatedKind: "Contact", relatedObjectId: "c1" },
        { relatedKind: "Contact", relatedObjectId: "c2" },
        { relatedKind: "Lead", relatedObjectId: "l1" },
      ]),
    );
  });

  it("rolls up an Opportunity via its account AND its directly-linked lead", async () => {
    db.crmOpportunity.findFirst.mockResolvedValue({ accountId: "acc1", leadId: "leadX" });
    db.crmContact.findMany.mockResolvedValue([{ id: "c1" }]);
    db.crmLead.findMany.mockResolvedValue([]);
    const scope = await resolveThreadScope("org1", "Opportunity", "opp1");
    expect(scope).toEqual(
      expect.arrayContaining([
        { relatedKind: "Opportunity", relatedObjectId: "opp1" },
        { relatedKind: "Lead", relatedObjectId: "leadX" },
        { relatedKind: "Contact", relatedObjectId: "c1" },
      ]),
    );
  });
});
