import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET } from "@/app/api/notifications/route";

/** Grant every (resource, action) — simulates an admin/manager (Asset:viewAll). */
function grantAll() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockResolvedValue({ id: "perm" } as never);
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}

/**
 * Grant `view` (so Notification:view opens the feed) but NOT `viewAll` —
 * a plain Member. Mirrors the helper in assets.test.ts.
 */
function grantMemberOnly() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action === "view" ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}

/** The caller maps to employee `emp1`, actively assigned the given asset ids. */
function assignedTo(...assetIds: string[]) {
  mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
  mockDb.astAssignment.findMany.mockResolvedValue(assetIds.map((assetId) => ({ assetId })) as never);
}

const anId = (n: { id: string }) => n.id;

describe("GET /api/notifications", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/notifications"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("scopes a Member to their own warranty/repair alerts and drops the org activity feed", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantMemberOnly();
    assignedTo("a1");
    mockDb.astAsset.findMany.mockResolvedValue([
      { id: "a1", itemName: "My Laptop", itemCode: "LP1", warrantyEndDate: "2030-01-01", category: null },
    ] as never);
    mockDb.astRepair.findMany.mockResolvedValue([
      {
        id: "r1",
        status: "InRepair",
        createdAt: new Date("2020-01-01T00:00:00Z"), // long ago → passes the ≥3-day alert threshold
        asset: { itemName: "My Laptop", itemCode: "LP1" },
      },
    ] as never);

    const res = await GET(makeReq("/api/notifications"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);

    // No org-wide activity stream for Members — the audit log is never queried.
    expect(mockDb.astAuditLog.findMany).not.toHaveBeenCalled();
    expect(json.data.some((n: { id: string }) => n.id.startsWith("log-"))).toBe(false);

    // Warranty + repair sources are scoped to the caller's assigned asset ids.
    const assetCall = mockDb.astAsset.findMany.mock.calls[0]?.[0] as {
      where: { id?: { in: string[] } };
    };
    expect(assetCall.where.id?.in).toEqual(["a1"]);
    const repairCall = mockDb.astRepair.findMany.mock.calls[0]?.[0] as {
      where: { assetId?: { in: string[] } };
    };
    expect(repairCall.where.assetId?.in).toEqual(["a1"]);

    // They still see their own alerts.
    expect(json.data.map(anId)).toEqual(
      expect.arrayContaining(["warranty-a1", "repair-alert-r1"]),
    );
  });

  it("notifies a Member of an asset newly assigned to them, with real asset details", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantMemberOnly();
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    // Only the caller's OWN assignment is returned — the query is scoped to
    // their employee id, so another person's assignment can never appear here.
    mockDb.astAssignment.findMany.mockResolvedValue([
      {
        id: "as1",
        assetId: "a1",
        assignedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        asset: { itemName: "MacBook Pro 14", itemCode: "LAP-004" },
      },
    ] as never);
    mockDb.astAsset.findMany.mockResolvedValue([] as never);
    mockDb.astRepair.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/notifications"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);

    // The assignment lookup is scoped to the caller's own employee id +
    // Active status — this is the guarantee that someone else's assignment
    // (a different userId) is never surfaced to this Member.
    const assignCall = mockDb.astAssignment.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; userId: string; status: string };
    };
    expect(assignCall.where.userId).toBe("emp1");
    expect(assignCall.where.status).toBe("Active");
    expect(assignCall.where.orgId).toBe("org1");

    // They see their own new-assignment card with the real asset name + code.
    const notif = json.data.find((n: { id: string }) => n.id === "assignment-as1");
    expect(notif).toBeDefined();
    expect(notif.type).toBe("assignment");
    expect(notif.title).toBe("New Asset Assigned");
    expect(notif.body).toBe("MacBook Pro 14 (LAP-004) assigned to you");
    expect(notif.source).toBe("Assignments");

    // Still no org-wide activity stream leaking in alongside it.
    expect(mockDb.astAuditLog.findMany).not.toHaveBeenCalled();
    expect(json.data.some((n: { id: string }) => n.id.startsWith("log-"))).toBe(false);
  });

  it("does not surface an assignment older than the 30-day 'new' window", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "u1@x.com" });
    grantMemberOnly();
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astAssignment.findMany.mockResolvedValue([
      {
        id: "old1",
        assetId: "a1",
        assignedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
        asset: { itemName: "Old Laptop", itemCode: "LAP-000" },
      },
    ] as never);
    mockDb.astAsset.findMany.mockResolvedValue([] as never);
    mockDb.astRepair.findMany.mockResolvedValue([] as never);

    const res = await GET(makeReq("/api/notifications"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    // The old asset is still in scope for warranty/repair, but produces no
    // "new assignment" card.
    expect(json.data.some((n: { id: string }) => n.id.startsWith("assignment-"))).toBe(false);
  });

  it("returns [] for a Member with no matching employee (no activity leak)", async () => {
    setSession({ id: "u1", orgId: "org1", role: "member", email: "ghost@x.com" });
    grantMemberOnly();
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never);

    const res = await GET(makeReq("/api/notifications"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data).toEqual([]);
    expect(mockDb.astAuditLog.findMany).not.toHaveBeenCalled();
    expect(mockDb.astAsset.findMany).not.toHaveBeenCalled();
    expect(mockDb.astRepair.findMany).not.toHaveBeenCalled();
  });

  it("keeps the full org feed for a viewAll holder — audit + warranty + repair, unscoped (no regression)", async () => {
    setSession({ id: "admin", orgId: "org1", role: "admin" });
    grantAll();
    mockDb.astAuditLog.findMany.mockResolvedValue([
      {
        id: "l1",
        module: "Assets",
        action: "Asset Created",
        entityName: "Someone Else's Laptop",
        details: null,
        createdAt: new Date("2026-07-10T00:00:00Z"),
      },
    ] as never);
    mockDb.astAsset.findMany.mockResolvedValue([
      { id: "a9", itemName: "Any Asset", itemCode: "AA9", warrantyEndDate: "2030-01-01", category: null },
    ] as never);
    mockDb.astRepair.findMany.mockResolvedValue([
      {
        id: "r9",
        status: "Pending",
        createdAt: new Date("2020-01-01T00:00:00Z"),
        asset: { itemName: "Any Asset", itemCode: "AA9" },
      },
    ] as never);

    const res = await GET(makeReq("/api/notifications"), { params: {} });
    const json = await res.json();

    expect(res.status).toBe(200);

    // Admin keeps the org activity stream…
    expect(mockDb.astAuditLog.findMany).toHaveBeenCalled();
    expect(json.data.some((n: { id: string }) => n.id.startsWith("log-"))).toBe(true);

    // …and the warranty/repair sources are NOT id-scoped, and no per-user
    // assignment lookup happens (viewAll short-circuits it).
    expect(mockDb.astEmployee.findFirst).not.toHaveBeenCalled();
    const assetCall = mockDb.astAsset.findMany.mock.calls[0]?.[0] as {
      where: { id?: unknown };
    };
    expect(assetCall.where.id).toBeUndefined();
    const repairCall = mockDb.astRepair.findMany.mock.calls[0]?.[0] as {
      where: { assetId?: unknown };
    };
    expect(repairCall.where.assetId).toBeUndefined();

    expect(json.data.map(anId)).toEqual(
      expect.arrayContaining(["log-l1", "warranty-a9", "repair-alert-r9"]),
    );
  });
});
