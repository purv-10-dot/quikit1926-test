import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/projects/dpr/[id]/route";
import { POST as SUBMIT } from "@/app/api/projects/dpr/[id]/submit/route";
import { POST as APPROVE } from "@/app/api/projects/dpr/[id]/approve/route";

const db = mockDb as any;
const ID = "d1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/dpr/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

/** A DPR row as cnDailyProgressReport.findFirst would return it (pre-enrichment). */
function dprRow(over: Record<string, unknown> = {}) {
  return {
    id: ID,
    orgId: TEST_TENANT,
    dprNumber: "DPR-BRG-20260601-001",
    projectId: "proj1",
    status: "draft",
    approvalId: null,
    consumptionLocationId: null,
    reportDate: new Date("2026-06-01"),
    project: { id: "proj1", name: "Bridge", code: "BRG" },
    workItems: [],
    labourEntries: [],
    machineryEntries: [],
    materialEntries: [],
    staffEntries: [],
    createdBy: TEST_USER,
    updatedBy: TEST_USER,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnBOQItemV2.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/dpr/[id]  (auth: any authenticated org user)
// ═══════════════════════════════════════════════

describe("GET /api/projects/dpr/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(null);
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns 404 when the row is soft-deleted", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(dprRow({ status: "inactive" }));
    expect((await GET(req("GET"), params)).status).toBe(404);
  });

  it("returns the DPR scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(dprRow());
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnDailyProgressReport.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });

  // Regression: FREE_SCOPE work items anchor on scopeId → CnActivityItem,
  // not boqItemId. The enrich used to resolve unit/target from the BOQ
  // table only, so activity rows came back with a blank ref, blank unit
  // and totalTarget 0 — which pinned the form's % Completed at 0.0%.
  it("resolves ref / unit / target from the activity for FREE_SCOPE work items", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(
      dprRow({
        workItems: [
          {
            id: "wi1",
            boqItemId: null,
            scopeType: "ACTIVITY",
            scopeId: "act1",
            description: "Earthwork in excavation",
            todayQty: "2",
            cumulativeQty: "2",
            uomId: "uom1",
            images: [],
          },
        ],
      }),
    );
    db.cnActivityItem.findMany.mockResolvedValue([
      {
        id: "act1",
        activityCode: "ACT-001",
        uomId: "uom1",
        tenderQty: "10",
        scopeQty: "0",
      },
    ]);
    db.cnUOM.findMany.mockResolvedValue([{ id: "uom1", code: "CUM" }]);

    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const [wi] = (await res.json()).workItems;
    expect(wi.boqNo).toBe("ACT-001");
    expect(wi.unit).toBe("CUM");
    expect(wi.totalTarget).toBe(10);
    // Scope anchor must round-trip so the edit form's PUT keeps the link.
    expect(wi.scopeType).toBe("ACTIVITY");
    expect(wi.scopeId).toBe("act1");
    expect(db.cnActivityItem.findMany.mock.calls[0][0].where).toMatchObject({
      orgId: TEST_TENANT,
    });
  });

  it("prefers an activity's revised scopeQty over its tender baseline", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(
      dprRow({
        workItems: [
          {
            id: "wi1",
            boqItemId: null,
            scopeType: "ACTIVITY",
            scopeId: "act1",
            description: "Earthwork",
            todayQty: "5",
            cumulativeQty: "5",
            uomId: null,
            images: [],
          },
        ],
      }),
    );
    db.cnActivityItem.findMany.mockResolvedValue([
      { id: "act1", activityCode: "ACT-001", uomId: null, tenderQty: "100", scopeQty: "150" },
    ]);

    const res = await GET(req("GET"), params);
    const [wi] = (await res.json()).workItems;
    expect(wi.totalTarget).toBe(150);
    expect(wi.unit).toBe("");
  });
});

// ═══════════════════════════════════════════════
// PUT /api/projects/dpr/[id]  (matrix pm.dpr:edit + ownership)
// ═══════════════════════════════════════════════

