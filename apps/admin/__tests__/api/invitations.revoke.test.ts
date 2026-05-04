import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { NextRequest } from "next/server";

import { DELETE } from "@/app/api/members/[id]/invitation/route";

const USER = "user-admin-001";
const TENANT = "tenant-001";

function buildRequest(method: string, url: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method } as never);
}

function asAuthedAdmin() {
  setSession({ id: USER, orgId: TENANT, role: "admin" });
  mockDb.membership.findFirst.mockResolvedValue({
    id: "m-admin",
    userId: USER,
    orgId: TENANT,
    role: "admin",
    status: "active",
  } as any);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("DELETE /api/members/[id]/invitation", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await DELETE(buildRequest("DELETE", "/api/members/m1/invitation"), {
      params: { id: "m1" },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when no pending invitation found", async () => {
    asAuthedAdmin();
    mockDb.membership.findFirst.mockResolvedValueOnce({
      id: "m-admin",
      userId: USER,
      orgId: TENANT,
      role: "admin",
      status: "active",
    } as any);
    mockDb.membership.findFirst.mockResolvedValueOnce(null);

    const res = await DELETE(buildRequest("DELETE", "/api/members/missing/invitation"), {
      params: { id: "missing" },
    });
    expect(res.status).toBe(404);
    expect(mockDb.membership.delete).not.toHaveBeenCalled();
  });

  it("deletes membership and writes REVOKED audit log on happy path", async () => {
    asAuthedAdmin();
    mockDb.membership.findFirst.mockResolvedValueOnce({
      id: "m-admin",
      userId: USER,
      orgId: TENANT,
      role: "admin",
      status: "active",
    } as any);
    mockDb.membership.findFirst.mockResolvedValueOnce({
      id: "m-target",
      orgId: TENANT,
      status: "invited",
      role: "employee",
      user: { email: "pending@test.com" },
    } as any);
    mockDb.membership.delete.mockResolvedValue({ id: "m-target" } as any);

    const res = await DELETE(
      buildRequest("DELETE", "/api/members/m-target/invitation"),
      { params: { id: "m-target" } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain("pending@test.com");
    expect(mockDb.membership.delete).toHaveBeenCalledWith({
      where: { id: "m-target" },
    });
    expect(mockDb.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "REVOKED",
          entityType: "Membership",
          entityId: "m-target",
          orgId: TENANT,
          actorId: USER,
        }),
      })
    );
  });

  it("scopes lookup to current tenant (cross-tenant isolation)", async () => {
    asAuthedAdmin();
    mockDb.membership.findFirst.mockResolvedValueOnce({
      id: "m-admin",
      userId: USER,
      orgId: TENANT,
      role: "admin",
      status: "active",
    } as any);
    mockDb.membership.findFirst.mockResolvedValueOnce(null);

    await DELETE(buildRequest("DELETE", "/api/members/m-other-tenant/invitation"), {
      params: { id: "m-other-tenant" },
    });

    const call = mockDb.membership.findFirst.mock.calls.find(
      (c: any[]) => c[0]?.where?.id === "m-other-tenant"
    );
    expect(call).toBeDefined();
    expect(call?.[0]?.where?.orgId).toBe(TENANT);
  });
});
