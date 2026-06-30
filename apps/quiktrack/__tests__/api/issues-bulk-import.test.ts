import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/issues/bulk-import/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function importReq(body: unknown) {
  return new NextRequest("http://localhost/api/issues/bulk-import", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const ROUTE_CTX = { params: {} } as never;
const VALID_BODY = { projectId: PROJECT, rows: [{ title: "Imported issue" }] };

describe("POST /api/issues/bulk-import", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(importReq(VALID_BODY), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the project is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await POST(importReq(VALID_BODY), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  // Regression: a Viewer is a project member but has no Issue:create grant.
  // Before the fix, the route only checked membership, so Viewers could import.
  it("403 when a project Viewer (no Issue:create) attempts to import", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({
      id: PROJECT,
      projectKey: "QT",
    } as never);
    // hasAdminAccess → not an org-tier admin, not an app-admin.
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    // userCanInProject → holds the "Viewer" project role here…
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    // …which grants no Issue:create, and no per-user extra either.
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await POST(importReq(VALID_BODY), ROUTE_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtIssue.createMany).not.toHaveBeenCalled();
  });

  it("imports issues for an admin (Issue:create allowed)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtProject.findFirst.mockResolvedValue({
      id: PROJECT,
      projectKey: "QT",
    } as never);
    // hasAdminAccess → org owner short-circuits userCanInProject to allowed.
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssueStatus.findMany.mockResolvedValue([
      { id: "status_1", name: "To Do" },
    ] as never);
    mockDb.qtProjectMember.findMany.mockResolvedValue([] as never);
    mockDb.user.findMany.mockResolvedValue([] as never);
    mockDb.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        qtIssue: {
          count: () => Promise.resolve(0),
          createMany: () => Promise.resolve({ count: 1 }),
        },
      };
      return (cb as (t: unknown) => Promise<unknown>)(tx);
    });

    const res = await POST(importReq(VALID_BODY), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, created: 1 });
  });
});
