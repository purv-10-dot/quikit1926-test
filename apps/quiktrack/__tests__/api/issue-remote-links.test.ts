import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/issues/[id]/remote-links/route";

const USER = "user_1";
const TENANT = "tenant_1";
const ISSUE = "issue_1";
const PROJECT = "proj_1";
const LINK = "link_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/remote-links`);
}
function postReq(body: unknown) {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/remote-links`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const CTX = { params: { id: ISSUE } } as never;

function mockMemberWithPermission() {
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
  mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
  mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
    projectRoleId: "contrib_role",
    projectRole: { name: "Contributor" },
  } as never);
  mockDb.qtProjectRolePermission.findFirst.mockResolvedValue({ id: "grant_1" } as never);
}

function mockMemberWithoutPermission() {
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  mockDb.app.findUnique.mockResolvedValue({ id: "app_qt" } as never);
  mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
  mockDb.qtProjectUserRole.findUnique.mockResolvedValue({
    projectRoleId: "contrib_role",
    projectRole: { name: "Contributor" },
  } as never);
  mockDb.qtProjectRolePermission.findFirst.mockResolvedValue(null);
  mockDb.qtUserPermissionExtra.findFirst.mockResolvedValue(null);
}

describe("GET /api/issues/[id]/remote-links", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(getReq(), CTX);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the issue is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), CTX);
    expect(res.status).toBe(404);
  });

  it("happy path returns the issue's remote links, oldest first", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.qtRemoteLink.findMany.mockResolvedValue([
      { id: LINK, url: "https://github.com/x/y/pull/1", title: "Fix bug", type: "pull_request", metadata: null, createdAt: new Date() },
    ] as never);
    const res = await GET(getReq(), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(LINK);
    expect(mockDb.qtRemoteLink.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: TENANT, issueId: ISSUE } }),
    );
  });
});

describe("POST /api/issues/[id]/remote-links", () => {
  const VALID_BODY = { url: "https://github.com/x/y/pull/1", title: "Fix bug", type: "pull_request" };

  it("returns 401 when unauthenticated", async () => {
    const res = await POST(postReq(VALID_BODY), CTX);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the issue is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await POST(postReq(VALID_BODY), CTX);
    expect(res.status).toBe(404);
  });

  it("returns 403 when the user lacks Issue:update", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockMemberWithoutPermission();
    const res = await POST(postReq(VALID_BODY), CTX);
    expect(res.status).toBe(403);
  });

  it("returns 400 on invalid input (bad url)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockMemberWithPermission();
    const res = await POST(postReq({ url: "not-a-url", title: "x", type: "pull_request" }), CTX);
    expect(res.status).toBe(400);
  });

  it("happy path creates the remote link with 201", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockMemberWithPermission();
    mockDb.qtRemoteLink.create.mockResolvedValue({
      id: LINK,
      url: VALID_BODY.url,
      title: VALID_BODY.title,
      type: VALID_BODY.type,
      metadata: null,
      createdAt: new Date(),
    } as never);
    const res = await POST(postReq(VALID_BODY), CTX);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(LINK);
    expect(mockDb.qtRemoteLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orgId: TENANT, projectId: PROJECT, issueId: ISSUE }),
      }),
    );
  });
});
