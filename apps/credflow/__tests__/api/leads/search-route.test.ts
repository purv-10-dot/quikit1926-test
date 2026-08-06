import { describe, expect, it, beforeEach } from "vitest";
import { mockDb, setSession } from "../../helpers/mockDb";

const db = mockDb();

function adminSession() {
  setSession({
    userId: "u1",
    tenantId: "t1",
    role: "Administrator",
    email: "a@b.co",
    name: "Alice",
  });
}

describe("GET /api/leads — search OR", () => {
  beforeEach(() => {
    db.crmLead.findMany.mockReset();
    db.crmLead.count.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/leads/route");
    const req = new Request("http://test/api/leads?q=acme");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("searches across the expanded text field set on ?q=", async () => {
    adminSession();
    db.crmLead.findMany.mockResolvedValue([]);
    db.crmLead.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/leads/route");
    const req = new Request("http://test/api/leads?q=acme");
    await GET(req as unknown as import("next/server").NextRequest);

    const where = db.crmLead.findMany.mock.calls[0]![0]!.where as {
      OR?: Array<Record<string, { contains?: string }>>;
    };
    const keys = (where.OR ?? []).map((clause) => Object.keys(clause)[0]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "name",
        "email",
        "company",
        "jobTitle",
        "cityName",
        "industry",
        "secondaryEmail",
      ]),
    );
    // A non-numeric query yields no digits → no phone/mobile clauses.
    expect(keys).not.toContain("phone");
    expect(keys).not.toContain("mobile");
  });

  it("reduces a formatted phone query to digits-only phone + mobile clauses", async () => {
    adminSession();
    db.crmLead.findMany.mockResolvedValue([]);
    db.crmLead.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/leads/route");
    const req = new Request(
      `http://test/api/leads?q=${encodeURIComponent("98765 43210")}`,
    );
    await GET(req as unknown as import("next/server").NextRequest);

    const where = db.crmLead.findMany.mock.calls[0]![0]!.where as {
      OR?: Array<Record<string, { contains?: string }>>;
    };
    const or = where.OR ?? [];
    const phoneClause = or.find((clause) => "phone" in clause);
    const mobileClause = or.find((clause) => "mobile" in clause);
    expect(phoneClause?.phone?.contains).toBe("9876543210");
    expect(mobileClause?.mobile?.contains).toBe("9876543210");
  });
});
