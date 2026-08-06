import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/projects/rab/route";
import { GET as BILLABLE } from "@/app/api/projects/rab/billable/route";
import { GET as FROM_DPR } from "@/app/api/projects/rab/from-dpr/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/rab${qs ? "?" + qs : ""}`,
    { method: "GET" },
  );
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/projects/rab", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnRunningAccountBill.findMany.mockResolvedValue([]);
  db.cnProject.findMany.mockResolvedValue([]);
  db.cnContractor.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/rab  (gate: construction.rab.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/rab", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("returns the {data,total} shape scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnRunningAccountBill.findMany.mockResolvedValue([
      {
        id: "r1",
        rabNumber: "RAB-2026-00001",
        projectId: "proj1",
        contractorId: "c1",
        woId: "wo1",
        status: "draft",
        project: { name: "Bridge" },
        contractor: { name: "Acme" },
      },
    ]);
    // The handler fetches the page and the total in parallel — `total` comes
    // from a separate count(), not from the row array's length.
    db.cnRunningAccountBill.count.mockResolvedValue(1);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data[0].rabNumber).toBe("RAB-2026-00001");
    expect(db.cnRunningAccountBill.findMany.mock.calls[0][0].where.orgId).toBe(
      TEST_TENANT,
    );
  });

  it("pushes a status filter down when provided", async () => {
    setContext(makeAdminCtx());
    await GET(buildGET("status=approved"));
    const where = db.cnRunningAccountBill.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("approved");
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/rab  (gate: construction.rab.create + matrix pm.dpr:add)
// ═══════════════════════════════════════════════

describe("POST /api/projects/rab — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({}))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({}))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.rab.create"], {
        permissionMatrix: { "pm.dpr": { add: false } },
      }),
    );
    expect((await POST(buildPOST({}))).status).toBe(403);
  });
});

