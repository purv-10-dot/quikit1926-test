import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/issues/bulk-delete/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

const ROUTE_CTX = { params: {} } as never;

function postReq(ids: string[]) {
  return new NextRequest("http://localhost/api/issues/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ projectId: PROJECT, ids }),
    headers: { "Content-Type": "application/json" },
  });
}

/** Wire mocks for a non-admin project member who is NOT a Space Admin. */
function asContributor() {
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  // hasAdminAccess → false
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
  mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
  // is a member
  mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m1" } as never);
  // Contributor role → no Issue:delete grant
  mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
    projectRoleId: "contrib_role",
    projectRole: { name: "Contributor" },
  } as never);
  mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
  mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
}

describe("POST /api/issues/bulk-delete", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq(["a"]), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the caller is not a project member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null);

    const res = await POST(postReq(["a", "b"]), ROUTE_CTX);
    expect(res.status).toBe(404);
    expect(mockDb.qtIssue.updateMany).not.toHaveBeenCalled();
  });

  it("admin (full access) deletes every selected issue", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never); // hasAdminAccess
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "a", reporterId: "x", createdBy: "x" },
      { id: "b", reporterId: "y", createdBy: "y" },
    ] as never);
    mockDb.qtIssue.updateMany.mockResolvedValue({ count: 2 } as never);

    const res = await POST(postReq(["a", "b"]), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, deleted: 2, skipped: 0 });
  });

  // The core ask: a Contributor's bulk delete removes only their own items;
  // teammates' items in the selection are skipped, never deleted.
  it("Contributor deletes only owned items and skips others", async () => {
    asContributor();
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "mine", reporterId: USER, createdBy: "someone" }, // owned (reporter)
      { id: "mine2", reporterId: "someone", createdBy: USER }, // owned (creator)
      { id: "theirs", reporterId: "other", createdBy: "other" }, // not owned
    ] as never);
    mockDb.qtIssue.updateMany.mockResolvedValue({ count: 2 } as never);

    const res = await POST(postReq(["mine", "mine2", "theirs"]), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, deleted: 2, skipped: 1 });
    // Only the two owned ids are passed to updateMany.
    const call = mockDb.qtIssue.updateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
    };
    expect(call.where.id.in.sort()).toEqual(["mine", "mine2"]);
  });

  it("Contributor selecting only others' items deletes nothing", async () => {
    asContributor();
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "theirs", reporterId: "other", createdBy: "other" },
    ] as never);

    const res = await POST(postReq(["theirs"]), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, deleted: 0, skipped: 1 });
    expect(mockDb.qtIssue.updateMany).not.toHaveBeenCalled();
  });
});
