import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/releases/[id]/approvers/route";
import { DELETE, PATCH } from "@/app/api/releases/[id]/approvers/[approverId]/route";

const USER = "user_1";
const OTHER_USER = "user_2";
const TENANT = "tenant_1";
const PROJECT = "proj_1";
const RELEASE = "rel_1";
const APPROVER = "appr_1";

const ADD_CTX = { params: { id: RELEASE } } as never;
const ACT_CTX = { params: { id: RELEASE, approverId: APPROVER } } as never;

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function addReq(body: unknown) {
  return new NextRequest(`http://localhost/api/releases/${RELEASE}/approvers`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function delReq() {
  return new NextRequest(`http://localhost/api/releases/${RELEASE}/approvers/${APPROVER}`, {
    method: "DELETE",
  });
}
function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/releases/${RELEASE}/approvers/${APPROVER}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/releases/:id/approvers", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(addReq({ userId: OTHER_USER }), ADD_CTX);
    expect(res.status).toBe(401);
  });

  it("403 when a project Viewer (no ReleaseApprover:create) attempts to add", async () => {
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

    const res = await POST(addReq({ userId: OTHER_USER }), ADD_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtReleaseApprover.upsert).not.toHaveBeenCalled();
  });

  it("adds an approver for an admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtRelease.findFirst.mockResolvedValue({ id: RELEASE, projectId: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "pm_1" } as never);
    mockDb.qtReleaseApprover.upsert.mockResolvedValue({ id: APPROVER, userId: OTHER_USER } as never);

    const res = await POST(addReq({ userId: OTHER_USER }), ADD_CTX);
    expect(res.status).toBe(201);
    expect(mockDb.qtReleaseApprover.upsert).toHaveBeenCalled();
  });
});

describe("DELETE /api/releases/:id/approvers/:approverId", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(delReq(), ACT_CTX);
    expect(res.status).toBe(401);
  });

  it("removes an approver for an admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtRelease.findFirst.mockResolvedValue({ id: RELEASE, projectId: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
    mockDb.qtReleaseApprover.deleteMany.mockResolvedValue({ count: 1 } as never);

    const res = await DELETE(delReq(), ACT_CTX);
    expect(res.status).toBe(200);
    expect(mockDb.qtReleaseApprover.deleteMany).toHaveBeenCalled();
  });
});

describe("PATCH /api/releases/:id/approvers/:approverId (approver self-action)", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(patchReq({ status: "APPROVED" }), ACT_CTX);
    expect(res.status).toBe(401);
  });

  it("403 when a user tries to act on someone else's approval row", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtRelease.findFirst.mockResolvedValue({ id: RELEASE, projectId: PROJECT } as never);
    mockDb.qtReleaseApprover.findFirst.mockResolvedValue({
      id: APPROVER,
      releaseId: RELEASE,
      userId: OTHER_USER,
      status: "PENDING",
    } as never);

    const res = await PATCH(patchReq({ status: "APPROVED" }), ACT_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtReleaseApprover.update).not.toHaveBeenCalled();
  });

  it("lets an approver record their own decision", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtRelease.findFirst.mockResolvedValue({ id: RELEASE, projectId: PROJECT } as never);
    mockDb.qtReleaseApprover.findFirst.mockResolvedValue({
      id: APPROVER,
      releaseId: RELEASE,
      userId: USER,
      status: "PENDING",
    } as never);
    mockDb.qtReleaseApprover.update.mockResolvedValue({
      id: APPROVER,
      status: "APPROVED",
    } as never);

    const res = await PATCH(patchReq({ status: "APPROVED", comment: "Looks good" }), ACT_CTX);
    expect(res.status).toBe(200);
    expect(mockDb.qtReleaseApprover.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "APPROVED", comment: "Looks good" }),
      }),
    );
  });
});
