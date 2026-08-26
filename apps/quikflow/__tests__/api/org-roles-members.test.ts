import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET as getMembers, PUT as putMembers } from "@/app/api/org/roles/[id]/members/route";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init as ConstructorParameters<typeof NextRequest>[1]);
}

const ADMIN = { id: "u_admin", orgId: "org_A", membershipRole: "org_admin" };

beforeEach(() => {
  resetMockDb();
  mockDb.app.findUnique.mockResolvedValue({ id: "app_flow" } as never);
  mockDb.wfRolePermission.findFirst.mockResolvedValue({ id: "rp1" } as never); // grants Role:*
});

describe("GET /api/org/roles/[id]/members", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await getMembers(req("/api/org/roles/role1/members"), { params: { id: "role1" } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the role isn't in the caller's org", async () => {
    setSession(ADMIN);
    mockDb.wfAppRole.findFirst.mockResolvedValue(null);
    const res = await getMembers(req("/api/org/roles/role1/members"), { params: { id: "role1" } });
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/org/roles/[id]/members", () => {
  it("refuses to reconcile the admin role to an empty member list (self-lockout guard)", async () => {
    setSession(ADMIN);
    // Role being reconciled IS the org's system admin role.
    mockDb.wfAppRole.findFirst
      .mockResolvedValueOnce({ id: "role_admin", appId: "app_flow" } as never) // role lookup in the route
      .mockResolvedValueOnce({ id: "role_admin" } as never); // getAdminRoleId lookup in the guard

    const res = await putMembers(
      req("/api/org/roles/role_admin/members", { method: "PUT", body: JSON.stringify({ userIds: [] }) }),
      { params: { id: "role_admin" } },
    );
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/last administrator|empty member list/i);
  });

  it("reconciles members on the happy path, skipping users without app access", async () => {
    setSession(ADMIN);
    mockDb.wfAppRole.findFirst
      .mockResolvedValueOnce({ id: "role1", appId: "app_flow" } as never) // route's role lookup
      .mockResolvedValueOnce(null); // guard's getAdminRoleId — not the admin role, no-op

    mockDb.$transaction.mockImplementation((async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb)) as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u_member" }] as never);
    mockDb.wfUserAppRole.deleteMany.mockResolvedValue({ count: 0 } as never);
    mockDb.wfUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.wfUserAppRole.create.mockResolvedValue({ id: "ur1" } as never);

    const res = await putMembers(
      req("/api/org/roles/role1/members", {
        method: "PUT",
        body: JSON.stringify({ userIds: ["u_member", "u_no_access"] }),
      }),
      { params: { id: "role1" } },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.attached).toBe(1);
    expect(body.data.skippedUserIds).toEqual(["u_no_access"]);
  });
});
