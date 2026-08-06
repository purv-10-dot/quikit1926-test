/**
 * Tests for GET /api/activities/call-contacts — the Call form's contact +
 * phone resolver. Covers the required trio (401 unauthenticated, org-isolation,
 * happy path) plus the per-kind resolution and the standalone empty case.
 *
 * Prisma + auth are mocked via the shared mockDb helper (which also mocks
 * requireApiUser / assertModule / accountScopeFilter).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function req(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  return new Request(`http://localhost/api/activities/call-contacts?${qs}`) as never;
}

async function callGET(params: Record<string, string>) {
  const { GET } = await import("@/app/api/activities/call-contacts/route");
  const res = await GET(req(params));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  setSession({ userId: "u1", orgId: "t1", role: "SalesUser", email: "a@b.co", name: "A" });
  db.crmContact.findMany.mockReset();
  db.crmContact.findFirst.mockReset();
  db.crmLead.findFirst.mockReset();
  db.crmOpportunity.findFirst.mockReset();
});

describe("GET /api/activities/call-contacts", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const { status } = await callGET({ relatedKind: "Contact", relatedObjectId: "c1" });
    expect(status).toBe(401);
  });

  it("returns an empty list for a standalone activity (no kind/id)", async () => {
    const { status, body } = await callGET({ relatedKind: "None", relatedObjectId: "" });
    expect(status).toBe(200);
    expect(body).toEqual({ success: true, data: { items: [] } });
    // Standalone must not touch the DB.
    expect(db.crmContact.findMany).not.toHaveBeenCalled();
  });

  it("resolves a single contact with its phone (happy path)", async () => {
    db.crmContact.findFirst.mockResolvedValue({
      id: "c1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@x.co",
      phone: "+1 555 010 1234",
    } as never);

    const { status, body } = await callGET({ relatedKind: "Contact", relatedObjectId: "c1" });
    expect(status).toBe(200);
    expect(body.data.items).toEqual([{ id: "c1", name: "Jane Doe", phone: "+1 555 010 1234" }]);
  });

  it("scopes the query to the caller's org (org-isolation)", async () => {
    db.crmContact.findMany.mockResolvedValue([] as never);
    await callGET({ relatedKind: "Account", relatedObjectId: "acc1" });
    const where = db.crmContact.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    // acl mock returns null, so the where is the base object directly.
    expect(where.orgId).toBe("t1");
    expect(where.accountId).toBe("acc1");
    expect(where.deletedAt).toBeNull();
  });

  it("includes the lead itself plus its contacts for a Lead", async () => {
    db.crmLead.findFirst.mockResolvedValue({
      id: "l1",
      name: "Acme Lead",
      phone: "111",
      mobile: "222",
    } as never);
    db.crmContact.findMany.mockResolvedValue([
      { id: "c9", firstName: "Bob", lastName: null, email: null, phone: "999" },
    ] as never);

    const { body } = await callGET({ relatedKind: "Lead", relatedObjectId: "l1" });
    expect(body.data.items).toEqual([
      { id: "lead:l1", name: "Acme Lead", phone: "111" },
      { id: "c9", name: "Bob", phone: "999" },
    ]);
  });

  it("resolves an Opportunity via its account's contacts", async () => {
    db.crmOpportunity.findFirst.mockResolvedValue({ accountId: "acc7", leadId: null } as never);
    db.crmContact.findMany.mockResolvedValue([
      { id: "c3", firstName: "Sam", lastName: "Lee", email: null, phone: "333" },
    ] as never);

    const { body } = await callGET({ relatedKind: "Opportunity", relatedObjectId: "o1" });
    expect(body.data.items).toEqual([{ id: "c3", name: "Sam Lee", phone: "333" }]);
    const where = db.crmContact.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.accountId).toBe("acc7");
  });
});
