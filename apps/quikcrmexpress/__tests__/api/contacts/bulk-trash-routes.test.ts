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

describe("POST /api/contacts/bulk-delete", () => {
  beforeEach(() => {
    db.qceContact.updateMany.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { POST } = await import("@/app/api/contacts/bulk-delete/route");
    const res = await POST(new Request("http://test/api/contacts/bulk-delete", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("soft-deletes active contacts for the tenant", async () => {
    adminSession();
    db.qceContact.updateMany.mockResolvedValue({ count: 3 } as never);

    const { POST } = await import("@/app/api/contacts/bulk-delete/route");
    const res = await POST(new Request("http://test/api/contacts/bulk-delete", { method: "POST" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.count).toBe(3);

    const where = db.qceContact.updateMany.mock.calls[0]![0]!.where as {
      orgId?: string;
      deletedAt?: null;
    };
    expect(where.orgId).toBe("t1");
    expect(where.deletedAt).toBe(null);
  });
});

describe("DELETE /api/contacts/trash", () => {
  beforeEach(() => {
    db.qceContact.findMany.mockReset();
    db.qceLead.updateMany.mockReset();
    db.qceContact.deleteMany.mockReset();
    db.$transaction.mockReset();
    setSession(null);
  });

  it("returns 401 when unauthenticated", async () => {
    const { DELETE } = await import("@/app/api/contacts/trash/route");
    const res = await DELETE();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-administrators", async () => {
    setSession({
      userId: "u2",
      orgId: "t1",
      role: "User",
      email: "u@b.co",
      name: "Bob",
    });
    const { DELETE } = await import("@/app/api/contacts/trash/route");
    const res = await DELETE();
    expect(res.status).toBe(403);
  });

  it("permanently deletes all trashed contacts for the tenant", async () => {
    adminSession();
    db.qceContact.findMany.mockResolvedValue([
      { id: "c1", leadId: "l1" },
      { id: "c2", leadId: null },
    ] as never);
    db.$transaction.mockImplementation(async (fn: (tx: typeof db) => Promise<unknown>) =>
      fn(db),
    );
    db.qceLead.updateMany.mockResolvedValue({ count: 1 } as never);
    db.qceContact.deleteMany.mockResolvedValue({ count: 2 } as never);

    const { DELETE } = await import("@/app/api/contacts/trash/route");
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.count).toBe(2);
    expect(db.qceContact.deleteMany).toHaveBeenCalled();
  });
});
