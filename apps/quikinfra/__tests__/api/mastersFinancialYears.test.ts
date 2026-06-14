import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/financial-years/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/financial-years${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}

function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/financial-years", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const validBody = {
  label: "FY 2024-25",
  startDate: "2024-04-01",
  endDate: "2025-03-31",
  companyId: "co1",
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/masters/financial-years
// ═══════════════════════════════════════════════

describe("GET /api/masters/financial-years — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildGET());
    expect(res.status).toBe(401);
  });

  it("allows ANY authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    db.cnFinancialYear.findMany.mockResolvedValue([]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
  });
});

describe("GET /api/masters/financial-years — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns the {data,total} shape when unpaginated", async () => {
    db.cnFinancialYear.findMany.mockResolvedValue([
      { id: "f1", orgId: TEST_TENANT, label: "FY 2024-25", status: "active" },
      { id: "f2", orgId: TEST_TENANT, label: "FY 2023-24", status: "active" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(2);
    expect(body.total).toBe(2);
  });

  it("scopes the query to the caller's org", async () => {
    db.cnFinancialYear.findMany.mockResolvedValue([]);
    await GET(buildGET());
    const where = db.cnFinancialYear.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
  });

  it("pushes take/skip + count down when paginated", async () => {
    db.cnFinancialYear.findMany.mockResolvedValue([]);
    db.cnFinancialYear.count.mockResolvedValue(0);
    const res = await GET(buildGET("page=2&pageSize=10"));
    const body = await res.json();
    expect(db.cnFinancialYear.findMany.mock.calls[0][0].take).toBe(10);
    expect(db.cnFinancialYear.findMany.mock.calls[0][0].skip).toBe(10);
    expect(body.page).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// POST /api/masters/financial-years
// ═══════════════════════════════════════════════

describe("POST /api/masters/financial-years — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/masters/financial-years — validation", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns 400 when label is missing", async () => {
    const res = await POST(buildPOST({ startDate: "2024-04-01", endDate: "2025-03-31" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/label/i);
  });

  it("returns 400 when startDate is missing", async () => {
    const res = await POST(buildPOST({ label: "FY 2024-25", endDate: "2025-03-31" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when endDate is missing", async () => {
    const res = await POST(buildPOST({ label: "FY 2024-25", startDate: "2024-04-01" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/masters/financial-years — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("creates a financial year scoped to the org and returns 201", async () => {
    db.cnFinancialYear.create.mockResolvedValue({
      id: "f1",
      orgId: TEST_TENANT,
      companyId: "co1",
      label: "FY 2024-25",
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });

    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("f1");

    const data = db.cnFinancialYear.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.label).toBe("FY 2024-25");
  });

  it("maps a Prisma P2002 unique violation to 409", async () => {
    db.cnFinancialYear.create.mockRejectedValue({ code: "P2002" });
    const res = await POST(buildPOST(validBody));
    expect(res.status).toBe(409);
  });
});
