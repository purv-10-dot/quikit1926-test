/**
 * Smoke tests — GET /api/super/analytics/tenant/[tenantId]
 * Auth matrix, 404 on missing tenant, happy-path shape assertion.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { setSession } from "../setup";
import { mockDb, resetMockDb } from "../helpers/mockDb";

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendUserCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgSuspendedEmail: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from "@/app/api/super/analytics/tenant/[tenantId]/route";

function makeRequest() {
  return new NextRequest(
    new URL("/api/super/analytics/tenant/t-1", "http://localhost:3006"),
  );
}

async function bodyOf(res: Response) {
  return res.json();
}

const SUPER_ADMIN = { id: "sa-1", email: "super@test.com", isSuperAdmin: true };
const REGULAR_USER = { id: "user-1", email: "user@test.com", isSuperAdmin: false };
const PARAMS = { params: { tenantId: "t-1" } };

describe("GET /api/super/analytics/tenant/[tenantId]", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns 401 without session", async () => {
    setSession(null);
    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    setSession(REGULAR_USER);
    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(403);
  });

  it("returns 404 when tenant is missing", async () => {
    setSession(SUPER_ADMIN);
    mockDb.tenant.findUnique.mockResolvedValue(null as never);

    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(404);
    const body = await bodyOf(res);
    expect(body.error).toContain("Tenant not found");
  });

  it("returns analytics data shape on happy path", async () => {
    setSession(SUPER_ADMIN);
    mockDb.tenant.findUnique.mockResolvedValue({
      id: "t-1",
      name: "Acme",
      plan: "startup",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    } as never);
    mockDb.sessionEvent.findMany.mockResolvedValue([] as never);
    mockDb.apiCallHourlyRollup.findMany.mockResolvedValue([] as never);
    mockDb.tenantAppAccess.findMany.mockResolvedValue([] as never);
    mockDb.appModuleFlag.findMany.mockResolvedValue([] as never);
    mockDb.kPI.count.mockResolvedValue(0 as never);
    mockDb.invoice.findMany.mockResolvedValue([] as never);

    const res = await GET(makeRequest(), PARAMS);
    expect(res.status).toBe(200);

    const body = await bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data.tenant.id).toBe("t-1");
    expect(body.data.windowDays).toBe(30);
    expect(body.data).toHaveProperty("dauTrend");
    expect(body.data).toHaveProperty("api");
    expect(body.data).toHaveProperty("gates");
    expect(body.data).toHaveProperty("billing");
    expect(body.data.api.totalCalls).toBe(0);
    expect(body.data.api.errorRatePct).toBe(0);
  });
});
