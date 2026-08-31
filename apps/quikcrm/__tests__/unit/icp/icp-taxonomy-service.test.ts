/**
 * ICP taxonomy service unit tests.
 *
 * Focused on the duplicate-name guard, which exists because of a bug found by
 * live DB testing: the @@unique includes `parentId`, and Postgres treats
 * NULL != NULL, so root-level entries were NOT constrained by it — two identical
 * industries inserted cleanly and the route's P2002 handling never fired. A
 * partial unique index now covers the exact-case case, and assertNameFree covers
 * case-insensitive clashes (no index in this app is case-insensitive).
 *
 * These are service-level tests (mocked Prisma), so they assert the QUERY the
 * service issues rather than DB behaviour — the DB half is proven separately
 * against real Postgres.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";

const db = mockDb();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createIcpTaxonomy — duplicate-name guard", () => {
  it("checks for an existing sibling case-insensitively before inserting", async () => {
    db.crmIcpTaxonomy.findFirst.mockResolvedValue(null as never);
    db.crmIcpTaxonomy.create.mockResolvedValue({
      id: "tx1",
      kind: "Industry",
      name: "Manufacturing",
    } as never);

    const { createIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await createIcpTaxonomy({
      orgId: "t1",
      input: { kind: "Industry", name: "Manufacturing" },
    });

    const where = db.crmIcpTaxonomy.findFirst.mock.calls[0]?.[0]?.where as {
      orgId?: string;
      kind?: string;
      parentId?: string | null;
      name?: { equals?: string; mode?: string };
    };
    expect(where.orgId).toBe("t1");
    expect(where.kind).toBe("Industry");
    // Root-level: parentId must be explicitly null, not undefined — otherwise the
    // guard would match a same-named CHILD and wrongly reject.
    expect(where.parentId).toBeNull();
    expect(where.name?.mode).toBe("insensitive");
    expect(db.crmIcpTaxonomy.create).toHaveBeenCalled();
  });

  it("409s on a case-variant duplicate the DB index would allow", async () => {
    // "manufacturing" already exists; the partial index is case-SENSITIVE so the
    // DB would happily insert "Manufacturing". The service must refuse.
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({ id: "existing" } as never);

    const { createIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await expect(
      createIcpTaxonomy({ orgId: "t1", input: { kind: "Industry", name: "Manufacturing" } }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(db.crmIcpTaxonomy.create).not.toHaveBeenCalled();
  });

  it("still maps a DB-level P2002 to 409 (belt and braces)", async () => {
    db.crmIcpTaxonomy.findFirst.mockResolvedValue(null as never);
    db.crmIcpTaxonomy.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint"), { code: "P2002" }) as never,
    );

    const { createIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await expect(
      createIcpTaxonomy({ orgId: "t1", input: { kind: "Vertical", name: "Race" } }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it("scopes the duplicate check to the child sibling set when parentId is given", async () => {
    // assertParent resolves first, then assertNameFree.
    db.crmIcpTaxonomy.findFirst
      .mockResolvedValueOnce({ id: "p1", kind: "Industry" } as never) // parent lookup
      .mockResolvedValueOnce(null as never); // name-free check
    db.crmIcpTaxonomy.create.mockResolvedValue({ id: "tx2" } as never);

    const { createIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await createIcpTaxonomy({
      orgId: "t1",
      input: { kind: "Industry", name: "Auto Components", parentId: "p1" },
    });

    const where = db.crmIcpTaxonomy.findFirst.mock.calls[1]?.[0]?.where as {
      parentId?: string | null;
    };
    expect(where.parentId).toBe("p1");
  });
});

describe("updateIcpTaxonomy — rename + reparent guards", () => {
  it("runs the duplicate check on rename", async () => {
    db.crmIcpTaxonomy.findFirst
      .mockResolvedValueOnce({
        id: "tx1",
        kind: "Industry",
        name: "Old",
        parentId: null,
      } as never) // existing row
      .mockResolvedValueOnce(null as never); // name-free
    db.crmIcpTaxonomy.update.mockResolvedValue({ id: "tx1" } as never);

    const { updateIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await updateIcpTaxonomy({ orgId: "t1", id: "tx1", input: { name: "New" } });

    const where = db.crmIcpTaxonomy.findFirst.mock.calls[1]?.[0]?.where as {
      name?: { equals?: string };
      id?: { not?: string };
    };
    expect(where.name?.equals).toBe("New");
    // Must exclude itself, or renaming to the same casing would self-collide.
    expect(where.id?.not).toBe("tx1");
  });

  it("409s when the new name collides with a sibling", async () => {
    db.crmIcpTaxonomy.findFirst
      .mockResolvedValueOnce({ id: "tx1", kind: "Industry", name: "Old", parentId: null } as never)
      .mockResolvedValueOnce({ id: "other" } as never);

    const { updateIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await expect(
      updateIcpTaxonomy({ orgId: "t1", id: "tx1", input: { name: "Taken" } }),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(db.crmIcpTaxonomy.update).not.toHaveBeenCalled();
  });

  it("re-checks the name when only parentId changes (sibling set moved)", async () => {
    db.crmIcpTaxonomy.findFirst
      .mockResolvedValueOnce({ id: "tx1", kind: "Industry", name: "Keep", parentId: null } as never)
      .mockResolvedValueOnce({ id: "p2", kind: "Industry" } as never) // assertParent
      .mockResolvedValueOnce(null as never); // name-free under new parent
    db.crmIcpTaxonomy.update.mockResolvedValue({ id: "tx1" } as never);

    const { updateIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await updateIcpTaxonomy({ orgId: "t1", id: "tx1", input: { parentId: "p2" } });

    const where = db.crmIcpTaxonomy.findFirst.mock.calls[2]?.[0]?.where as {
      name?: { equals?: string };
      parentId?: string | null;
    };
    // Existing name carried forward, checked against the NEW parent's siblings.
    expect(where.name?.equals).toBe("Keep");
    expect(where.parentId).toBe("p2");
  });

  it("skips the duplicate check when neither name nor parent changes", async () => {
    db.crmIcpTaxonomy.findFirst.mockResolvedValueOnce({
      id: "tx1",
      kind: "Industry",
      name: "Same",
      parentId: null,
    } as never);
    db.crmIcpTaxonomy.update.mockResolvedValue({ id: "tx1" } as never);

    const { updateIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await updateIcpTaxonomy({ orgId: "t1", id: "tx1", input: { isActive: false } });

    // Only the existence lookup — no second findFirst.
    expect(db.crmIcpTaxonomy.findFirst).toHaveBeenCalledTimes(1);
    expect(db.crmIcpTaxonomy.update).toHaveBeenCalled();
  });

  it("404s for another org's row before any write", async () => {
    db.crmIcpTaxonomy.findFirst.mockResolvedValue(null as never);

    const { updateIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await expect(
      updateIcpTaxonomy({ orgId: "t1", id: "tx-t2", input: { name: "X" } }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.crmIcpTaxonomy.update).not.toHaveBeenCalled();
  });
});

describe("listIcpTaxonomyOptions", () => {
  it("returns only active rows, org-scoped, capped", async () => {
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);

    const { listIcpTaxonomyOptions } = await import("@/lib/services/icp/icp-taxonomy-service");
    await listIcpTaxonomyOptions("t1");

    const arg = db.crmIcpTaxonomy.findMany.mock.calls[0]?.[0] as {
      where?: { orgId?: string; isActive?: boolean };
      take?: number;
    };
    expect(arg.where?.orgId).toBe("t1");
    expect(arg.where?.isActive).toBe(true);
    expect(arg.take).toBe(1000);
  });

  it("narrows by kind when asked", async () => {
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);

    const { listIcpTaxonomyOptions } = await import("@/lib/services/icp/icp-taxonomy-service");
    await listIcpTaxonomyOptions("t1", "Technology");

    const where = db.crmIcpTaxonomy.findMany.mock.calls[0]?.[0]?.where as { kind?: string };
    expect(where.kind).toBe("Technology");
  });
});

describe("deleteIcpTaxonomy — in-use guard", () => {
  it("refuses while linked to profiles", async () => {
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({
      id: "tx1",
      _count: { profileLinks: 2, children: 0 },
    } as never);

    const { deleteIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await expect(deleteIcpTaxonomy("t1", "tx1")).rejects.toMatchObject({ statusCode: 409 });
    expect(db.crmIcpTaxonomy.delete).not.toHaveBeenCalled();
  });

  it("refuses while it has children", async () => {
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({
      id: "tx1",
      _count: { profileLinks: 0, children: 1 },
    } as never);

    const { deleteIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await expect(deleteIcpTaxonomy("t1", "tx1")).rejects.toMatchObject({ statusCode: 409 });
  });

  it("deletes when unused", async () => {
    db.crmIcpTaxonomy.findFirst.mockResolvedValue({
      id: "tx1",
      _count: { profileLinks: 0, children: 0 },
    } as never);
    db.crmIcpTaxonomy.delete.mockResolvedValue({ id: "tx1" } as never);

    const { deleteIcpTaxonomy } = await import("@/lib/services/icp/icp-taxonomy-service");
    await deleteIcpTaxonomy("t1", "tx1");
    expect(db.crmIcpTaxonomy.delete).toHaveBeenCalledWith({ where: { id: "tx1" } });
  });
});