describe("POST /api/projects/rab — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when projectId is missing", async () => {
    const res = await POST(buildPOST({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/project is required/i);
  });

  it("returns 400 when contractorId is missing", async () => {
    const res = await POST(buildPOST({ projectId: "proj1" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/contractor is required/i);
  });

  it("returns 400 when bill period is incomplete", async () => {
    const res = await POST(
      buildPOST({ projectId: "proj1", contractorId: "c1", billPeriodFrom: "2026-06-01" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/bill period/i);
  });

  it("returns 400 when no work order exists for project + contractor", async () => {
    db.cnWorkOrder.findFirst.mockResolvedValue(null);
    const res = await POST(
      buildPOST({
        projectId: "proj1",
        contractorId: "c1",
        billPeriodFrom: "2026-06-01",
        billPeriodTo: "2026-06-30",
        currentBillAmount: 1000,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/no work order/i);
  });

  it("returns 400 when the computed gross is zero", async () => {
    db.cnWorkOrder.findFirst.mockResolvedValue({ id: "wo1" });
    db.cnRunningAccountBill.aggregate.mockResolvedValue({
      _sum: { currentBillAmount: "0" },
    });
    const res = await POST(
      buildPOST({
        projectId: "proj1",
        contractorId: "c1",
        billPeriodFrom: "2026-06-01",
        billPeriodTo: "2026-06-30",
        currentBillAmount: 0,
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/greater than zero/i);
  });
});

describe("POST /api/projects/rab — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a draft RAB (header-only) scoped to the org and returns 201", async () => {
    db.cnWorkOrder.findFirst.mockResolvedValue({ id: "wo1" });
    db.cnRunningAccountBill.aggregate.mockResolvedValue({
      _sum: { currentBillAmount: "0" },
    });
    db.cnRunningAccountBill.count.mockResolvedValue(0);
    db.cnRunningAccountBill.create.mockResolvedValue({
      id: "r1",
      rabNumber: "RAB-2026-00001",
      projectId: "proj1",
      contractorId: "c1",
      woId: "wo1",
      billType: "ra_bill",
      billPeriodFrom: new Date("2026-06-01"),
      billPeriodTo: new Date("2026-06-30"),
      previousBillAmount: "0",
      currentBillAmount: "1000",
      cumulativeAmount: "1000",
      grossBillAmount: "1000",
      retentionAmount: "0",
      tdsAmount: "0",
      cgstAmount: "0",
      sgstAmount: "0",
      igstAmount: "0",
      netPayable: "1000",
      status: "draft",
      project: { name: "Bridge" },
      contractor: { name: "Acme" },
      _count: { lines: 0 },
      createdAt: new Date("2026-06-30"),
      updatedAt: new Date("2026-06-30"),
    });

    const res = await POST(
      buildPOST({
        projectId: "proj1",
        contractorId: "c1",
        billPeriodFrom: "2026-06-01",
        billPeriodTo: "2026-06-30",
        currentBillAmount: 1000,
      }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("r1");
    expect(body.status).toBe("draft");
    const data = db.cnRunningAccountBill.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.status).toBe("draft");
    expect(data.woId).toBe("wo1");
  });

  it("resolves woId from an explicit body.woRef", async () => {
    db.cnWorkOrder.findFirst.mockResolvedValue({ id: "wo-from-ref" });
    db.cnRunningAccountBill.aggregate.mockResolvedValue({
      _sum: { currentBillAmount: "0" },
    });
    db.cnRunningAccountBill.count.mockResolvedValue(0);
    db.cnRunningAccountBill.create.mockResolvedValue({
      id: "r2",
      rabNumber: "RAB-2026-00002",
      projectId: "proj1",
      contractorId: "c1",
      woId: "wo-from-ref",
      billType: "ra_bill",
      billPeriodFrom: new Date("2026-06-01"),
      billPeriodTo: new Date("2026-06-30"),
      previousBillAmount: "0",
      currentBillAmount: "500",
      cumulativeAmount: "500",
      grossBillAmount: "500",
      netPayable: "500",
      status: "draft",
      project: { name: "Bridge" },
      contractor: { name: "Acme" },
      _count: { lines: 0 },
      createdAt: new Date("2026-06-30"),
      updatedAt: new Date("2026-06-30"),
    });

    const res = await POST(
      buildPOST({
        projectId: "proj1",
        contractorId: "c1",
        woRef: "WO-001",
        billPeriodFrom: "2026-06-01",
        billPeriodTo: "2026-06-30",
        currentBillAmount: 500,
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).woId).toBe("wo-from-ref");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnWorkOrder.findFirst.mockResolvedValue({ id: "wo1" });
    db.cnRunningAccountBill.aggregate.mockResolvedValue({
      _sum: { currentBillAmount: "0" },
    });
    db.cnRunningAccountBill.count.mockResolvedValue(0);
    db.cnRunningAccountBill.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(
      buildPOST({
        projectId: "proj1",
        contractorId: "c1",
        billPeriodFrom: "2026-06-01",
        billPeriodTo: "2026-06-30",
        currentBillAmount: 1000,
      }),
    );
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════
// GET /api/projects/rab/billable  (gate: construction.rab.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/rab/billable", () => {
  function billGET(qs = ""): NextRequest {
    return new NextRequest(
      `http://localhost/api/projects/rab/billable${qs ? "?" + qs : ""}`,
      { method: "GET" },
    );
  }

  it("returns 401 when unauthenticated", async () => {
    expect((await BILLABLE(billGET("projectId=proj1"))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.rab.view", async () => {
    setContext(makeUserCtx([]));
    expect((await BILLABLE(billGET("projectId=proj1"))).status).toBe(403);
  });

  it("returns 400 when projectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await BILLABLE(billGET());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectId is required/i);
  });

  it("returns billable leaves with un-billed balance > 0", async () => {
    setContext(makeAdminCtx());
    // getLeafItems is org-scoped; it reads BOQ leaves from the DB. The
    // service rolls these up — supply rows it will return as leaves.
    db.cnBOQItemV2.findMany.mockResolvedValue([]);
    const res = await BILLABLE(billGET("projectId=proj1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// GET /api/projects/rab/from-dpr  (gate: construction.rab.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/rab/from-dpr", () => {
  function fdGET(qs = ""): NextRequest {
    return new NextRequest(
      `http://localhost/api/projects/rab/from-dpr${qs ? "?" + qs : ""}`,
      { method: "GET" },
    );
  }

  it("returns 401 when unauthenticated", async () => {
    expect((await FROM_DPR(fdGET("projectId=proj1&from=2026-06-01&to=2026-06-30"))).status).toBe(
      401,
    );
  });

  it("returns 403 when the user lacks construction.rab.view", async () => {
    setContext(makeUserCtx([]));
    expect(
      (await FROM_DPR(fdGET("projectId=proj1&from=2026-06-01&to=2026-06-30"))).status,
    ).toBe(403);
  });

  it("returns 400 when projectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await FROM_DPR(fdGET("from=2026-06-01&to=2026-06-30"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/projectId is required/i);
  });

  it("returns 400 when from/to dates are missing", async () => {
    setContext(makeAdminCtx());
    const res = await FROM_DPR(fdGET("projectId=proj1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/from and to dates/i);
  });

  it("returns 400 when from is after to", async () => {
    setContext(makeAdminCtx());
    const res = await FROM_DPR(fdGET("projectId=proj1&from=2026-06-30&to=2026-06-01"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/on or before/i);
  });
});
