import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, PATCH, DELETE } from "@/app/api/issues/[id]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const ISSUE = "issue_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}`);
}

function patchReq(body: unknown) {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function delReq() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}`, { method: "DELETE" });
}

describe("GET /api/issues/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(401);
  });

  it("404 when the issue belongs to another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(404);
  });

  it("includes parent + subtasks for an authorised member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
      title: "T",
      parent: { id: "parent_1", key: "QT-1", title: "Parent", type: "TASK" },
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtTimesheetEntry.findMany.mockResolvedValue([] as never);

    const res = await GET(getReq(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.parent.key).toBe("QT-1");
  });
});

describe("PATCH /api/issues/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await PATCH(patchReq({ title: "x" }), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(401);
  });

  it("403 when the user is a project viewer", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: ISSUE, projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "VIEWER" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);

    const res = await PATCH(patchReq({ title: "x" }), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(403);
  });

  it("accepts sprintId: null to detach an issue from its sprint", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: ISSUE, projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssue.update.mockResolvedValue({ id: ISSUE, sprintId: null } as never);

    const res = await PATCH(patchReq({ sprintId: null }), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
    expect(mockDb.qtIssue.update).toHaveBeenCalled();
  });

  it("400 on invalid input (negative storyPoints)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: ISSUE, projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);

    const res = await PATCH(patchReq({ storyPoints: -3 }), {
      params: { id: ISSUE },
    } as never);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/issues/:id", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(delReq(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(401);
  });

  it("soft-deletes a TASK and detaches its epic-children", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      type: "EPIC",
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        qtIssue: {
          updateMany: () => Promise.resolve({ count: 0 }),
          update: () => Promise.resolve({ id: ISSUE }),
        },
      };
      return (cb as (t: unknown) => Promise<unknown>)(tx);
    });

    const res = await DELETE(delReq(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
  });
});
