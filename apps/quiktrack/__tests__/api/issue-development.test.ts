import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/issues/[id]/development/route";

const USER = "user_1";
const ORG = "org_1";
const ISSUE = "iss_1";

function call() {
  return GET(
    new NextRequest(`http://localhost/api/issues/${ISSUE}/development`),
    { params: { id: ISSUE } } as never,
  );
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/issues/[id]/development", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("returns 404 when the issue is not in the caller's org (isolation)", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    // Scoped lookup finds nothing → cross-org / missing issue is a 404.
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
    const where = (mockDb.qtIssue.findFirst.mock.calls[0]?.[0] as { where: { orgId: string } }).where;
    expect(where.orgId).toBe(ORG);
  });

  it("returns 403 when the caller is neither a project member nor admin", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: ISSUE, projectId: "proj_1" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null);
    // hasAdminAccess consults these; make them deny.
    mockDb.orgMember.findFirst.mockResolvedValue(null);
    mockDb.qtUserAppRole.findFirst.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(403);
  });

  it("returns branches/commits/pullRequests for a permitted member", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: ISSUE, projectId: "proj_1" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "pm_1" } as never);
    mockDb.qtDevBranch.findMany.mockResolvedValue([{ id: "b1", name: "QT-1-x" }] as never);
    mockDb.qtDevCommit.findMany.mockResolvedValue([] as never);
    mockDb.qtDevPullRequest.findMany.mockResolvedValue([] as never);

    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.branches).toHaveLength(1);
    // Every dev query must be org-scoped.
    const bwhere = (mockDb.qtDevBranch.findMany.mock.calls[0]?.[0] as { where: { orgId: string } }).where;
    expect(bwhere.orgId).toBe(ORG);
  });
});
