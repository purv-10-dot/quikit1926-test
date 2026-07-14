import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

vi.mock("@/lib/api/seedAppRoles", () => ({
  seedAdminAppRole: vi.fn(async () => "admin-role"),
  ensureUserOnRole: vi.fn(async () => {}),
}));

import { GET as getUser, PATCH as patchUser, DELETE as deleteUser } from "@/app/api/org/users/[id]/route";
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

  // ─── PATCH linked-employee fields (Phase 6a) ───
  it("PATCH updates the linked employee's directory fields", async () => {
    asAdmin();
    mockDb.orgMember.findUnique.mockResolvedValue({ id: "m1" } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue({ id: "emp1" } as never);
    mockDb.astEmployee.update.mockResolvedValue({} as never);
    mockDb.user.findUnique.mockResolvedValue({
      id: "target", firstName: "A", lastName: "B", email: "a@x.com", lastSignInAt: null,
    } as never);

    const res = await patchUser(
      makeReq("/api/org/users/target", { method: "PATCH", body: { department: "Ops", contact: "123" } }),
      P,
    );
    expect(res.status).toBe(200);
    const arg = mockDb.astEmployee.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { department: string; contact: string };
    };
    expect(arg.where.id).toBe("emp1");
    expect(arg.data.department).toBe("Ops");
    expect(arg.data.contact).toBe("123");
  });

  it("PATCH creates + links an employee for a legacy login that has none", async () => {
    asAdmin();
    mockDb.orgMember.findUnique.mockResolvedValue({ id: "m1" } as never);
    mockDb.astEmployee.findFirst.mockResolvedValue(null as never); // no employee anywhere
    mockDb.astEmployee.findMany.mockResolvedValue([] as never); // employeeId generation
    mockDb.astEmployee.create.mockResolvedValue({} as never);
    mockDb.user.findUnique
      .mockResolvedValueOnce({ email: "a@x.com", firstName: "A", lastName: "B" } as never) // create-fallback lookup
      .mockResolvedValueOnce({ id: "target", firstName: "A", lastName: "B", email: "a@x.com", lastSignInAt: null } as never); // response

    const res = await patchUser(
      makeReq("/api/org/users/target", { method: "PATCH", body: { department: "Ops" } }),
      P,
    );
    expect(res.status).toBe(200);
    expect(mockDb.astEmployee.create).toHaveBeenCalledOnce();
    const arg = mockDb.astEmployee.create.mock.calls[0]?.[0] as {
      data: { userId: string; department: string | null };
    };
    expect(arg.data.userId).toBe("target"); // linked to the login
    expect(arg.data.department).toBe("Ops");
  });

  // ─── DELETE = remove from QuikAsset (Phase 6a) ───
  it("DELETE 401s when unauthenticated", async () => {
    setSession(null);
    const res = await deleteUser(makeReq("/api/org/users/target", { method: "DELETE" }), P);
    expect(res.status).toBe(401);
  });

  it("DELETE 404s (isolation) when the target is not a member of the caller's org", async () => {
    asAdmin("org-A");
    mockDb.orgMember.findUnique.mockResolvedValue(null as never);
    const res = await deleteUser(makeReq("/api/org/users/target", { method: "DELETE" }), P);
    expect(res.status).toBe(404);
  });

  it("DELETE soft-removes the user (records a marker) and hard-deletes nothing", async () => {
    asAdmin();
    mockDb.orgMember.findUnique.mockResolvedValue({
      user: { firstName: "Al", lastName: "Ice", email: "a@x.com" },
    } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { role: { id: "r1", isSystem: false, name: "Member" } },
    ] as never); // not admin → lockout guard passes
    mockDb.astUserRemoval.upsert.mockResolvedValue({} as never);

    const res = await deleteUser(makeReq("/api/org/users/target", { method: "DELETE" }), P);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.data.removed).toBe(true);
    // Records the removal marker…
    expect(mockDb.astUserRemoval.upsert).toHaveBeenCalledOnce();
    const arg = mockDb.astUserRemoval.upsert.mock.calls[0]?.[0] as {
      where: { orgId_userId: { orgId: string; userId: string } };
    };
    expect(arg.where.orgId_userId).toEqual({ orgId: "org1", userId: "target" });
    // …and hard-deletes NOTHING.
    expect(mockDb.astUserAppRole.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.userAppAccess.deleteMany).not.toHaveBeenCalled();
    expect(mockDb.astEmployee.delete).not.toHaveBeenCalled();
    expect(mockDb.user.delete).not.toHaveBeenCalled();
    expect(mockDb.orgMember.delete).not.toHaveBeenCalled();
  });

  it("DELETE 409s when it would remove the last admin", async () => {
    asAdmin();
    mockDb.orgMember.findUnique.mockResolvedValue({
      user: { firstName: "Ad", lastName: "Min", email: "admin@x.com" },
    } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([
      { role: { id: "admin-role", isSystem: true, name: "admin" } },
    ] as never);
    mockDb.astUserAppRole.count.mockResolvedValue(1 as never); // the only admin

    const res = await deleteUser(makeReq("/api/org/users/target", { method: "DELETE" }), P);

    expect(res.status).toBe(409);
    // Guard fires before any removal is recorded.
    expect(mockDb.astUserRemoval.upsert).not.toHaveBeenCalled();
  });
});
