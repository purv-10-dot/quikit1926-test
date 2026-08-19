import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST, DELETE } from "@/app/api/releases/[id]/issues/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";
const RELEASE = "rel_1";

const ROUTE_CTX = { params: { id: RELEASE } } as never;

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function postReq(body: unknown) {
  return new NextRequest(`http://localhost/api/releases/${RELEASE}/issues`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function delReq(issueId: string) {
  return new NextRequest(`http://localhost/api/releases/${RELEASE}/issues?issueId=${issueId}`, {
    method: "DELETE",
  });
}

describe("POST /api/releases/:id/issues", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq({ issueIds: ["issue_1"] }), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the release is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtRelease.findFirst.mockResolvedValue(null);
    const res = await POST(postReq({ issueIds: ["issue_1"] }), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  it("403 when a project Viewer (no Release:update) attempts to attach", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtRelease.findFirst.mockResolvedValue({ id: RELEASE, projectId: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "viewer_role",
      projectRole: { name: "Viewer" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await POST(postReq({ issueIds: ["issue_1"] }), ROUTE_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtIssueRelease.createMany).not.toHaveBeenCalled();
  });

  it("attaches valid project issues for an admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtRelease.findFirst.mockResolvedValue({ id: RELEASE, projectId: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "issue_1" }] as never);
    mockDb.qtIssueRelease.createMany.mockResolvedValue({ count: 1 } as never);

    const res = await POST(postReq({ issueIds: ["issue_1"] }), ROUTE_CTX);
    expect(res.status).toBe(201);
    expect(mockDb.qtIssueRelease.createMany).toHaveBeenCalled();
  });
});

describe("DELETE /api/releases/:id/issues", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(delReq("issue_1"), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("detaches an issue for an admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtRelease.findFirst.mockResolvedValue({ id: RELEASE, projectId: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtIssueRelease.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await DELETE(delReq("issue_1"), ROUTE_CTX);
    expect(res.status).toBe(200);
    expect(mockDb.qtIssueRelease.deleteMany).toHaveBeenCalledWith({
      where: { releaseId: RELEASE, issueId: "issue_1" },
    });
  });
});
