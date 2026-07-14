import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

vi.mock("@/lib/api/seedAppRoles", () => ({
  seedAdminAppRole: vi.fn(async () => "admin-role"),
  ensureUserOnRole: vi.fn(async () => {}),
}));

import { GET as getUser, PATCH as patchUser } from "@/app/api/org/users/[id]/route";
import { PATCH as patchRole } from "@/app/api/org/users/[id]/role/route";
import { PATCH as patchStatus } from "@/app/api/org/users/[id]/status/route";
import { GET as getPerms, PUT as putPerms } from "@/app/api/org/users/[id]/permissions/route";

const P = { params: { id: "target" } };

/** requireAdmin passes when the caller has an active admin-tier membership. */
function asAdmin(orgId = "org1") {
  setSession({ id: "admin", orgId, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({ id: "cm", role: "admin" } as never);
}

describe("/api/org/users/[id] route family", () => {
  beforeEach(() => resetMockDb());

  it("GET 401s when unauthenticated", async () => {
    setSession(null);
    const res = await getUser(makeReq("/api/org/users/target"), P);
    expect(res.status).toBe(401);
  });

  it("GET returns a member's editable state", async () => {
    asAdmin();
    mockDb.orgMember.findUnique.mockResolvedValue({
      status: "active",
      user: { id: "target", firstName: "Al", lastName: "Ice", email: "a@x.com", lastSignInAt: null },
    } as never);

    const res = await getUser(makeReq("/api/org/users/target"), P);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.email).toBe("a@x.com");
    expect(json.data.status).toBe("active");
  });

  it("GET 404s (isolation) when the target is not a member of the caller's org", async () => {
    asAdmin("org-A");
    mockDb.orgMember.findUnique.mockResolvedValue(null as never);

    const res = await getUser(makeReq("/api/org/users/target"), P);
    expect(res.status).toBe(404);
    const call = mockDb.orgMember.findUnique.mock.calls[0]?.[0] as {
      where: { orgId_userId: { orgId: string } };
    };
    expect(call.where.orgId_userId.orgId).toBe("org-A");
  });

  it("PATCH updates platform fields + status", async () => {
    asAdmin();
    mockDb.orgMember.findUnique.mockResolvedValue({ id: "m1" } as never);
    mockDb.user.update.mockResolvedValue({} as never);
    mockDb.orgMember.update.mockResolvedValue({} as never);
    mockDb.user.findUnique.mockResolvedValue({
      id: "target", firstName: "New", lastName: "Name", email: "a@x.com", lastSignInAt: null,
    } as never);

    const res = await patchUser(
      makeReq("/api/org/users/target", { method: "PATCH", body: { firstName: "New", status: "inactive" } }),
      P,
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.firstName).toBe("New");
  });

  it("role PATCH 401s when unauthenticated", async () => {
    setSession(null);
    const res = await patchRole(makeReq("/api/org/users/target/role", { method: "PATCH", body: { roleId: "r1" } }), P);
    expect(res.status).toBe(401);
  });

  it("role PATCH assigns an app role", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findFirst.mockResolvedValue({ id: "a1" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({ id: "role1" } as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.astAppRole.findUnique.mockResolvedValue({ id: "role1", name: "Custom", isSystem: false } as never);
    mockDb.astUserAppRole.deleteMany.mockResolvedValue({ count: 0 } as never);

    const res = await patchRole(
      makeReq("/api/org/users/target/role", { method: "PATCH", body: { roleId: "role1" } }),
      P,
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.appRoleId).toBe("role1");
  });

  it("role PATCH rejects unsetting a role (roleId: null) — a user can never be left role-less", async () => {
    asAdmin();

    const res = await patchRole(
      makeReq("/api/org/users/target/role", { method: "PATCH", body: { roleId: null } }),
      P,
    );

    expect(res.status).toBe(400);
    // Rejected at validation, before any role row is deleted/reassigned.
    expect(mockDb.astUserAppRole.deleteMany).not.toHaveBeenCalled();
  });

  it("role PATCH rejects an empty roleId", async () => {
    asAdmin();

    const res = await patchRole(
      makeReq("/api/org/users/target/role", { method: "PATCH", body: { roleId: "" } }),
      P,
    );

    expect(res.status).toBe(400);
    expect(mockDb.astUserAppRole.deleteMany).not.toHaveBeenCalled();
  });

  it("role PATCH 409s when the target lacks QuikAsset access", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.userAppAccess.findFirst.mockResolvedValue(null as never);

    const res = await patchRole(
      makeReq("/api/org/users/target/role", { method: "PATCH", body: { roleId: "role1" } }),
      P,
    );
    expect(res.status).toBe(409);
  });

  it("status PATCH toggles membership status", async () => {
    asAdmin();
    mockDb.orgMember.findUnique.mockResolvedValue({ id: "m1" } as never);
    mockDb.orgMember.update.mockResolvedValue({ id: "m1", userId: "target", status: "inactive" } as never);

    const res = await patchStatus(
      makeReq("/api/org/users/target/status", { method: "PATCH", body: { status: "inactive" } }),
      P,
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.status).toBe("inactive");
  });

  it("permissions GET returns role grants + extras + effective", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.orgMember.findUnique.mockResolvedValue({ userId: "target" } as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { role: { id: "r1", name: "Member", permissions: [{ resource: "Asset", action: "view" }] } },
    ] as never);
    mockDb.astUserPermissionExtra.findMany.mockResolvedValue([{ resource: "Report", action: "view" }] as never);

    const res = await getPerms(makeReq("/api/org/users/target/permissions"), P);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.roleGrants).toContainEqual({ resource: "Asset", action: "view" });
    expect(json.data.extras).toContainEqual({ resource: "Report", action: "view" });
  });

  it("permissions PUT saves valid extras and drops invalid pairs", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.orgMember.findUnique.mockResolvedValue({ userId: "target" } as never);
    mockDb.$transaction.mockResolvedValue([] as never);

    const res = await putPerms(
      makeReq("/api/org/users/target/permissions", {
        method: "PUT",
        body: { extras: [{ resource: "Asset", action: "create" }, { resource: "Bogus", action: "nope" }] },
      }),
      P,
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.count).toBe(1); // Bogus:nope filtered out
  });
});
