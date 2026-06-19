import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/projects/work-orders/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/projects/work-orders${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
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
