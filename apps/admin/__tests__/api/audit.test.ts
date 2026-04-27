import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/audit/route";

const USER = "user-admin-001";
const TENANT = "tenant-001";

function buildRequest(method: string, url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method } as never);
}

function asAuthedAdmin() {
  setSession({ id: USER, tenantId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m-admin",
    userId: USER,
    tenantId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/audit", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(buildRequest("GET", "/api/audit"));
    expect(res.status).toBe(401);
  });

  it("returns paginated audit rows with hydrated actors", async () => {
    asAuthedAdmin();

    const now = new Date();
    mockDb.auditLog.findMany.mockResolvedValue([
      {
        id: "a1",
        tenantId: TENANT,
        action: "INVITED",
        entityType: "Membership",
        entityId: "m1",
        actorId: USER,
        actorRole: "admin",
        oldValues: null,
        newValues: '{"email":"x@y.com"}',
        changes: [],
        reason: null,
        ipAddress: "127.0.0.1",
        userAgent: "vitest",
        createdAt: now,
      },
    ] as any);
    mockDb.auditLog.count.mockResolvedValue(1);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Admin", lastName: "User", email: "admin@test.com" },
    ] as any);

    const res = await GET(buildRequest("GET", "/api/audit?page=1&limit=50"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].action).toBe("INVITED");
    expect(body.data[0].actor.firstName).toBe("Admin");
    expect(body.data[0].createdAt).toBe(now.toISOString());
    expect(body.meta.total).toBe(1);
  });

  it("forwards filter querystring to Prisma where clause", async () => {
    asAuthedAdmin();
    mockDb.auditLog.findMany.mockResolvedValue([] as any);
    mockDb.auditLog.count.mockResolvedValue(0);
    mockDb.user.findMany.mockResolvedValue([] as any);

    await GET(
      buildRequest(
        "GET",
        "/api/audit?action=REVOKED&entityType=Membership&from=2026-01-01"
      )
    );

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          action: "REVOKED",
          entityType: "Membership",
          createdAt: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      })
    );
  });

  it("clamps limit to 100 max", async () => {
    asAuthedAdmin();
    mockDb.auditLog.findMany.mockResolvedValue([] as any);
    mockDb.auditLog.count.mockResolvedValue(0);
    mockDb.user.findMany.mockResolvedValue([] as any);

    await GET(buildRequest("GET", "/api/audit?limit=99999"));

    expect(mockDb.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 })
    );
  });
});
