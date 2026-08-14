import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/reports/executive/route";

const USER = "user_1";
const ORG = "org_1";
/** Holds Space Admin on one project and Contributor on another. */
const MULTI_ROLE_USER = "user_multi";

function getReq(qs = "") {
  return new NextRequest(`http://localhost/api/reports/executive${qs}`, { method: "GET" });
}

const now = new Date();
const closedIssue = {
  id: "i1",
  projectId: "p1",
  assigneeId: MULTI_ROLE_USER,
  createdAt: now,
  updatedAt: now,
  dueDate: null,
  eta: null,
  priority: "MEDIUM",
  status: { category: "DONE", name: "Done" },
};

beforeEach(() => {
  resetMockDb();
  setSession({ id: USER, orgId: ORG, role: "admin" });
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  mockDb.org.findUnique.mockResolvedValue({ quarterStartMonth: 1 } as never);

  mockDb.qtIssue.findMany.mockResolvedValue([closedIssue] as never);
  mockDb.qtTimesheetEntry.findMany.mockResolvedValue([]);
  mockDb.qtProject.findMany.mockResolvedValue([
    { id: "p1", name: "Project One", color: null, projectKey: "P1" },
  ] as never);
  mockDb.qtProjectMember.findMany.mockResolvedValue([]);
  mockDb.qtSprint.findMany.mockResolvedValue([]);
  mockDb.qtProjectRole.findMany.mockResolvedValue([
    { id: "r1", name: "Space Admin" },
    { id: "r2", name: "Contributor" },
  ] as never);
  // Space Admin comes back FIRST — the ordering that used to decide the label.
  mockDb.qtProjectUserRole.findMany.mockResolvedValue([
    { userId: MULTI_ROLE_USER, projectRole: { id: "r1", name: "Space Admin" } },
    { userId: MULTI_ROLE_USER, projectRole: { id: "r2", name: "Contributor" } },
  ] as never);
  mockDb.user.findMany.mockResolvedValue([
    { id: MULTI_ROLE_USER, firstName: "Pravin", lastName: "Sharma", email: "p@x.io", avatar: null },
  ] as never);
});

describe("GET /api/reports/executive — role (teamIds) filter", () => {
  it("labels top-employee rows with the filtered role, not another role the user holds", async () => {
    const res = await GET(getReq("?preset=last-90&teamIds=Contributor"), { params: {} } as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    const rows = body.data.employees as { userId: string; teamName: string | null }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(MULTI_ROLE_USER);
    // Was "Space Admin" — the first role found — while filtering on Contributor.
    expect(rows[0].teamName).toBe("Contributor");
  });

  it("keeps that user's activity in the filtered role's heatmap row", async () => {
    const res = await GET(getReq("?preset=last-90&teamIds=Contributor"), { params: {} } as never);
    const body = await res.json();

    const heatmap = body.data.teamHeatmap as {
      teamName: string;
      cells: { closed: number }[];
    }[];
    expect(heatmap.map((r) => r.teamName)).toEqual(["Contributor"]);
    // The heatmap only keeps rows matching the filter, so bucketing this user's
    // work under "Space Admin" left the Contributor row empty — the work
    // vanished from the report.
    const closed = heatmap[0].cells.reduce((n, c) => n + c.closed, 0);
    expect(closed).toBe(1);
  });

  it("still labels rows with the first role when no role filter is applied", async () => {
    const res = await GET(getReq("?preset=last-90"), { params: {} } as never);
    const body = await res.json();

    const rows = body.data.employees as { teamName: string | null }[];
    expect(rows[0].teamName).toBe("Space Admin");
  });
});
