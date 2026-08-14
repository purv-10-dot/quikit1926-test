import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PATCH, DELETE } from "@/app/api/releases/[id]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";
const RELEASE = "rel_1";

const ROUTE_CTX = { params: { id: RELEASE } } as never;

const RELEASE_ROW = {
  id: RELEASE,
  projectId: PROJECT,
  name: "1.0",
  status: "UNRELEASED",
  releasedAt: null,
  archivedAt: null,
  approvers: [],
  relatedLinks: [],
  _count: { issues: 0 },
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/releases/${RELEASE}`);
}
function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/releases/${RELEASE}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function delReq() {
  return new NextRequest(`http://localhost/api/releases/${RELEASE}`, { method: "DELETE" });
}

describe("GET /api/releases/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the release is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtRelease.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  it("returns the release for a project member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtRelease.findFirst.mockResolvedValue(RELEASE_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "pm_1" } as never);
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/releases/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(patchReq({ name: "2.0" }), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("403 when a project Viewer (no Release:update) attempts to edit", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtRelease.findFirst.mockResolvedValue(RELEASE_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await PATCH(patchReq({ name: "2.0" }), ROUTE_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtRelease.update).not.toHaveBeenCalled();
  });

  it("updates the release for an admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtRelease.findFirst.mockResolvedValue(RELEASE_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtRelease.update.mockResolvedValue({ ...RELEASE_ROW, name: "2.0" } as never);

    const res = await PATCH(patchReq({ name: "2.0" }), ROUTE_CTX);
    expect(res.status).toBe(200);
    expect(mockDb.qtRelease.update).toHaveBeenCalled();
  });
});

describe("DELETE /api/releases/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(delReq(), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("soft-deletes the release for an admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtRelease.findFirst.mockResolvedValue(RELEASE_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtRelease.update.mockResolvedValue({ ...RELEASE_ROW, isDeleted: true } as never);

    const res = await DELETE(delReq(), ROUTE_CTX);
    expect(res.status).toBe(200);
    expect(mockDb.qtRelease.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isDeleted: true }) }),
    );
  });
});
