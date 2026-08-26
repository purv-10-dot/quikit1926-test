import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/projects/[id]/teams/route";
import { DELETE } from "@/app/api/projects/[id]/teams/[teamId]/route";

const USER = "user_1";
const ORG = "org_1";
const OTHER_ORG = "org_2";
const PROJECT = "proj_1";
const TEAM = "team_1";

const LIST_CTX = { params: { id: PROJECT } } as never;
const ITEM_CTX = { params: { id: PROJECT, teamId: TEAM } } as never;

function getReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/teams`);
}
function postReq(body: unknown) {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/teams`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function deleteReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/teams/${TEAM}`, {
    method: "DELETE",
  });
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

/** Org owner → withProjectAccess fullAccess bypass. */
function asOrgOwner() {
  setSession({ id: USER, orgId: ORG, role: "owner" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "owner" } as never);
}

/** Plain project member with no Project:update grant. */
function asContributor() {
  setSession({ id: USER, orgId: ORG, role: "member" });
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
}

describe("GET /api/projects/[id]/teams", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(getReq(), LIST_CTX);
    expect(res.status).toBe(401);
  });

  it("404 when the project belongs to another org (isolation)", async () => {
    setSession({ id: USER, orgId: OTHER_ORG, role: "owner" });
    // withProjectAccess scopes the lookup by orgId, so a project in org_1 is
    // simply not found for a caller in org_2.
    mockDb.qtProject.findFirst.mockResolvedValue(null);

    const res = await GET(getReq(), LIST_CTX);
    expect(res.status).toBe(404);
    expect(mockDb.qtProjectTeam.findMany).not.toHaveBeenCalled();
  });

  it("returns linked + available teams for a member, with canManage=false", async () => {
    asContributor();
    mockDb.qtProjectTeam.findMany.mockResolvedValue([
      {
        teamId: TEAM,
        addedAt: new Date("2026-08-01"),
        addedBy: USER,
        team: {
          name: "Platform",
          description: null,
          color: "#2563eb",
          leadUserId: null,
          _count: { members: 4 },
        },
      },
    ] as never);
    mockDb.qtTeam.findMany.mockResolvedValue([
      { id: "team_2", name: "Design", description: null, color: null, _count: { members: 2 } },
    ] as never);

    const res = await GET(getReq(), LIST_CTX);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.linked).toHaveLength(1);
    expect(json.data.linked[0]).toMatchObject({ teamId: TEAM, name: "Platform", memberCount: 4 });
    expect(json.data.available).toHaveLength(1);
    expect(json.data.canManage).toBe(false);
  });

  it("scopes both sides of the join by org so a foreign team can't surface", async () => {
    asOrgOwner();
    mockDb.qtProjectTeam.findMany.mockResolvedValue([] as never);
    mockDb.qtTeam.findMany.mockResolvedValue([] as never);

    await GET(getReq(), LIST_CTX);
    expect(mockDb.qtProjectTeam.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          projectId: PROJECT,
          project: { orgId: ORG, isDeleted: false },
          team: { orgId: ORG, isDeleted: false },
        }),
      }),
    );
  });
});

describe("POST /api/projects/[id]/teams", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq({ teamId: TEAM }), LIST_CTX);
    expect(res.status).toBe(401);
  });

  it("403 for a member without Project:update", async () => {
    asContributor();
    const res = await POST(postReq({ teamId: TEAM }), LIST_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtProjectTeam.create).not.toHaveBeenCalled();
  });

  it("400 when teamId is missing", async () => {
    asOrgOwner();
    const res = await POST(postReq({}), LIST_CTX);
    expect(res.status).toBe(400);
    expect(mockDb.qtProjectTeam.create).not.toHaveBeenCalled();
  });

  it("404 when the team is in a different org (cross-org link rejected)", async () => {
    asOrgOwner();
    // The team exists — but not in this org, so the org-scoped lookup misses.
    mockDb.qtTeam.findFirst.mockResolvedValue(null);

    const res = await POST(postReq({ teamId: "team_from_org_2" }), LIST_CTX);
    expect(res.status).toBe(404);
    expect(mockDb.qtProjectTeam.create).not.toHaveBeenCalled();
  });

  it("201 links a team in the same org", async () => {
    asOrgOwner();
    mockDb.qtTeam.findFirst.mockResolvedValue({ id: TEAM } as never);
    mockDb.qtProjectTeam.findUnique.mockResolvedValue(null);
    mockDb.qtProjectTeam.create.mockResolvedValue({ id: "link_1" } as never);

    const res = await POST(postReq({ teamId: TEAM }), LIST_CTX);
    expect(res.status).toBe(201);
    expect(mockDb.qtProjectTeam.create).toHaveBeenCalledWith({
      data: { projectId: PROJECT, teamId: TEAM, addedBy: USER },
    });
  });

  it("200 (no-op, no duplicate row) when the team is already linked", async () => {
    asOrgOwner();
    mockDb.qtTeam.findFirst.mockResolvedValue({ id: TEAM } as never);
    mockDb.qtProjectTeam.findUnique.mockResolvedValue({ id: "link_1" } as never);

    const res = await POST(postReq({ teamId: TEAM }), LIST_CTX);
    expect(res.status).toBe(200);
    expect(mockDb.qtProjectTeam.create).not.toHaveBeenCalled();
  });

  it("never adds project members — linking is association only", async () => {
    asOrgOwner();
    mockDb.qtTeam.findFirst.mockResolvedValue({ id: TEAM } as never);
    mockDb.qtProjectTeam.findUnique.mockResolvedValue(null);
    mockDb.qtProjectTeam.create.mockResolvedValue({ id: "link_1" } as never);

    await POST(postReq({ teamId: TEAM }), LIST_CTX);
    expect(mockDb.qtProjectMember.create).not.toHaveBeenCalled();
    expect(mockDb.qtProjectMember.createMany).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/projects/[id]/teams/[teamId]", () => {
  it("401 when unauthenticated", async () => {
    const res = await DELETE(deleteReq(), ITEM_CTX);
    expect(res.status).toBe(401);
  });

  it("403 for a member without Project:update", async () => {
    asContributor();
    const res = await DELETE(deleteReq(), ITEM_CTX);
    expect(res.status).toBe(403);
    expect(mockDb.qtProjectTeam.delete).not.toHaveBeenCalled();
  });

  it("404 when no such link exists", async () => {
    asOrgOwner();
    mockDb.qtProjectTeam.findFirst.mockResolvedValue(null);

    const res = await DELETE(deleteReq(), ITEM_CTX);
    expect(res.status).toBe(404);
    expect(mockDb.qtProjectTeam.delete).not.toHaveBeenCalled();
  });

  it("200 unlinks, and deletes only the association row", async () => {
    asOrgOwner();
    mockDb.qtProjectTeam.findFirst.mockResolvedValue({ id: "link_1" } as never);
    mockDb.qtProjectTeam.delete.mockResolvedValue({ id: "link_1" } as never);

    const res = await DELETE(deleteReq(), ITEM_CTX);
    expect(res.status).toBe(200);
    expect(mockDb.qtProjectTeam.delete).toHaveBeenCalledWith({ where: { id: "link_1" } });
    // The team itself survives — only the link is removed.
    expect(mockDb.qtTeam.delete).not.toHaveBeenCalled();
    expect(mockDb.qtTeam.update).not.toHaveBeenCalled();
  });
});
