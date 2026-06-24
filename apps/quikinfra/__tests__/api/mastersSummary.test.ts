import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { GET } from "@/app/api/masters/summary/route";

const db = mockDb as any;

// Card key → Prisma model accessor (mirrors the route's MASTER_MODELS map).
const MODELS = [
  "cnProject", "cnItem", "cnItemGroup", "cnVendor", "cnContractor",
  "cnCustomer", "cnLocation", "cnUOM", "cnGSTCode", "cnTDSCode",
  "cnDepartment", "cnWorkCategory", "cnCostCenter",
  "cnMachinery", "cnCompany", "cnFinancialYear", "cnTermsCondition",
];

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

describe("GET /api/masters/summary — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("GET /api/masters/summary — happy path", () => {
  beforeEach(() => setContext(makeAdminCtx()));

  it("returns per-master active counts scoped to the org", async () => {
    for (const m of MODELS) db[m].count.mockResolvedValue(3);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.data).toBeDefined();
    expect(body.data.vendors).toBe(3);
    expect(body.data.projects).toBe(3);
    expect(body.data.terms).toBe(3);
    expect(Object.keys(body.data)).toHaveLength(MODELS.length);

    // Counts exclude inactive + deleted rows and are org-scoped.
    const where = db.cnVendor.count.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.status).toEqual({ notIn: ["inactive", "deleted"] });
  });

  it("degrades a single failing master to 0 without failing the endpoint", async () => {
    for (const m of MODELS) db[m].count.mockResolvedValue(1);
    db.cnVendor.count.mockRejectedValue(new Error("boom"));

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.vendors).toBe(0);
    expect(body.data.projects).toBe(1);
  });

  it("allows any authenticated org user (view is ungated)", async () => {
    setContext(makeUserCtx([]));
    for (const m of MODELS) db[m].count.mockResolvedValue(0);
    const res = await GET();
    expect(res.status).toBe(200);
  });
});
