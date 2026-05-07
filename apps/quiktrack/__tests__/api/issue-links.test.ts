import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/issues/[id]/links/route";
import { DELETE } from "@/app/api/issues/[id]/links/[linkId]/route";

const USER = "user_1";
const TENANT = "tenant_1";
const ISSUE = "issue_1";
const TARGET = "issue_2";
const LINK = "link_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/links`);
}
function postReq(body: unknown) {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/links`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
function delReq() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/links/${LINK}`, {
    method: "DELETE",
  });
}

const GET_CTX = { params: { id: ISSUE } } as never;
const POST_CTX = { params: { id: ISSUE } } as never;
const DEL_CTX = { params: { id: ISSUE, linkId: LINK } } as never;

describe("GET /api/issues/[id]/links", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(getReq(), GET_CTX);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the issue is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await GET(getReq(), GET_CTX);
    expect(res.status).toBe(404);
  });

  it("happy path returns the issue's outgoing links", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.findMany.mockResolvedValue([
      {
        id: LINK,
        type: "RELATES_TO",
        createdAt: new Date(),
        targetIssue: { id: TARGET, key: "QT-2", title: "Other" },
      },
    ] as never);
    const res = await GET(getReq(), GET_CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(LINK);
  });
});

describe("POST /api/issues/[id]/links", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the source issue is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(404);
  });

  it("rejects self-links", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    const res = await POST(postReq({ targetIssueId: ISSUE }), POST_CTX);
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target issue is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        orgId: TENANT,
      } as never) // source
      .mockResolvedValueOnce(null); // target lookup misses (different tenant)
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(404);
  });

  it("returns 409 when the link already exists", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        orgId: TENANT,
      } as never)
      .mockResolvedValueOnce({ id: TARGET, projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.findFirst.mockResolvedValue({ id: "dup" } as never);
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(409);
  });

  it("happy path creates the link with 201", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst
      .mockResolvedValueOnce({
        id: ISSUE,
        projectId: PROJECT,
        orgId: TENANT,
      } as never)
      .mockResolvedValueOnce({ id: TARGET, projectId: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
    mockDb.qtIssueLink.create.mockResolvedValue({
      id: LINK,
      type: "RELATES_TO",
      createdAt: new Date(),
      targetIssue: { id: TARGET, key: "QT-2", title: "Other" },
    } as never);
    const res = await POST(postReq({ targetIssueId: TARGET }), POST_CTX);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe(LINK);
  });
});

describe("DELETE /api/issues/[id]/links/[linkId]", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await DELETE(delReq(), DEL_CTX);
    expect(res.status).toBe(401);
  });

  it("returns 404 when the link is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssueLink.findFirst.mockResolvedValue(null);
    const res = await DELETE(delReq(), DEL_CTX);
    expect(res.status).toBe(404);
  });

  it("happy path deletes the link", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssueLink.findFirst.mockResolvedValue({
      id: LINK,
      projectId: PROJECT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssueLink.delete.mockResolvedValue({ id: LINK } as never);
    const res = await DELETE(delReq(), DEL_CTX);
    expect(res.status).toBe(200);
  });
});
