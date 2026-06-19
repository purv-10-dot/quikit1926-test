import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { GET } from "@/app/api/dashboard/route";

const db = mockDb as any;

// The dashboard fans out ~14 count/findMany calls in one Promise.all, then a
// second findMany (top projects) and a conditional groupBy. Stub them all to
// benign zeros/empties so the happy path computes without NPEs.
function stubAllZero() {
  db.cnProject.count.mockResolvedValue(0);
  db.cnProject.findMany.mockResolvedValue([]); // top-3 projects
  db.cnPurchaseRequisition.count.mockResolvedValue(0);
  db.cnPurchaseOrder.count.mockResolvedValue(0);
  db.cnDailyProgressReport.count.mockResolvedValue(0);
  db.cnWorkOrder.count.mockResolvedValue(0);
  db.cnGoodsReceiptNote.count.mockResolvedValue(0);
  db.cnMaterialIssue.count.mockResolvedValue(0);
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnStockBalance.findMany.mockResolvedValue([]);
  db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
  db.cnPurchaseOrder.findMany.mockResolvedValue([]);
  db.cnBOQItem.groupBy.mockResolvedValue([]);
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

describe("GET /api/dashboard — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("allows any authenticated org user (dashboard is ungated beyond ctx)", async () => {
    setContext(makeUserCtx([]));
    stubAllZero();
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("GET /api/dashboard — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns kpis + recentActivity + projectProgress and scopes counts to the org", async () => {
    stubAllZero();
    db.cnProject.count.mockResolvedValue(3); // activeProjects
    db.cnPurchaseRequisition.count.mockResolvedValue(2); // pending PRs
    db.cnPurchaseOrder.count
      .mockResolvedValueOnce(1) // pending POs
      .mockResolvedValueOnce(5); // openPOs (approved)
    db.cnGoodsReceiptNote.count.mockResolvedValue(4);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.kpis).toBeDefined();
    expect(body.kpis.activeProjects).toBe(3);
    // pendingApprovals = pendingPRs + pendingPOs + pendingDPRs + pendingWOs
    expect(body.kpis.pendingApprovals).toBe(2 + 1 + 0 + 0);
    expect(body.kpis.openPOs).toBe(5);
    expect(body.kpis.grnThisMonth).toBe(4);
    expect(body.recentActivity).toEqual({ prs: [], pos: [] });
    expect(body.projectProgress).toEqual([]);

    // org scope on the active-projects count.
    expect(db.cnProject.count.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
    // org scope on pending-PR count.
    expect(db.cnPurchaseRequisition.count.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("rolls up low-stock items from item minStockLevel vs summed balances", async () => {
    stubAllZero();
    db.cnItem.findMany.mockResolvedValue([
      { id: "i1", minStockLevel: 10 }, // below → counts
      { id: "i2", minStockLevel: 5 }, // at/above → does not count
      { id: "i3", minStockLevel: 0 }, // no threshold → skipped
    ]);
    db.cnStockBalance.findMany.mockResolvedValue([
      { itemId: "i1", quantity: 3 },
      { itemId: "i2", quantity: 8 },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.kpis.lowStockItems).toBe(1);
  });

  it("maps recent PRs and POs into the recentActivity shape", async () => {
    stubAllZero();
    db.cnPurchaseRequisition.findMany.mockResolvedValue([
      {
        id: "pr1", prNumber: "MR-001", status: "submitted",
        project: { name: "Tower A" },
        requestDate: new Date("2026-06-01"),
        createdAt: new Date("2026-06-01"),
      },
    ]);
    db.cnPurchaseOrder.findMany.mockResolvedValue([
      {
        id: "po1", poNumber: "PO-001", status: "approved", totalAmount: 1500,
        project: { name: "Tower A" }, vendor: { name: "Acme" },
      },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.recentActivity.prs[0]).toMatchObject({
      id: "pr1", number: "MR-001", project: "Tower A", status: "submitted",
    });
    expect(body.recentActivity.pos[0]).toMatchObject({
      id: "po1", number: "PO-001", vendor: "Acme", project: "Tower A", amount: 1500, status: "approved",
    });
  });

  it("computes projectProgress bands from BOQ aggregates", async () => {
    stubAllZero();
    db.cnProject.count.mockResolvedValue(1);
    db.cnProject.findMany.mockResolvedValue([{ id: "p1", name: "Tower A" }]);
    db.cnBOQItem.groupBy.mockResolvedValue([
      {
        projectId: "p1",
        _avg: { progressPercent: 70 },
        _sum: { contractAmount: 1000, executedAmount: 500 },
      },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body.projectProgress).toHaveLength(1);
    expect(body.projectProgress[0]).toMatchObject({
      id: "p1", name: "Tower A", physicalPct: 70, budgetPct: 50, band: "on_track",
    });
    // BOQ aggregate is org-scoped.
    expect(db.cnBOQItem.groupBy.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

describe("GET /api/dashboard — project scoping", () => {
  it("restricts queries to the user's assigned projects when projectIds is set", async () => {
    setContext(makeAdminCtx({ projectIds: ["p1", "p2"] }));
    stubAllZero();
    await GET();
    // pending-PR count picks up the projectId IN filter.
    const prWhere = db.cnPurchaseRequisition.count.mock.calls[0][0].where;
    expect(prWhere.projectId).toEqual({ in: ["p1", "p2"] });
    // active-projects count restricts by id IN.
    const projWhere = db.cnProject.count.mock.calls[0][0].where;
    expect(projWhere.id).toEqual({ in: ["p1", "p2"] });
  });
});
