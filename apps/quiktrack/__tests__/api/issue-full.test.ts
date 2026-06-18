import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/issues/[id]/full/route";

const USER = "user_1";
const TENANT = "tenant_1";
const ISSUE = "issue_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function getReq() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/full`);
}

/** Stub the six parallel issue-scoped reads + the author lookup with empties. */
function stubEmptyFanOut() {
  mockDb.qtIssue.findMany.mockResolvedValue([] as never); // subtasks
  mockDb.qtTimesheetEntry.findMany.mockResolvedValue([] as never);
  mockDb.qtIssueLink.findMany.mockResolvedValue([] as never);
  mockDb.qtIssueComment.findMany.mockResolvedValue([] as never);
  mockDb.qtIssueHistory.findMany.mockResolvedValue([] as never);
  mockDb.qtIssueAttachment.findMany.mockResolvedValue([] as never);
  mockDb.user.findMany.mockResolvedValue([] as never);
}

describe("GET /api/issues/:id/full", () => {
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

  it("404 when the user is neither a project member nor a tenant admin", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null); // not a member
    mockDb.orgMember.findFirst.mockResolvedValue(null); // not an admin
    const res = await GET(getReq(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(404);
  });

  it("returns the aggregate with author-stitched comments for an authorised member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
      title: "T",
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);

    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "sub_1" }] as never); // subtasks
    mockDb.qtTimesheetEntry.findMany.mockResolvedValue([] as never);
    mockDb.qtIssueLink.findMany.mockResolvedValue([{ id: "link_1" }] as never);
    mockDb.qtIssueComment.findMany.mockResolvedValue([
      { id: "c_1", userId: USER, body: "hi", createdAt: new Date(), editedAt: null },
    ] as never);
    mockDb.qtIssueHistory.findMany.mockResolvedValue([] as never);
    mockDb.qtIssueAttachment.findMany.mockResolvedValue([] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: USER, firstName: "Ada", lastName: "Lovelace", email: "ada@x.io", avatar: null },
    ] as never);

    const res = await GET(getReq(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // Each slice present and shaped like its standalone route.
    expect(body.data.issue.id).toBe(ISSUE);
    expect(body.data.issue.subtasks).toHaveLength(1);
    expect(body.data.links).toHaveLength(1);
    expect(body.data.attachments).toEqual([]);
    // Comment author is stitched in from the user lookup.
    expect(body.data.comments[0].user.firstName).toBe("Ada");
  });

  it("serves a tenant admin who is not a project member", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.qtIssue.findFirst.mockResolvedValue({
      id: ISSUE,
      projectId: PROJECT,
      orgId: TENANT,
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null); // not a member
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "org_admin" } as never); // admin
    stubEmptyFanOut();

    const res = await GET(getReq(), { params: { id: ISSUE } } as never);
    expect(res.status).toBe(200);
  });
});
