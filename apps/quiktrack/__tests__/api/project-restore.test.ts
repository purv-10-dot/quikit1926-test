import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { POST } from "@/app/api/projects/[id]/restore/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function postReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/restore`, {
    method: "POST",
  });
}

describe("POST /api/projects/:id/restore — admin-only", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(401);
  });

  it("403 for a non-admin member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);

    const res = await POST(postReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(403);
    expect(mockDb.qtProject.update).not.toHaveBeenCalled();
  });

  it("404 when the project isn't in the trash", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    const res = await POST(postReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(404);
  });

  it("restores a trashed project to active for an admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProject.update.mockResolvedValue({ id: PROJECT } as never);

    const res = await POST(postReq(), { params: { id: PROJECT } } as never);
    expect(res.status).toBe(200);
    const updateArg = mockDb.qtProject.update.mock.calls[0]?.[0] as {
      data: { isDeleted: boolean; status: string };
    };
    expect(updateArg.data.isDeleted).toBe(false);
    expect(updateArg.data.status).toBe("active");
  });

  it("scopes the trash lookup to the caller's org (tenant isolation)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    await POST(postReq(), { params: { id: PROJECT } } as never);
    const findArg = mockDb.qtProject.findFirst.mock.calls[0]?.[0] as {
      where: { orgId: string; isDeleted: boolean };
    };
    expect(findArg.where.orgId).toBe(TENANT);
    expect(findArg.where.isDeleted).toBe(true);
  });
});
