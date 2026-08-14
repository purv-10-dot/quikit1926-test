import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/releases/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function listReq(qs = `?projectId=${PROJECT}`) {
  return new NextRequest(`http://localhost/api/releases${qs}`);
}

function createReq(body: unknown) {
  return new NextRequest("http://localhost/api/releases", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/releases", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(listReq());
    expect(res.status).toBe(401);
  });

  it("404 when the project is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await GET(listReq());
    expect(res.status).toBe(404);
  });

  it("lists releases with progress counts for a project member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "pm_1" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtRelease.findMany.mockResolvedValue([
      { id: "rel_1", projectId: PROJECT, name: "1.0", status: "UNRELEASED", _count: { relatedLinks: 0 } },
    ] as never);
    mockDb.qtIssueRelease.findMany.mockResolvedValue([
      { releaseId: "rel_1", issue: { statusId: "status_done", isDeleted: false } },
    ] as never);
    mockDb.qtIssueStatus.findMany.mockResolvedValue([
      { id: "status_done", category: "DONE" },
    ] as never);

    const res = await GET(listReq());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data[0].counts.done).toBe(1);
  });
});

describe("POST /api/releases", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(createReq({ projectId: PROJECT, name: "1.0" }));
    expect(res.status).toBe(401);
  });

  it("404 when the project is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await POST(createReq({ projectId: PROJECT, name: "1.0" }));
    expect(res.status).toBe(404);
  });

  it("403 when a project Viewer (no Release:create) attempts to create a release", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "VIEWER" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await POST(createReq({ projectId: PROJECT, name: "1.0" }));
    expect(res.status).toBe(403);
    expect(mockDb.qtRelease.create).not.toHaveBeenCalled();
  });

  it("creates a release for an admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "PROJECT_ADMIN" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtRelease.create.mockResolvedValue({ id: "rel_1", name: "1.0" } as never);

    const res = await POST(createReq({ projectId: PROJECT, name: "1.0" }));
    expect(res.status).toBe(201);
    expect(mockDb.qtRelease.create).toHaveBeenCalled();
  });
});
