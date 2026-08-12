import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { hashPatToken } from "@/lib/api/patToken";
import { GET, POST } from "@/app/api/projects/[id]/pats/route";
import { DELETE } from "@/app/api/projects/[id]/pats/[patId]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

const ROUTE_CTX = { params: { id: PROJECT } } as never;

function postReq(body: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/pats`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function getReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/pats`);
}

const PAT_ROUTE_CTX = { params: { id: PROJECT, patId: "pat_1" } } as never;

function deleteReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/pats/pat_1`, { method: "DELETE" });
}

function asOrgOwner() {
  setSession({ id: USER, orgId: TENANT, role: "owner" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("POST /api/projects/[id]/pats", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq({ name: "Claude Code", expiresInDays: 30 }), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("403 when a Contributor (no Project:update) creates a PAT", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "contrib_role",
      projectRole: { name: "Contributor" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await POST(postReq({ name: "Claude Code", expiresInDays: 30 }), ROUTE_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();
  });

  it("400 when expiresInDays is missing", async () => {
    asOrgOwner();
    const res = await POST(postReq({ name: "Claude Code" }), ROUTE_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();
  });

  it("400 when expiresInDays exceeds the 1-year cap", async () => {
    asOrgOwner();
    const res = await POST(postReq({ name: "Claude Code", expiresInDays: 400 }), ROUTE_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();
  });

  it("400 when name is missing or blank", async () => {
    asOrgOwner();
    const res = await POST(postReq({ expiresInDays: 30 }), ROUTE_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();

    const res2 = await POST(postReq({ name: "   ", expiresInDays: 30 }), ROUTE_CTX);
    expect(res2.status).toBe(400);
    expect(mockDb.qtPersonalAccessToken.create).not.toHaveBeenCalled();
  });

  it("creates a PAT and returns the raw token exactly once", async () => {
    asOrgOwner();
    mockDb.qtPersonalAccessToken.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "pat_1",
          name: data.name as string,
          expiresAt: data.expiresAt as Date,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        }) as never,
    );

    const res = await POST(postReq({ name: "Claude Code — laptop", expiresInDays: 30 }), ROUTE_CTX);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.id).toBe("pat_1");
    expect(json.data.name).toBe("Claude Code — laptop");
    expect(typeof json.data.token).toBe("string");
    expect(json.data.token.length).toBeGreaterThan(0);

    const createCall = mockDb.qtPersonalAccessToken.create.mock.calls[0][0] as {
      data: { orgId: string; projectId: string; createdById: string; name: string; tokenHash: string; expiresAt: Date };
    };
    expect(createCall.data.orgId).toBe(TENANT);
    expect(createCall.data.projectId).toBe(PROJECT);
    expect(createCall.data.createdById).toBe(USER);
    expect(createCall.data.name).toBe("Claude Code — laptop");
    expect(createCall.data.tokenHash).toBe(hashPatToken(json.data.token));
    const daysUntilExpiry = (createCall.data.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(daysUntilExpiry).toBeGreaterThan(29);
    expect(daysUntilExpiry).toBeLessThan(31);
  });
});

describe("GET /api/projects/[id]/pats", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("403 when a Contributor (no Project:update) lists PATs", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "contrib_role",
      projectRole: { name: "Contributor" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);

    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(403);
  });

  it("returns the project's active PATs without the token hash, newest first", async () => {
    asOrgOwner();
    mockDb.qtPersonalAccessToken.findMany.mockResolvedValue([
      {
        id: "pat_2",
        name: "Claude Code — laptop",
        createdById: USER,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        lastUsedAt: null,
        expiresAt: new Date("2027-01-02T00:00:00Z"),
        revokedAt: null,
      },
      {
        id: "pat_1",
        name: "CI pipeline",
        createdById: USER,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        lastUsedAt: new Date("2026-01-03T00:00:00Z"),
        expiresAt: new Date("2027-01-01T00:00:00Z"),
        revokedAt: null,
      },
    ] as never);

    const res = await GET(getReq(), ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].id).toBe("pat_2");
    expect(json.data[0].name).toBe("Claude Code — laptop");
    expect(json.data[0]).not.toHaveProperty("tokenHash");
    expect(mockDb.qtPersonalAccessToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: PROJECT, revokedAt: null }),
        orderBy: { createdAt: "desc" },
      }),
    );
  });
});

describe("DELETE /api/projects/[id]/pats/[patId]", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the PAT doesn't exist in this project", async () => {
    asOrgOwner();
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue(null);

    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(404);
    expect(mockDb.qtPersonalAccessToken.update).not.toHaveBeenCalled();
  });

  it("403 when a Contributor neither owns the PAT nor has Project:update", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "contrib_role",
      projectRole: { name: "Contributor" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      createdById: "someone_else",
    } as never);

    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtPersonalAccessToken.update).not.toHaveBeenCalled();
  });

  it("200 when the PAT's own creator revokes it, even without Project:update", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ role: "MEMBER" } as never);
    mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
      projectRoleId: "contrib_role",
      projectRole: { name: "Contributor" },
    } as never);
    mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
    mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      createdById: USER,
    } as never);
    mockDb.qtPersonalAccessToken.update.mockResolvedValue({
      id: "pat_1",
      revokedAt: new Date("2026-01-01T00:00:00Z"),
    } as never);

    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.revokedAt).toBeTruthy();
  });

  it("200 when a Project:update admin revokes someone else's PAT", async () => {
    asOrgOwner();
    mockDb.qtPersonalAccessToken.findFirst.mockResolvedValue({
      id: "pat_1",
      createdById: "someone_else",
    } as never);
    mockDb.qtPersonalAccessToken.update.mockResolvedValue({
      id: "pat_1",
      revokedAt: new Date("2026-01-01T00:00:00Z"),
    } as never);

    const res = await DELETE(deleteReq(), PAT_ROUTE_CTX);
    expect(res.status).toBe(200);
    expect(mockDb.qtPersonalAccessToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pat_1" } }),
    );
  });
});
