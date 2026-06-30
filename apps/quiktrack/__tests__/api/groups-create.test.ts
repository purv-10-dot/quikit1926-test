import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/projects/[id]/groups/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function createReq(body: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/groups`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const ROUTE_CTX = { params: { id: PROJECT } } as never;
const VALID_BODY = { name: "My group" };

describe("POST /api/projects/[id]/groups", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(createReq(VALID_BODY), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the project is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await POST(createReq(VALID_BODY), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  // Regression: a Viewer is a project member but has no Issue:update grant.
  // Group management used to be open to any member (canWriteGroups returned
  // true), so Viewers could create/rename/delete groups. Now it's gated.
  it("403 when a project Viewer (no Issue:update) creates a group", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    // Not an org-tier admin, not an app-admin.
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    // Project member holding the read-only "Viewer" role here…
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "VIEWER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    // …which grants no Issue:update, and no per-user extra either.
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await POST(createReq(VALID_BODY), ROUTE_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtTaskGroup.create).not.toHaveBeenCalled();
  });

  it("creates a group for an admin (full access)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    // Org owner → loadProjectAccess returns isTenantAdmin, canWriteGroups passes.
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    // ensureDefaultGroup finds an existing default; nextGroupOrder reads it too.
    mockDb.qtTaskGroup.findFirst.mockResolvedValue({
      id: "default_group",
      order: 0,
    } as never);
    mockDb.qtTaskGroup.create.mockResolvedValue({
      id: "group_1",
      name: "My group",
    } as never);

    const res = await POST(createReq(VALID_BODY), ROUTE_CTX);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, data: { id: "group_1" } });
  });
});