describe("PUT /api/projects/dpr/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", {}), params)).status).toBe(401);
  });

  it("returns 403 when the matrix denies edit", async () => {
    setContext(makeUserCtx([], { permissionMatrix: { "pm.dpr": { edit: false } } }));
    expect((await PUT(req("PUT", {}), params)).status).toBe(403);
  });

  it("returns 404 when the row does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(null);
    expect((await PUT(req("PUT", {}), params)).status).toBe(404);
  });

  it("updates the DPR and returns the enriched row", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst
      .mockResolvedValueOnce(dprRow()) // existing lookup
      .mockResolvedValueOnce(dprRow({ status: "submitted" })); // refreshed read
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    const res = await PUT(req("PUT", { siteRemarks: "rain stopped work" }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
  });

  // Regression: the work-item rewrite used to drop scopeType/scopeId and
  // coerce boqItemId to "", so re-saving a FREE_SCOPE DPR orphaned every
  // row from its activity.
  it("persists the activity anchor for FREE_SCOPE work items", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst
      .mockResolvedValueOnce(dprRow())
      .mockResolvedValueOnce(dprRow());
    db.$transaction.mockImplementation(async (cb: any) => cb(db));

    const res = await PUT(
      req("PUT", {
        workItems: [
          {
            boqItemId: "",
            scopeType: "ACTIVITY",
            scopeId: "act1",
            boqNo: "ACT-001",
            description: "Earthwork",
            todayQty: 2,
            uomId: "uom1",
          },
        ],
      }),
      params,
    );
    expect(res.status).toBe(200);
    const [created] = db.cnDPRWorkItem.createMany.mock.calls[0][0].data;
    expect(created.scopeType).toBe("ACTIVITY");
    expect(created.scopeId).toBe("act1");
    expect(created.boqItemId).toBeNull();
  });

  it("still writes boqItemId for BOQ-mode work items", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst
      .mockResolvedValueOnce(dprRow())
      .mockResolvedValueOnce(dprRow());
    db.$transaction.mockImplementation(async (cb: any) => cb(db));

    await PUT(
      req("PUT", {
        workItems: [
          { boqItemId: "boq1", description: "Concrete", todayQty: 3, uomId: "uom1" },
        ],
      }),
      params,
    );
    const [created] = db.cnDPRWorkItem.createMany.mock.calls[0][0].data;
    expect(created.boqItemId).toBe("boq1");
    expect(created.scopeType).toBeNull();
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/projects/dpr/[id]  (matrix pm.dpr:delete + ownership, soft-delete)
// ═══════════════════════════════════════════════

describe("DELETE /api/projects/dpr/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the matrix denies delete", async () => {
    setContext(makeUserCtx([], { permissionMatrix: { "pm.dpr": { delete: false } } }));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when the row does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(null);
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });

  it("soft-deletes within the org and returns the refreshed row", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst
      .mockResolvedValueOnce({ id: ID, createdBy: TEST_USER, status: "draft" }) // existing
      .mockResolvedValueOnce(dprRow({ status: "inactive" })); // refreshed
    db.cnDailyProgressReport.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    const upd = db.cnDailyProgressReport.updateMany.mock.calls[0][0];
    expect(upd.where).toMatchObject({ id: ID, orgId: TEST_TENANT });
    expect(upd.data.status).toBe("inactive");
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/dpr/[id]/submit  (gate construction.dpr.create + matrix pm.dpr:edit)
// ═══════════════════════════════════════════════

describe("POST /api/projects/dpr/[id]/submit", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await SUBMIT(req("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.dpr.create", async () => {
    setContext(makeUserCtx([]));
    expect((await SUBMIT(req("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the DPR does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(null);
    expect((await SUBMIT(req("POST"), params)).status).toBe(404);
  });

  it("returns 400 when the DPR is not in draft", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(
      dprRow({ status: "submitted" }),
    );
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot submit/i);
  });

  it("returns 400 when no active DPR workflow is configured", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(dprRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue(null);
    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no active dpr workflow/i);
  });

  it("submits and moves the DPR into the workflow (pending)", async () => {
    // USER-role raiser does NOT outrank the SITE_ADMIN step → stays live.
    setContext(makeUserCtx(["construction.dpr.create"]));
    db.cnDailyProgressReport.findFirst.mockResolvedValue(dprRow());
    db.cnApprovalWorkflow.findFirst.mockResolvedValue({
      id: "wf1",
      orgId: TEST_TENANT,
      entityType: "dpr",
      isActive: true,
      projectId: "proj1",
      steps: [
        { stepOrder: 1, approverUserId: null, approverUserIds: null, approverRoleId: "SITE_ADMIN" },
      ],
    });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalInstance.create.mockResolvedValue({ id: "inst1" });
    db.cnDailyProgressReport.update.mockResolvedValue({
      id: ID,
      status: "submitted",
      approvalId: "inst1",
    });

    const res = await SUBMIT(req("POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approvalInstanceId).toBe("inst1");
    expect(body.autoApproved).toBe(false);
    expect(db.cnDailyProgressReport.update.mock.calls[0][0].data.status).toBe(
      "submitted",
    );
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/dpr/[id]/approve  (gate construction.dpr.approve + matrix pm.dpr:edit)
// ═══════════════════════════════════════════════

describe("POST /api/projects/dpr/[id]/approve", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.dpr.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(403);
  });

  it("returns 400 on an unknown action", async () => {
    setContext(makeAdminCtx());
    const res = await APPROVE(req("POST", { action: "frobnicate" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/unknown action/i);
  });

  it("returns 400 when reject is missing comments", async () => {
    setContext(makeAdminCtx());
    const res = await APPROVE(req("POST", { action: "reject" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/comments are required/i);
  });

  it("returns 404 when the DPR does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(null);
    expect((await APPROVE(req("POST", { action: "approve" }), params)).status).toBe(404);
  });

  it("returns 400 when the DPR has no approval instance", async () => {
    setContext(makeAdminCtx());
    db.cnDailyProgressReport.findFirst.mockResolvedValue(dprRow({ approvalId: null }));
    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/not submitted through a workflow/i);
  });

  it("approves the final step and flips the DPR to approved", async () => {
    // super_admin passes canActOnStep regardless of the pinned approver.
    setContext(makeAdminCtx({ roleKey: "super_admin" }));
    db.cnDailyProgressReport.findFirst
      .mockResolvedValueOnce(dprRow({ approvalId: "inst1" })) // initial lookup
      .mockResolvedValueOnce(dprRow({ approvalId: "inst1", status: "approved" })); // refreshed
    db.cnApprovalInstance.findFirst.mockResolvedValue({
      id: "inst1",
      orgId: TEST_TENANT,
      workflowId: "wf1",
      status: "pending_approval",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.findFirst
      .mockResolvedValueOnce({ stepOrder: 1, approverUserId: null, approverRoleId: "SITE_ADMIN" }) // current
      .mockResolvedValueOnce(null); // no next step → final
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnApprovalInstance.findUnique.mockResolvedValue({
      id: "inst1",
      status: "approved",
      currentStepOrder: 1,
    });
    db.cnApprovalWorkflowStep.count.mockResolvedValue(1);

    const res = await APPROVE(req("POST", { action: "approve" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe("approve");
    expect(body.approval.status).toBe("approved");
    const updates = db.cnDailyProgressReport.update.mock.calls.map(
      (c: any) => c[0].data.status,
    );
    expect(updates).toContain("approved");
  });
});
