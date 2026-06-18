import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { NextRequest } from "next/server";
import { GET as INBOX } from "@/app/api/approvals/inbox/route";
import { GET as PENDING } from "@/app/api/approvals/pending/route";

const db = mockDb as any;

function inboxReq(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/approvals/inbox${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

function pendingReq(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/approvals/pending${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // Every per-entity list repo + the canAct/name batch lookups iterate over
  // .findMany results, so default all of them to empty arrays.
  db.cnPurchaseRequisition.findMany.mockResolvedValue([]);
  db.cnPurchaseIndent.findMany.mockResolvedValue([]);
  db.cnPurchaseOrder.findMany.mockResolvedValue([]);
  db.cnGoodsReceiptNote.findMany.mockResolvedValue([]);
  db.cnMaterialIssue.findMany.mockResolvedValue([]);
  db.cnStockTransfer.findMany.mockResolvedValue([]);
  db.cnStockReconciliation.findMany.mockResolvedValue([]);
  db.cnDailyProgressReport.findMany.mockResolvedValue([]);
  db.cnRunningAccountBill.findMany.mockResolvedValue([]);
  db.cnApprovalInstance.findMany.mockResolvedValue([]);
  db.cnApprovalWorkflowStep.findMany.mockResolvedValue([]);
  db.cnProject.findMany.mockResolvedValue([]);
  db.cnItem.findMany.mockResolvedValue([]);
  db.cnUOM.findMany.mockResolvedValue([]);
  db.cnWorkCategory.findMany.mockResolvedValue([]);
  db.cnLocation.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/approvals/inbox  (gate: requireAuth — any authed org user)
// ═══════════════════════════════════════════════

describe("GET /api/approvals/inbox", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await INBOX(inboxReq())).status).toBe(401);
  });

  it("allows any authenticated user (per-entity perms just narrow what they see)", async () => {
    setContext(makeUserCtx([])); // no approve perms — every block is skipped
    const res = await INBOX(inboxReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.items).toEqual([]);
    expect(body.data.total).toBe(0);
  });

  it("returns an items envelope for an admin (wildcard sees every block)", async () => {
    setContext(makeAdminCtx());
    const res = await INBOX(inboxReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.total).toBe(0);
  });

  it("surfaces a pending MR for an approver and scopes the query to the org", async () => {
    setContext(makeUserCtx(["purchase.mr.approve"]));
    db.cnPurchaseRequisition.findMany.mockResolvedValue([
      {
        id: "pr1",
        orgId: TEST_TENANT,
        prNumber: "MR-001",
        status: "pending_approval",
        lines: [],
        createdBy: "u-raiser",
        estimatedTotal: "1000",
      },
    ]);
    const res = await INBOX(inboxReq("status=pending"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.items).toHaveLength(1);
    expect(body.data.items[0].entityType).toBe("mr");
    expect(body.data.items[0].id).toBe("pr1");
    // org scoping flows into the repo's where clause
    const where = db.cnPurchaseRequisition.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("excludes draft items from the default pending filter", async () => {
    setContext(makeUserCtx(["purchase.mr.approve"]));
    db.cnPurchaseRequisition.findMany.mockResolvedValue([
      { id: "pr1", orgId: TEST_TENANT, prNumber: "MR-001", status: "draft", lines: [] },
    ]);
    const res = await INBOX(inboxReq());
    const body = await res.json();
    expect(body.data.items).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════
// GET /api/approvals/pending  (gate: requireAuth — workflow-instance backed)
// ═══════════════════════════════════════════════

describe("GET /api/approvals/pending", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PENDING(pendingReq())).status).toBe(401);
  });

  it("returns the legacy {data,total} shape with an empty queue", async () => {
    setContext(makeAdminCtx());
    const res = await PENDING(pendingReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("scopes the instance query to the org and pending_approval status", async () => {
    setContext(makeAdminCtx());
    await PENDING(pendingReq());
    const where = db.cnApprovalInstance.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.status).toBe("pending_approval");
  });

  it("filters by entityType when provided", async () => {
    setContext(makeAdminCtx());
    await PENDING(pendingReq("entityType=purchase_requisitions"));
    const where = db.cnApprovalInstance.findMany.mock.calls[0][0].where;
    expect(where.entityType).toBe("purchase_requisitions");
  });

  it("returns instances the caller can act on (super_admin bypass)", async () => {
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnApprovalInstance.findMany.mockResolvedValue([
      {
        id: "ai-1",
        entityType: "purchase_requisitions",
        entityId: "pr1",
        entityNumber: "MR-001",
        requestedById: "u-raiser",
        requestedAt: new Date("2026-01-01"),
        status: "pending_approval",
        currentStepOrder: 1,
        workflowId: "wf1",
      },
    ]);
    db.cnApprovalWorkflowStep.findMany.mockResolvedValue([
      { workflowId: "wf1", stepOrder: 1, approverUserId: "someone-else", approverUserIds: null, approverRoleId: null },
    ]);
    db.cnPurchaseRequisition.findMany.mockResolvedValue([
      { id: "pr1", projectId: "proj1", estimatedTotal: "5000" },
    ]);
    db.cnProject.findMany.mockResolvedValue([{ id: "proj1", name: "Site A" }]);
    db.user.findMany.mockResolvedValue([]);
    const res = await PENDING(pendingReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe("ai-1");
    expect(body.data[0].projectName).toBe("Site A");
    expect(body.data[0].workflowDriven).toBe(true);
  });

  it("drops instances the caller is not the actor for", async () => {
    // Regular user, step pinned to someone else → not actionable.
    setContext(makeUserCtx([], { roleKey: "user" }));
    db.cnApprovalInstance.findMany.mockResolvedValue([
      {
        id: "ai-1",
        entityType: "po",
        entityId: "po1",
        entityNumber: "PO-001",
        requestedById: "u-raiser",
        requestedAt: new Date("2026-01-01"),
        status: "pending_approval",
        currentStepOrder: 1,
        workflowId: "wf1",
      },
    ]);
    db.cnApprovalWorkflowStep.findMany.mockResolvedValue([
      { workflowId: "wf1", stepOrder: 1, approverUserId: "someone-else", approverUserIds: null, approverRoleId: null },
    ]);
    const res = await PENDING(pendingReq());
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });

  it("returns the paginated envelope when page/pageSize are present", async () => {
    setContext(makeAdminCtx());
    const res = await PENDING(pendingReq("page=1&pageSize=10"));
    const body = await res.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
    expect(body.hasMore).toBe(false);
  });
});
