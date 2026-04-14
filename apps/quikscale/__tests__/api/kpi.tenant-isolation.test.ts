import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/kpi/route";

const USER = "ckactor00000000000000000001";
const OWNER = "ckowner00000000000000000001";
const MY_TENANT = "tenant-mine";
const OTHER_TENANT = "tenant-other";

function req(path: string, init?: RequestInit): NextRequest {
  return new NextRequest(`http://localhost${path}`, init as any);
}

function asAdminIn(tenantId: string) {
  setSession({ id: USER, tenantId, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m1",
    userId: USER,
    tenantId,
    role: "admin",
    status: "active",
  } as any);
  mockDb.featureFlag.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("tenant isolation — GET /api/kpi", () => {
  it("scopes list queries to the caller's tenantId, never another", async () => {
    asAdminIn(MY_TENANT);
    mockDb.kPI.count.mockResolvedValue(0);
    mockDb.kPI.findMany.mockResolvedValue([]);
    mockDb.user.findMany.mockResolvedValue([]);

    await GET(req("/api/kpi"), { params: {} } as any);

    // Every Prisma call must filter by MY_TENANT only.
    for (const call of mockDb.kPI.findMany.mock.calls) {
      expect((call[0] as any).where.tenantId).toBe(MY_TENANT);
      expect((call[0] as any).where.tenantId).not.toBe(OTHER_TENANT);
    }
    for (const call of mockDb.kPI.count.mock.calls) {
      expect((call[0] as any).where.tenantId).toBe(MY_TENANT);
    }
  });

  it("a user with no membership in the requested tenantId gets 403", async () => {
    // Session says MY_TENANT but no active membership is returned
    setSession({ id: USER, tenantId: MY_TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);

    const res = await GET(req("/api/kpi"), { params: {} } as any);
    expect(res.status).toBe(403);
  });
});

describe("tenant isolation — POST /api/kpi", () => {
  it("never persists a KPI with a different tenantId than the caller's", async () => {
    asAdminIn(MY_TENANT);
    mockDb.user.findUnique.mockResolvedValue({ id: OWNER } as any);
    mockDb.kPI.create.mockResolvedValue({
      id: "new",
      name: "X",
      tenantId: MY_TENANT,
    } as any);
    mockDb.kPILog.create.mockResolvedValue({} as any);

    const body = {
      name: "Isolated KPI",
      kpiLevel: "individual",
      owner: OWNER,
      quarter: "Q1",
      year: 2026,
      measurementUnit: "Number",
    };

    await POST(req("/api/kpi", {
      method: "POST",
      body: JSON.stringify(body),
    }), { params: {} } as any);

    // Verify the create call was scoped to MY_TENANT, not whatever the body
    // might have tried to inject (it shouldn't even be allowed to inject one).
    const createCall = mockDb.kPI.create.mock.calls[0][0];
    expect((createCall as any).data.tenantId).toBe(MY_TENANT);
  });

  it("kpiLog write is also scoped to caller tenant", async () => {
    asAdminIn(MY_TENANT);
    mockDb.user.findUnique.mockResolvedValue({ id: OWNER } as any);
    mockDb.kPI.create.mockResolvedValue({ id: "new-1" } as any);
    mockDb.kPILog.create.mockResolvedValue({} as any);

    const body = {
      name: "KPI for audit",
      kpiLevel: "individual",
      owner: OWNER,
      quarter: "Q1",
      year: 2026,
      measurementUnit: "Number",
    };

    await POST(req("/api/kpi", {
      method: "POST",
      body: JSON.stringify(body),
    }), { params: {} } as any);

    const logCall = mockDb.kPILog.create.mock.calls[0][0];
    expect((logCall as any).data.tenantId).toBe(MY_TENANT);
  });
});
