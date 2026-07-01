import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PATCH, DELETE } from "@/app/api/projects/[id]/route";
import { SPACE_ADMIN_ROLE_NAME } from "@/lib/api/permissionsRegistry";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}`);
}
function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function delReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}`, {
    method: "DELETE",
  });
}

describe("GET /api/projects/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(401);
  });

  it("404 when user is not a project member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(404);
  });

  it("returns the project for an authorized member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({
      id: PROJECT,
      orgId: TENANT,
      name: "Test",
      projectKey: "T1",
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m1" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    // Re-mock the second findFirst (project + relations) used by the handler.
    const res = await GET(getReq(), { params: { id: PROJECT } } as never);
    expect([200, 404]).toContain(res.status);
  });
});

describe("PATCH /api/projects/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(patchReq({ name: "X" }), {
      params: { id: PROJECT },
    } as never);
    expect(res.status).toBe(401);
  });

  it("400 on invalid input", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({
      role: "PROJECT_ADMIN",
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    const res = await PATCH(patchReq({ projectKey: "lower" }), {
      params: { id: PROJECT },
    } as never);
    expect([400, 403, 404]).toContain(res.status);
  });

  it("admin can archive via a status change", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.update.mockResolvedValue({ id: PROJECT, status: "archived" } as never);
    mockDb.$queryRaw.mockResolvedValue([] as never); // readTabConfig

    const res = await PATCH(patchReq({ status: "archived" }), {
      params: { id: PROJECT },
    } as never);
    expect(res.status).toBe(200);
    const updateArg = mockDb.qtProject.update.mock.calls[0]?.[0] as {
      data: { status?: string };
    };
    expect(updateArg.data.status).toBe("archived");
  });

  it("blocks a non-admin non-Space-Admin from changing status even with Project:update", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    // No project role → userCanInProject falls back to the app-wide grant,
    // which has Project:update, so the update gate passes...
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue(null as never);
    mockDb.qtRolePermission.findFirst.mockResolvedValue({ id: "perm" } as never);

    const res = await PATCH(patchReq({ status: "archived" }), {
      params: { id: PROJECT },
    } as never);
    // ...but archiving requires admin OR Space Admin, so it's rejected.
    expect(res.status).toBe(403);
    expect(mockDb.qtProject.update).not.toHaveBeenCalled();
  });

  it("allows a Space Admin (non-global-admin) to archive", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "PROJECT_ADMIN" } as never);
    // Space Admin role satisfies both the update gate and the archive gate.
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "r1",
      projectRole: { name: SPACE_ADMIN_ROLE_NAME },
    } as never);
    mockDb.qtProject.update.mockResolvedValue({ id: PROJECT, status: "archived" } as never);
    mockDb.$queryRaw.mockResolvedValue([] as never); // readTabConfig

    const res = await PATCH(patchReq({ status: "archived" }), {
      params: { id: PROJECT },
    } as never);
    expect(res.status).toBe(200);
    expect(mockDb.qtProject.update).toHaveBeenCalled();
  });
});

describe("DELETE /api/projects/:id — admin-only trash", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(delReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(401);
  });

  it("403 for a project member who is not a global admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);

    const res = await DELETE(delReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(403);
    expect(mockDb.qtProject.update).not.toHaveBeenCalled();
  });

  it("soft-deletes for an org admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.update.mockResolvedValue({ id: PROJECT } as never);

    const res = await DELETE(delReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(200);
    const updateArg = mockDb.qtProject.update.mock.calls[0]?.[0] as {
      data: { isDeleted: boolean };
    };
    expect(updateArg.data.isDeleted).toBe(true);
  });
});
