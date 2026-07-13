import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET as listRoles, POST as createRole } from "@/app/api/org/roles/route";
import { GET as getRole, PATCH as patchRole, DELETE as deleteRole } from "@/app/api/org/roles/[id]/route";
import { GET as getPerms, PUT as putPerms } from "@/app/api/org/roles/[id]/permissions/route";
import { GET as getMembers, PUT as putMembers } from "@/app/api/org/roles/[id]/members/route";

const P = { params: { id: "role1" } };

function asAdmin(orgId = "org1") {
  setSession({ id: "admin", orgId, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({ id: "cm", role: "admin" } as never);
}

describe("/api/org/roles", () => {
  beforeEach(() => resetMockDb());

  it("GET 401s when unauthenticated", async () => {
    setSession(null);
    const res = await listRoles();
    expect(res.status).toBe(401);
  });

  it("GET lists roles scoped to the caller's org", async () => {
    asAdmin("org-A");
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findMany.mockResolvedValue([
      { id: "role1", name: "admin", isSystem: true, isDefault: false, _count: { permissions: 5, navigations: 0, members: 1 } },
    ] as never);

    const res = await listRoles();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    const call = mockDb.astAppRole.findMany.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org-A");
  });

  it("POST creates a new role", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findUnique.mockResolvedValue(null as never);
    mockDb.astAppRole.create.mockResolvedValue({ id: "new", name: "Manager", isSystem: false, isDefault: false } as never);

    const res = await createRole(makeReq("/api/org/roles", { method: "POST", body: { name: "Manager" } }));
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.data.name).toBe("Manager");
  });

  it("POST 409s on a duplicate role name", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findUnique.mockResolvedValue({ id: "existing" } as never);

    const res = await createRole(makeReq("/api/org/roles", { method: "POST", body: { name: "admin" } }));
    expect(res.status).toBe(409);
  });
});

describe("/api/org/roles/[id]", () => {
  beforeEach(() => resetMockDb());

  it("GET 404s (isolation) when the role isn't in the caller's org", async () => {
    asAdmin("org-A");
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue(null as never);

    const res = await getRole(makeReq("/api/org/roles/role1"), P);
    expect(res.status).toBe(404);
    const call = mockDb.astAppRole.findFirst.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org-A");
  });

  it("GET returns a role with its permissions", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({
      id: "role1", name: "Custom", permissions: [], navigations: [], _count: { members: 0 },
    } as never);

    const res = await getRole(makeReq("/api/org/roles/role1"), P);
    expect(res.status).toBe(200);
  });

  it("PATCH refuses to modify a system role", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({ id: "role1", isSystem: true, name: "admin", appId: "app" } as never);

    const res = await patchRole(
      makeReq("/api/org/roles/role1", { method: "PATCH", body: { name: "hacked" } }),
      P,
    );
    expect(res.status).toBe(400);
  });

  it("DELETE removes a non-system role and reports affected users", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({ id: "role1", isSystem: false, _count: { members: 2 } } as never);
    mockDb.astAppRole.delete.mockResolvedValue({} as never);

    const res = await deleteRole(makeReq("/api/org/roles/role1", { method: "DELETE" }), P);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.affectedUsers).toBe(2);
  });

  it("DELETE refuses to remove a system role", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({ id: "role1", isSystem: true, _count: { members: 0 } } as never);

    const res = await deleteRole(makeReq("/api/org/roles/role1", { method: "DELETE" }), P);
    expect(res.status).toBe(400);
  });
});

describe("/api/org/roles/[id]/permissions", () => {
  beforeEach(() => resetMockDb());

  it("GET 401s when unauthenticated", async () => {
    setSession(null);
    const res = await getPerms(makeReq("/api/org/roles/role1/permissions"), P);
    expect(res.status).toBe(401);
  });

  it("PUT replaces grants, dropping invalid pairs", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({ id: "role1" } as never);
    mockDb.$transaction.mockResolvedValue([] as never);

    const res = await putPerms(
      makeReq("/api/org/roles/role1/permissions", {
        method: "PUT",
        body: { permissions: [{ resource: "Asset", action: "create" }, { resource: "Nope", action: "x" }] },
      }),
      P,
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.count).toBe(1);
  });
});

describe("/api/org/roles/[id]/members", () => {
  beforeEach(() => resetMockDb());

  it("GET lists role members", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({ id: "role1", appId: "app" } as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.user.findMany.mockResolvedValue([{ id: "u1", firstName: "Al", lastName: "Ice", email: "a@x.com" }] as never);

    const res = await getMembers(makeReq("/api/org/roles/role1/members"), P);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.members).toHaveLength(1);
  });

  it("PUT reconciles membership, skipping users without app access", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({ id: "role1", appId: "app", isSystem: false, name: "Custom" } as never);
    // Run the interactive transaction against the same mock client.
    mockDb.$transaction.mockImplementation((async (cb: (tx: typeof mockDb) => unknown) => cb(mockDb)) as never);
    mockDb.userAppAccess.findMany.mockResolvedValue([{ userId: "u1" }] as never);
    mockDb.astUserAppRole.deleteMany.mockResolvedValue({ count: 0 } as never);
    mockDb.astUserAppRole.findMany.mockResolvedValue([] as never);
    mockDb.astUserAppRole.create.mockResolvedValue({} as never);

    const res = await putMembers(
      makeReq("/api/org/roles/role1/members", { method: "PUT", body: { userIds: ["u1", "u2"] } }),
      P,
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.attached).toBe(1);
    expect(json.data.skippedUserIds).toEqual(["u2"]);
  });

  it("PUT refuses to empty the admin role", async () => {
    asAdmin();
    mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
    mockDb.astAppRole.findFirst.mockResolvedValue({ id: "role1", appId: "app", isSystem: true, name: "admin" } as never);

    const res = await putMembers(
      makeReq("/api/org/roles/role1/members", { method: "PUT", body: { userIds: [] } }),
      P,
    );
    expect(res.status).toBe(409);
  });
});
