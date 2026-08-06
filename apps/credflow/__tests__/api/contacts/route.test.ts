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

describe("GET /api/contacts", () => {
  beforeEach(() => {
    db.crmContact.findMany.mockReset();
    db.crmContact.count.mockReset();
    db.crmAccount.findMany.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { GET } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("returns the {success, data} envelope and batches account names", async () => {
    adminSession();
    db.crmContact.findMany.mockResolvedValue([
      {
        id: "c1",
        tenantId: "t1",
        firstName: "John",
        lastName: "Doe",
        email: "john@acme.test",
        phone: "+919876543210",
        title: "CTO",
        accountId: "a1",
        leadId: null,
        ownerId: "u1",
        ownerName: "Alice",
        city: null,
        contactStage: null,
        source: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as never,
    ]);
    db.crmContact.count.mockResolvedValue(1);
    db.crmAccount.findMany.mockResolvedValue([
      { id: "a1", name: "Acme Corp" } as never,
    ]);

    const { GET } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts?page=1&pageSize=25");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].accountName).toBe("Acme Corp");
    expect(body.data.total).toBe(1);
    expect(body.data.page).toBe(1);
  });

  it("scopes the where clause by tenantId", async () => {
    adminSession();
    db.crmContact.findMany.mockResolvedValue([]);
    db.crmContact.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts");
    await GET(req as unknown as import("next/server").NextRequest);

    const where = db.crmContact.findMany.mock.calls[0]![0]!.where as { tenantId?: string };
    expect(where.tenantId).toBe("t1");
  });

  it("searches across the expanded text field set (incl. city) on ?q=", async () => {
    adminSession();
    db.crmContact.findMany.mockResolvedValue([]);
    db.crmContact.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts?q=acme");
    await GET(req as unknown as import("next/server").NextRequest);

    const where = db.crmContact.findMany.mock.calls[0]![0]!.where as {
      OR?: Array<Record<string, { contains?: string }>>;
    };
    const keys = (where.OR ?? []).map((clause) => Object.keys(clause)[0]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "firstName",
        "lastName",
        "email",
        "title",
        "ownerName",
        "city",
      ]),
    );
  });

  it("reduces a formatted phone query to a digits-only phone clause", async () => {
    adminSession();
    db.crmContact.findMany.mockResolvedValue([]);
    db.crmContact.count.mockResolvedValue(0);

    const { GET } = await import("@/app/api/contacts/route");
    const req = new Request(
      `http://test/api/contacts?q=${encodeURIComponent("98765 43210")}`,
    );
    await GET(req as unknown as import("next/server").NextRequest);

    const where = db.crmContact.findMany.mock.calls[0]![0]!.where as {
      OR?: Array<Record<string, { contains?: string }>>;
    };
    const phoneClause = (where.OR ?? []).find((clause) => "phone" in clause);
    expect(phoneClause?.phone?.contains).toBe("9876543210");
  });
});

describe("POST /api/contacts", () => {
  beforeEach(() => {
    db.crmContact.create.mockReset();
    db.crmContact.findFirst.mockReset();
    db.crmAccount.findMany.mockReset();
    db.orgMember.findFirst.mockReset();
    setSession(null);
  });

  it("rejects bodies that fail validation", async () => {
    adminSession();
    const { POST } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.fieldErrors).toBeTruthy();
  });

  it("returns 409 with existingId when an email duplicate exists in the tenant", async () => {
    adminSession();
    db.crmContact.findFirst.mockResolvedValue({
      id: "c-dup",
      firstName: "Existing",
      lastName: "Person",
    } as never);

    const { POST } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "John",
        lastName: "Doe",
        email: "john@acme.test",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.fieldErrors.email).toBeTruthy();
    expect(body.existingId).toBe("c-dup");
    expect(db.crmContact.create).not.toHaveBeenCalled();
  });

  it("normalises phone to E.164 (IN default) before persist", async () => {
    adminSession();
    db.crmContact.findFirst.mockResolvedValue(null);
    db.crmContact.create.mockResolvedValue({
      id: "c1",
      tenantId: "t1",
      firstName: "Jane",
      lastName: "Doe",
      email: null,
      phone: "+919876543210",
      title: null,
      accountId: null,
      leadId: null,
      ownerId: "u1",
      ownerName: "Alice",
      city: null,
      contactStage: null,
      source: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    db.crmAccount.findMany.mockResolvedValue([]);

    const { POST } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        firstName: "Jane",
        lastName: "Doe",
        phone: "9876543210",
      }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(201);
    const create = db.crmContact.create.mock.calls[0]![0]!.data as { phone?: string };
    expect(create.phone).toBe("+919876543210");
  });

  it("rejects an unparseable phone with the contacts failure shape", async () => {
    adminSession();
    db.crmContact.findFirst.mockResolvedValue(null);

    const { POST } = await import("@/app/api/contacts/route");
    const req = new Request("http://test/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "Jane", lastName: "Doe", phone: "12345" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.fieldErrors.phone).toBeTruthy();
    expect(db.crmContact.create).not.toHaveBeenCalled();
  });
});
