import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET as listRoles, POST as createRole } from "@/app/api/org/roles/route";
import { GET as getRole, PATCH as patchRole, DELETE as deleteRole } from "@/app/api/org/roles/[id]/route";
import { PUT as putPermissions } from "@/app/api/org/roles/[id]/permissions/route";

function req(url: string, init?: RequestInit) {
  return new NextRequest(new URL(url, "http://localhost"), init as ConstructorParameters<typeof NextRequest>[1]);
}

const ADMIN = { id: "u_admin", orgId: "org_A", membershipRole: "org_admin" };
const MEMBER = { id: "u_member", orgId: "org_A", membershipRole: "employee" };

beforeEach(() => resetMockDb());

// Every route in this file is gated by withOrgAuthForResource("Role"), which
// calls userCan() → app.findUnique + wfRolePermission.findFirst. Grant/deny
// helpers keep each test's intent readable.
function grantRolePermission() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app_flow" } as never);
  mockDb.wfRolePermission.findFirst.mockResolvedValue({ id: "rp1" } as never);
}
function denyRolePermission() {
  mockDb.app.findUnique.mockResolvedValue({ id: "app_flow" } as never);
  mockDb.wfRolePermission.findFirst.mockResolvedValue(null);
}

describe("GET /api/org/roles", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await listRoles(req("/api/org/roles"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("returns 403 when the caller lacks Role:view", async () => {
    setSession(MEMBER);
    denyRolePermission();
    const res = await listRoles(req("/api/org/roles"), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.wfAppRole.findMany).not.toHaveBeenCalled();
  });

  it("scopes the list query to the caller's org + the QuikFlow app (tenant isolation)", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findMany.mockResolvedValue([]);

    await listRoles(req("/api/org/roles"), { params: {} });

    const where = mockDb.wfAppRole.findMany.mock.calls[0][0]?.where;
    expect(where?.orgId).toBe("org_A");
    expect(where?.appId).toBe("app_flow");
  });

  it("returns the role list on the happy path", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findMany.mockResolvedValue([
      { id: "role1", name: "admin", description: null, isSystem: true, isDefault: false, _count: { permissions: 10, members: 1 } },
    ] as never);

    const res = await listRoles(req("/api/org/roles"), { params: {} });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("admin");
  });
});

describe("POST /api/org/roles", () => {
  it("returns 403 when the caller lacks Role:create", async () => {
    setSession(MEMBER);
    denyRolePermission();
    const res = await createRole(
      req("/api/org/roles", { method: "POST", body: JSON.stringify({ name: "QA" }) }),
      { params: {} },
    );
    expect(res.status).toBe(403);
    expect(mockDb.wfAppRole.create).not.toHaveBeenCalled();
  });

  it("returns 409 when a role with the same name already exists", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findUnique.mockResolvedValue({ id: "existing" } as never);

    const res = await createRole(
      req("/api/org/roles", { method: "POST", body: JSON.stringify({ name: "QA" }) }),
      { params: {} },
    );
    expect(res.status).toBe(409);
  });

  it("creates a role scoped to the caller's org on the happy path (201)", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findUnique.mockResolvedValue(null);
    mockDb.wfAppRole.create.mockResolvedValue({
      id: "role_new",
      name: "QA",
      description: null,
      isSystem: false,
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const res = await createRole(
      req("/api/org/roles", { method: "POST", body: JSON.stringify({ name: "QA" }) }),
      { params: {} },
    );
    expect(res.status).toBe(201);
    expect(mockDb.wfAppRole.create.mock.calls[0][0].data.orgId).toBe("org_A");
    expect(mockDb.wfAppRole.create.mock.calls[0][0].data.isSystem).toBe(false);
  });
});

describe("GET /api/org/roles/[id]", () => {
  it("returns 404 when the role belongs to another org (tenant isolation)", async () => {
    setSession(ADMIN);
    grantRolePermission();
    // findFirst is called with { id, orgId } — a cross-org id resolves to null.
    mockDb.wfAppRole.findFirst.mockResolvedValue(null);

    const res = await getRole(req("/api/org/roles/role_other_org"), {
      params: { id: "role_other_org" },
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/org/roles/[id]", () => {
  it("refuses to modify a system role", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findFirst.mockResolvedValue({ id: "role1", isSystem: true, name: "admin", appId: "app_flow" } as never);

    const res = await patchRole(
      req("/api/org/roles/role1", { method: "PATCH", body: JSON.stringify({ name: "renamed" }) }),
      { params: { id: "role1" } },
    );
    expect(res.status).toBe(400);
    expect(mockDb.wfAppRole.update).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/org/roles/[id]", () => {
  it("refuses to delete a system role", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findFirst.mockResolvedValue({
      id: "role1",
      isSystem: true,
      _count: { members: 3 },
    } as never);

    const res = await deleteRole(req("/api/org/roles/role1", { method: "DELETE" }), {
      params: { id: "role1" },
    });
    expect(res.status).toBe(400);
    expect(mockDb.wfAppRole.delete).not.toHaveBeenCalled();
  });

  it("deletes a non-system role and reports affected members", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findFirst.mockResolvedValue({
      id: "role2",
      isSystem: false,
      _count: { members: 2 },
    } as never);
    mockDb.wfAppRole.delete.mockResolvedValue({ id: "role2" } as never);

    const res = await deleteRole(req("/api/org/roles/role2", { method: "DELETE" }), {
      params: { id: "role2" },
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.affectedUsers).toBe(2);
  });
});

describe("PUT /api/org/roles/[id]/permissions", () => {
  beforeEach(() => {
    // Array-form db.$transaction([...]) — run every op and collect results.
    mockDb.$transaction.mockImplementation(((ops: Promise<unknown>[]) => Promise.all(ops)) as never);
  });

  it("rejects an unknown resource", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findFirst.mockResolvedValue({ id: "role1", isSystem: false } as never);

    const res = await putPermissions(
      req("/api/org/roles/role1/permissions", {
        method: "PUT",
        body: JSON.stringify({ permissions: [{ resource: "NotAResource", action: "view" }] }),
      }),
      { params: { id: "role1" } },
    );
    expect(res.status).toBe(400);
  });

  it("replaces the role's permission set atomically on the happy path", async () => {
    setSession(ADMIN);
    grantRolePermission();
    mockDb.wfAppRole.findFirst.mockResolvedValue({ id: "role1", isSystem: false } as never);
    mockDb.wfRolePermission.deleteMany.mockResolvedValue({ count: 0 } as never);
    mockDb.wfRolePermission.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await putPermissions(
      req("/api/org/roles/role1/permissions", {
        method: "PUT",
        body: JSON.stringify({ permissions: [{ resource: "Workflows", action: "view" }] }),
      }),
      { params: { id: "role1" } },
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.count).toBe(1);
  });
});
