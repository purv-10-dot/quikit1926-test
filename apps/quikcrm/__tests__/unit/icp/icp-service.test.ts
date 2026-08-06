/**
 * ICP profile service unit tests — the link-ownership guard (the tenant-isolation
 * boundary) and replace-on-write link semantics, which the route tests exercise
 * only indirectly.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { mockDb } from "../../helpers/mockDb";

const db = mockDb();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildIcpWhere", () => {
  it("filters soft-deleted rows out of the active list", async () => {
    const { buildIcpWhere } = await import("@/lib/services/icp/icp-service");
    const where = buildIcpWhere({ orgId: "t1", sortBy: undefined as never } as never);
    expect(where.orgId).toBe("t1");
    expect(where.deletedAt).toBeNull();
  });

  it("inverts to trashed-only when trashed is set", async () => {
    const { buildIcpWhere } = await import("@/lib/services/icp/icp-service");
    const where = buildIcpWhere({ orgId: "t1", trashed: true } as never);
    expect(where.deletedAt).toEqual({ not: null });
  });

  it("searches name, description and personaNotes case-insensitively", async () => {
    const { buildIcpWhere } = await import("@/lib/services/icp/icp-service");
    const where = buildIcpWhere({ orgId: "t1", q: "manufact" } as never);
    const or = where.OR as Array<Record<string, { contains?: string; mode?: string }>>;
    expect(or).toHaveLength(3);
    expect(or.map((c) => Object.keys(c)[0])).toEqual(["name", "description", "personaNotes"]);
    expect(or[0].name?.mode).toBe("insensitive");
  });

  it("filters by a specific taxonomy row, org-scoped", async () => {
    const { buildIcpWhere } = await import("@/lib/services/icp/icp-service");
    const where = buildIcpWhere({ orgId: "t1", taxonomyId: "tx1" } as never);
    const links = where.taxonomyLinks as { some?: { orgId?: string; taxonomyId?: string } };
    expect(links.some?.orgId).toBe("t1");
    expect(links.some?.taxonomyId).toBe("tx1");
  });

  it("falls back to a kind filter when no taxonomyId is given", async () => {
    const { buildIcpWhere } = await import("@/lib/services/icp/icp-service");
    const where = buildIcpWhere({ orgId: "t1", kind: "Vertical" } as never);
    const links = where.taxonomyLinks as { some?: { kind?: string } };
    expect(links.some?.kind).toBe("Vertical");
  });

  it("prefers taxonomyId over kind when both are present", async () => {
    const { buildIcpWhere } = await import("@/lib/services/icp/icp-service");
    const where = buildIcpWhere({ orgId: "t1", taxonomyId: "tx1", kind: "Vertical" } as never);
    const links = where.taxonomyLinks as { some?: { taxonomyId?: string; kind?: string } };
    expect(links.some?.taxonomyId).toBe("tx1");
    expect(links.some?.kind).toBeUndefined();
  });
});

describe("createIcpProfile — link ownership", () => {
  it("rejects a taxonomy id that is not in this org", async () => {
    db.crmIcpTaxonomy.count.mockResolvedValue(0 as never);

    const { createIcpProfile } = await import("@/lib/services/icp/icp-service");
    await expect(
      createIcpProfile({
        orgId: "t1",
        userId: "u1",
        input: { name: "X", taxonomyIds: ["tx-from-t2"] } as never,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(db.crmIcpProfile.create).not.toHaveBeenCalled();
  });

  it("rejects when only SOME ids are visible (partial match)", async () => {
    // Two requested, one visible — must fail, not silently link one.
    db.crmProduct.count.mockResolvedValue(1 as never);

    const { createIcpProfile } = await import("@/lib/services/icp/icp-service");
    await expect(
      createIcpProfile({
        orgId: "t1",
        userId: "u1",
        input: { name: "X", productIds: ["p1", "p-from-t2"] } as never,
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it("de-duplicates ids before counting so a repeat is not a false mismatch", async () => {
    // ["p1","p1"] is 1 unique id; count returns 1 → must pass.
    db.crmProduct.count.mockResolvedValue(1 as never);
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);
    db.crmIcpProfile.create.mockResolvedValue({ id: "icp1", name: "X" } as never);

    const { createIcpProfile } = await import("@/lib/services/icp/icp-service");
    await createIcpProfile({
      orgId: "t1",
      userId: "u1",
      input: { name: "X", productIds: ["p1", "p1"] } as never,
    });

    const countWhere = db.crmProduct.count.mock.calls[0]?.[0]?.where as {
      id?: { in?: string[] };
      deletedAt?: unknown;
    };
    expect(countWhere.id?.in).toEqual(["p1"]);
    // Trashed products must not be linkable.
    expect(countWhere.deletedAt).toBeNull();
    expect(db.crmIcpProfile.create).toHaveBeenCalled();
  });

  it("reads `kind` from the taxonomy master rather than trusting the client", async () => {
    db.crmIcpTaxonomy.count.mockResolvedValue(1 as never);
    // Master says Technology.
    db.crmIcpTaxonomy.findMany.mockResolvedValue([{ id: "tx1", kind: "Technology" }] as never);
    db.crmIcpProfile.create.mockResolvedValue({ id: "icp1", name: "X" } as never);

    const { createIcpProfile } = await import("@/lib/services/icp/icp-service");
    await createIcpProfile({
      orgId: "t1",
      userId: "u1",
      input: { name: "X", taxonomyIds: ["tx1"] } as never,
    });

    const data = db.crmIcpProfile.create.mock.calls[0]?.[0]?.data as {
      taxonomyLinks?: { create?: Array<{ kind?: string; taxonomyId?: string }> };
    };
    expect(data.taxonomyLinks?.create?.[0]).toMatchObject({
      taxonomyId: "tx1",
      kind: "Technology",
    });
  });

  it("strips link arrays out of the scalar column payload", async () => {
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);
    db.crmIcpProfile.create.mockResolvedValue({ id: "icp1", name: "X" } as never);

    const { createIcpProfile } = await import("@/lib/services/icp/icp-service");
    await createIcpProfile({
      orgId: "t1",
      userId: "u1",
      input: { name: "X", taxonomyIds: [], productIds: [], accountIds: [] } as never,
    });

    const data = db.crmIcpProfile.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    // Prisma would throw on these as unknown scalar args.
    expect(data.taxonomyIds).toBeUndefined();
    expect(data.productIds).toBeUndefined();
    expect(data.accountIds).toBeUndefined();
    expect(data.orgId).toBe("t1");
  });
});

describe("updateIcpProfile — replace-on-write links", () => {
  function txPassthrough() {
    db.$transaction.mockImplementation(async (cb: unknown) =>
      (cb as (tx: typeof db) => Promise<unknown>)(db),
    );
  }

  it("leaves a link set untouched when its key is omitted", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);
    db.crmIcpProfile.update.mockResolvedValue({ id: "icp1" } as never);
    txPassthrough();

    const { updateIcpProfile } = await import("@/lib/services/icp/icp-service");
    await updateIcpProfile({
      orgId: "t1",
      id: "icp1",
      userId: "u1",
      input: { name: "Renamed" } as never,
    });

    // No link key sent → no deleteMany on any link table.
    expect(db.crmIcpProfileTaxonomy.deleteMany).not.toHaveBeenCalled();
    expect(db.crmIcpProfileProduct.deleteMany).not.toHaveBeenCalled();
    expect(db.crmIcpProfileAccount.deleteMany).not.toHaveBeenCalled();
  });

  it("clears a link set when an empty array is sent", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);
    db.crmIcpProfile.update.mockResolvedValue({ id: "icp1" } as never);
    txPassthrough();

    const { updateIcpProfile } = await import("@/lib/services/icp/icp-service");
    await updateIcpProfile({
      orgId: "t1",
      id: "icp1",
      userId: "u1",
      input: { productIds: [] } as never,
    });

    expect(db.crmIcpProfileProduct.deleteMany).toHaveBeenCalledWith({
      where: { orgId: "t1", icpProfileId: "icp1" },
    });
    // Nothing to re-create.
    expect(db.crmIcpProfileProduct.createMany).not.toHaveBeenCalled();
  });

  it("replaces (delete-then-create) when ids are sent", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmAccount.count.mockResolvedValue(2 as never);
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);
    db.crmIcpProfile.update.mockResolvedValue({ id: "icp1" } as never);
    txPassthrough();

    const { updateIcpProfile } = await import("@/lib/services/icp/icp-service");
    await updateIcpProfile({
      orgId: "t1",
      id: "icp1",
      userId: "u1",
      input: { accountIds: ["a1", "a2"] } as never,
    });

    expect(db.crmIcpProfileAccount.deleteMany).toHaveBeenCalled();
    const data = db.crmIcpProfileAccount.createMany.mock.calls[0]?.[0]?.data as Array<{
      orgId?: string;
      accountId?: string;
    }>;
    expect(data).toHaveLength(2);
    expect(data[0].orgId).toBe("t1");
  });

  it("404s for another org's profile before touching links", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue(null as never);

    const { updateIcpProfile } = await import("@/lib/services/icp/icp-service");
    await expect(
      updateIcpProfile({
        orgId: "t1",
        id: "icp-t2",
        userId: "u1",
        input: { name: "Hijack" } as never,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("stamps updatedByUserId", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmIcpTaxonomy.findMany.mockResolvedValue([] as never);
    db.crmIcpProfile.update.mockResolvedValue({ id: "icp1" } as never);
    txPassthrough();

    const { updateIcpProfile } = await import("@/lib/services/icp/icp-service");
    await updateIcpProfile({
      orgId: "t1",
      id: "icp1",
      userId: "u99",
      input: { name: "N" } as never,
    });

    const data = db.crmIcpProfile.update.mock.calls[0]?.[0]?.data as { updatedByUserId?: string };
    expect(data.updatedByUserId).toBe("u99");
  });
});

describe("soft delete / restore / permanent delete", () => {
  it("softDelete 404s when the row is already trashed", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue(null as never);
    const { softDeleteIcpProfile } = await import("@/lib/services/icp/icp-service");
    await expect(
      softDeleteIcpProfile({ orgId: "t1", id: "icp1", userId: "u1" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it("softDelete queries only non-deleted rows", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmIcpProfile.update.mockResolvedValue({ id: "icp1" } as never);

    const { softDeleteIcpProfile } = await import("@/lib/services/icp/icp-service");
    await softDeleteIcpProfile({ orgId: "t1", id: "icp1", userId: "u1" });

    const where = db.crmIcpProfile.findFirst.mock.calls[0]?.[0]?.where as { deletedAt?: unknown };
    expect(where.deletedAt).toBeNull();
  });

  it("restore requires a currently-trashed row", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue({ id: "icp1" } as never);
    db.crmIcpProfile.update.mockResolvedValue({ id: "icp1" } as never);

    const { restoreIcpProfile } = await import("@/lib/services/icp/icp-service");
    await restoreIcpProfile({ orgId: "t1", id: "icp1", userId: "u1" });

    const where = db.crmIcpProfile.findFirst.mock.calls[0]?.[0]?.where as {
      deletedAt?: { not?: null };
    };
    expect(where.deletedAt).toEqual({ not: null });
  });

  it("permanentDelete 404s for another org", async () => {
    db.crmIcpProfile.findFirst.mockResolvedValue(null as never);
    const { permanentDeleteIcpProfile } = await import("@/lib/services/icp/icp-service");
    await expect(permanentDeleteIcpProfile("t1", "icp-t2")).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(db.crmIcpProfile.delete).not.toHaveBeenCalled();
  });
});

describe("listIcpProfiles — serialisation", () => {
  it("stringifies Decimal revenue and flattens _count", async () => {
    db.crmIcpProfile.findMany.mockResolvedValue([
      {
        id: "icp1",
        name: "X",
        annualRevenueMin: { toString: () => "10000000" },
        annualRevenueMax: null,
        _count: { taxonomyLinks: 1, productLinks: 2, accountLinks: 3 },
      },
    ] as never);
    db.crmIcpProfile.count.mockResolvedValue(1 as never);

    const { listIcpProfiles } = await import("@/lib/services/icp/icp-service");
    const res = await listIcpProfiles({
      orgId: "t1",
      page: 1,
      pageSize: 25,
      sortBy: "updatedAt",
      sortDir: "desc",
    });

    // Decimal is not JSON-serialisable across the route boundary.
    expect(res.items[0].annualRevenueMin).toBe("10000000");
    expect(res.items[0].annualRevenueMax).toBeNull();
    expect(res.items[0].taxonomyCount).toBe(1);
    expect(res.items[0].productCount).toBe(2);
    expect(res.items[0].accountCount).toBe(3);
    expect(res.totalPages).toBe(1);
  });

  it("computes totalPages from total and pageSize", async () => {
    db.crmIcpProfile.findMany.mockResolvedValue([] as never);
    db.crmIcpProfile.count.mockResolvedValue(26 as never);

    const { listIcpProfiles } = await import("@/lib/services/icp/icp-service");
    const res = await listIcpProfiles({
      orgId: "t1",
      page: 1,
      pageSize: 25,
      sortBy: "name",
      sortDir: "asc",
    });
    expect(res.totalPages).toBe(2);
  });
});
