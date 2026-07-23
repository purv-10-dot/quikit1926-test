import { describe, it, expect, beforeEach } from "vitest";
import * as XLSX from "xlsx";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/projects/work-orders/route";
import { GET as EXPORT } from "@/app/api/projects/work-orders/export/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/projects/work-orders${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildExportGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/work-orders/export${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/projects/work-orders", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnWorkOrder.findMany.mockResolvedValue([]);
  db.cnDPRWorkItem.findMany.mockResolvedValue([]);
  db.cnApprovalInstance.findMany.mockResolvedValue([]);
  db.cnProject.findMany.mockResolvedValue([]);
  db.cnContractor.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/work-orders  (gate: construction.wo.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/work-orders", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wo.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("returns the list scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnWorkOrder.findMany.mockResolvedValue([
      {
        id: "wo1",
        woNumber: "WO-SITE-460",
        orgId: TEST_TENANT,
        projectId: "proj1",
        contractorId: "c1",
        status: "draft",
        lines: [],
        totalAmount: "0",
        approvalId: null,
      },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].woNumber).toBe("WO-SITE-460");
    expect(db.cnWorkOrder.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("pushes status + contractor filters into the where clause", async () => {
    setContext(makeAdminCtx());
    await GET(buildGET("status=approved&contractorId=c1"));
    const where = db.cnWorkOrder.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("approved");
    expect(where.contractorId).toBe("c1");
  });
});

// ═══════════════════════════════════════════════
// GET /api/projects/work-orders/export  (gate: construction.wo.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/work-orders/export", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await EXPORT(buildExportGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wo.view", async () => {
    setContext(makeUserCtx([]));
    expect((await EXPORT(buildExportGET())).status).toBe(403);
  });

  it("streams a multi-sheet xlsx scoped to the org with the filters applied", async () => {
    setContext(makeAdminCtx());
    db.cnUOM.findMany.mockResolvedValue([]);
    db.cnWorkOrder.findMany.mockResolvedValue([
      {
        woNumber: "WO-SITE-460",
        status: "approved",
        workType: "labour",
        startDate: new Date("2026-07-31"),
        endDate: new Date("2026-08-05"),
        totalAmount: "36",
        project: { name: "Bridge" },
        contractor: { name: "dgdfg" },
        lines: [
          {
            lineType: "boq",
            boqItemId: null,
            activityName: "Excavation",
            description: "Dig",
            uomId: "u1",
            quantity: "3",
            negotiatedRate: "12",
            amount: "36",
            lineDate: new Date("2026-07-31"),
          },
        ],
      },
    ]);

    const res = await EXPORT(buildExportGET("status=approved&contractorId=c1"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename=/);
    const where = db.cnWorkOrder.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.status).toBe("approved");
    expect(where.contractorId).toBe("c1");

    const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
    expect(wb.SheetNames).toEqual(["Work Orders", "WO Lines"]);
    const lines = XLSX.utils.sheet_to_json(wb.Sheets["WO Lines"], {
      header: 1,
    }) as unknown[][];
    // header + one line row
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain("Excavation");
    expect(lines[1]).toContain("WO-SITE-460");
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/work-orders  (gate: construction.wo.create + matrix pm.work_order:add)
// ═══════════════════════════════════════════════

describe("POST /api/projects/work-orders", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({ projectId: "proj1" }))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wo.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({ projectId: "proj1" }))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.wo.create"], {
        permissionMatrix: { "pm.work_order": { add: false } },
      }),
    );
    expect((await POST(buildPOST({ projectId: "proj1" }))).status).toBe(403);
  });

  it("returns 400 when projectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectId is required/i);
  });

  it("returns 404 when the project does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST({ projectId: "proj1" }));
    expect(res.status).toBe(404);
  });

  it("returns 400 when contractorId is missing / unresolved", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "proj1", name: "Site", code: "STE" });
    const res = await POST(buildPOST({ projectId: "proj1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/contractorId is required/i);
  });

  it("creates a work order scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "proj1", name: "Site", code: "STE" });
    db.cnContractor.findFirst.mockResolvedValue({ id: "c1", name: "Acme" });
    db.cnWorkOrder.count.mockResolvedValue(0);
    db.cnWorkOrder.create.mockResolvedValue({
      id: "wo1",
      woNumber: "WO-STE-460",
      orgId: TEST_TENANT,
      projectId: "proj1",
      contractorId: "c1",
      status: "draft",
      totalAmount: "0",
      lines: [],
      project: { id: "proj1", name: "Site", code: "STE" },
      contractor: { id: "c1", name: "Acme" },
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });
    const res = await POST(buildPOST({ projectId: "proj1", contractorId: "c1" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("wo1");
    const data = db.cnWorkOrder.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "proj1", name: "Site", code: "STE" });
    db.cnContractor.findFirst.mockResolvedValue({ id: "c1", name: "Acme" });
    db.cnWorkOrder.count.mockResolvedValue(0);
    db.cnWorkOrder.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST({ projectId: "proj1", contractorId: "c1" }));
    expect(res.status).toBe(409);
  });
});
