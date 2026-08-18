import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/issues/[id]/summary/route";

const USER = "user_1";
const ORG = "org_1";
const PROJECT = "proj_1";
const ISSUE = "issue_1";

function req() {
  return new NextRequest(`http://localhost/api/issues/${ISSUE}/summary`);
}

const ISSUE_ROW = {
  id: ISSUE,
  key: "PROJ-1",
  title: "Fix the thing",
  description: "<p>Some <strong>rich</strong> text description</p>",
  type: "TASK",
  priority: "HIGH",
  startDate: null,
  dueDate: null,
  updatedAt: new Date("2026-08-01T00:00:00Z"),
  projectId: PROJECT,
  assigneeId: "user_2",
  reporterId: "user_3",
  sprintId: "sprint_1",
  status: { id: "status_1", name: "In Progress", category: "IN_PROGRESS", color: "#3b82f6" },
  sprint: { id: "sprint_1", name: "Sprint 4", status: "ACTIVE" },
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
  mockDb.qtIssue.count.mockResolvedValue(0);
  mockDb.qtIssueComment.count.mockResolvedValue(0);
  mockDb.qtIssueLink.count.mockResolvedValue(0);
  mockDb.qtIssueWatcher.count.mockResolvedValue(0);
  mockDb.qtIssueComment.findFirst.mockResolvedValue(null);
  mockDb.qtIssueTransitionLog.findFirst.mockResolvedValue(null);
  mockDb.user.findMany.mockResolvedValue([]);
});

describe("GET /api/issues/[id]/summary", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(req(), { params: { id: ISSUE } });
    expect(res.status).toBe(401);
  });

  it("returns 404 for an issue in another org (org-isolation)", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null); // orgId-scoped lookup finds nothing
    const res = await GET(req(), { params: { id: ISSUE } });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the caller is not a project member and not admin", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(ISSUE_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: ISSUE } });
    expect(res.status).toBe(404);
  });

  it("returns a compact summary with a plain-text description excerpt (HTML stripped)", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(ISSUE_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "member_1" } as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "user_2", firstName: "Ann", lastName: "Lee", email: "ann@example.com", avatar: null },
      { id: "user_3", firstName: "Bo", lastName: "Ray", email: "bo@example.com", avatar: null },
    ] as never);
    mockDb.qtIssueComment.count.mockResolvedValue(3);
    mockDb.qtIssueLink.count.mockResolvedValue(1);
    mockDb.qtIssueWatcher.count.mockResolvedValue(2);
    mockDb.qtIssue.count.mockResolvedValueOnce(4).mockResolvedValueOnce(2); // subtaskCount, subtaskDone

    const res = await GET(req(), { params: { id: ISSUE } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      id: ISSUE,
      key: "PROJ-1",
      title: "Fix the thing",
      status: { name: "In Progress", category: "IN_PROGRESS" },
      priority: "HIGH",
      assignee: { id: "user_2", name: "Ann Lee" },
      reporter: { id: "user_3", name: "Bo Ray" },
      descriptionExcerpt: "Some rich text description",
      progress: { subtaskCount: 4, subtaskDone: 2, percentComplete: 50 },
      sprint: { id: "sprint_1", name: "Sprint 4" },
      counts: { comments: 3, links: 1, watchers: 2 },
    });
    // No raw HTML markup anywhere in the excerpt.
    expect(body.data.descriptionExcerpt).not.toMatch(/<[a-z]/i);
  });

  it("excludes full comment bodies, full history, and custom fields from the payload", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(ISSUE_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "member_1" } as never);

    const res = await GET(req(), { params: { id: ISSUE } });
    const body = await res.json();
    expect(body.data).not.toHaveProperty("comments");
    expect(body.data).not.toHaveProperty("history");
    expect(body.data).not.toHaveProperty("customFields");
    expect(body.data).not.toHaveProperty("description"); // raw HTML never leaves the route
  });
});
