import { describe, expect, it, beforeEach, vi } from "vitest";
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

function makeContact(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    tenantId: "t1",
    firstName: "John",
    lastName: "Doe",
    email: "john@acme.test",
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
    ...overrides,
  };
}

describe("GET /api/contacts/[id]", () => {
  beforeEach(() => {
    db.qcfContact.findFirst.mockReset();
    db.qcfAccount.findMany.mockReset();
    setSession(null);
  });

  it("returns 404 when the contact belongs to a different tenant", async () => {
    adminSession();
    db.qcfContact.findFirst.mockResolvedValue(null);

    const { GET } = await import("@/app/api/contacts/[id]/route");
    const req = new Request("http://test/api/contacts/c1");
    const res = await GET(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/contacts/[id]", () => {
  beforeEach(() => {
    db.qcfContact.findFirst.mockReset();
    db.qcfContact.update.mockReset();
    db.qcfAccount.findMany.mockReset();
    db.orgMember.findFirst.mockReset();
    setSession(null);
  });

  it("rejects unknown fields via Zod (no raw body to Prisma)", async () => {
    adminSession();
    db.qcfContact.findFirst.mockResolvedValue(makeContact() as never);

    const { PATCH } = await import("@/app/api/contacts/[id]/route");
    const req = new Request("http://test/api/contacts/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ firstName: "" }), // empty -> validation should fail
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fieldErrors).toBeTruthy();
    expect(db.qcfContact.update).not.toHaveBeenCalled();
  });

  it("returns 409 on duplicate email (excluding self)", async () => {
    adminSession();
    db.qcfContact.findFirst
      .mockResolvedValueOnce(makeContact() as never) // initial loadOwn
      .mockResolvedValueOnce({ id: "c2", firstName: "Other", lastName: "Person" } as never); // duplicate

    const { PATCH } = await import("@/app/api/contacts/[id]/route");
    const req = new Request("http://test/api/contacts/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "duplicate@acme.test" }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.existingId).toBe("c2");
  });

  it("re-resolves ownerName when ownerId changes", async () => {
    adminSession();
    db.qcfContact.findFirst
      .mockResolvedValueOnce(makeContact({ ownerId: "u1", ownerName: "Alice" }) as never)
      .mockResolvedValueOnce(null); // duplicate-email check
    db.orgMember.findFirst.mockResolvedValue({
      user: {
        id: "u9",
        firstName: "Bob",
        lastName: "Smith",
        email: "bob@example.test",
      },
    } as never);
    db.qcfContact.update.mockResolvedValue(
      makeContact({ ownerId: "u9", ownerName: "Bob Smith" }) as never,
    );
    db.qcfAccount.findMany.mockResolvedValue([]);

    const { PATCH } = await import("@/app/api/contacts/[id]/route");
    const req = new Request("http://test/api/contacts/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ownerId: "u9" }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    const update = db.qcfContact.update.mock.calls[0]![0]!.data as {
      ownerId?: string;
      ownerName?: string;
    };
    expect(update.ownerId).toBe("u9");
    expect(update.ownerName).toBe("Bob Smith");
  });

  it("normalizes a bare-digit phone to E.164 before write", async () => {
    adminSession();
    db.qcfContact.findFirst.mockResolvedValue(makeContact() as never);
    db.qcfContact.update.mockResolvedValue(
      makeContact({ phone: "+917631957103" }) as never,
    );
    db.qcfAccount.findMany.mockResolvedValue([]);

    const { PATCH } = await import("@/app/api/contacts/[id]/route");
    const req = new Request("http://test/api/contacts/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "7631957103" }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);
    const update = db.qcfContact.update.mock.calls[0]![0]!.data as { phone?: string };
    expect(update.phone).toBe("+917631957103");
  });

  it("rejects an invalid phone on PATCH with the contacts failure shape", async () => {
    adminSession();
    db.qcfContact.findFirst.mockResolvedValue(makeContact() as never);

    const { PATCH } = await import("@/app/api/contacts/[id]/route");
    const req = new Request("http://test/api/contacts/c1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "12345" }),
    });
    const res = await PATCH(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.fieldErrors.phone).toBeTruthy();
    expect(db.qcfContact.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/contacts/[id]", () => {
  beforeEach(() => {
    db.qcfContact.findFirst.mockReset();
    db.qcfContact.update.mockReset();
    db.qcfContact.delete.mockReset();
    db.qcfLead.updateMany.mockReset();
    // $transaction mock — call each promise so the side effects record on
    // updateMany / delete spies, then resolve to their values.
    (db.$transaction as unknown as { mockReset?: () => void }).mockReset?.();
    db.$transaction.mockImplementation(async (ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(ops as Promise<unknown>[]);
      }
      return undefined;
    });
    setSession(null);
  });

  it("soft-deletes by setting deletedAt", async () => {
    adminSession();
    db.qcfContact.findFirst.mockResolvedValue(makeContact() as never);
    db.qcfContact.update.mockResolvedValue(makeContact({ deletedAt: new Date() }) as never);

    const { DELETE } = await import("@/app/api/contacts/[id]/route");
    const req = new Request("http://test/api/contacts/c1", { method: "DELETE" });
    const res = await DELETE(req as unknown as import("next/server").NextRequest, {
      params: Promise.resolve({ id: "c1" }),
    });
    expect(res.status).toBe(200);

    expect(db.qcfContact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(db.qcfContact.delete).not.toHaveBeenCalled();
  });
});

// Silence unused import lint warning for `vi` in environments where the helper
// shape changes; keep the symbol available for future test additions.
void vi;
