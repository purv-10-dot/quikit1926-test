import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/projects/[id]/reports/velocity/route";

const USER = "user_1";
const ORG = "org_1";
const PROJECT = "proj_1";

function getReq() {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/reports/velocity`, {
    method: "GET",
  });
}

function call() {
  return GET(getReq(), { params: { id: PROJECT } } as never);
}

/** Make the caller a tenant admin so withProjectAccess grants full access. */
function asAdmin() {
  setSession({ id: USER, orgId: ORG, role: "admin" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
  // Sensible empty defaults; individual tests override.
  mockDb.qtSprint.findMany.mockResolvedValue([] as never);
  mockDb.qtSprintSnapshot.findMany.mockResolvedValue([] as never);
  mockDb.qtIssue.findMany.mockResolvedValue([] as never);
});

describe("GET /api/projects/:id/reports/velocity", () => {
  it("401 when unauthenticated", async () => {
    const res = await call();
    expect(res.status).toBe(401);
  });

  it("404 when the project is not in the tenant", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(404);
  });

  it("returns an empty series when there are no ACTIVE/COMPLETED sprints", async () => {
    asAdmin();
    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toEqual({ metric: "storyPoints", sprints: [], average: 0 });
  });

  it("uses frozen snapshot figures for a COMPLETED sprint", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([
      { id: "s1", name: "Sprint 1", status: "COMPLETED" },
    ] as never);
    mockDb.qtSprintSnapshot.findMany.mockResolvedValue([
      {
        sprintId: "s1",
        committedPoints: 40,
        committedCount: 10,
        committedIssueIds: ["a", "b"],
        completedPoints: 35,
        completedCount: 9,
      },
    ] as never);
    // Current issues are irrelevant once the snapshot has a completed tally.
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);

    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.sprints).toHaveLength(1);
    expect(json.data.sprints[0]).toMatchObject({
      sprintName: "Sprint 1",
      committedPoints: 40,
      completedPoints: 35,
      fromSnapshot: true,
    });
    expect(json.data.average).toBe(35);
  });

  it("live-recomputes completed for an ACTIVE sprint whose snapshot has no close tally", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([
      { id: "s2", name: "Sprint 2", status: "ACTIVE" },
    ] as never);
    mockDb.qtSprintSnapshot.findMany.mockResolvedValue([
      {
        sprintId: "s2",
        committedPoints: 20,
        committedCount: 4,
        committedIssueIds: ["i1", "i2", "i3"],
        completedPoints: null,
        completedCount: null,
      },
    ] as never);
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "i1", sprintId: "s2", type: "TASK", storyPoints: 5, status: { category: "DONE" } },
      { id: "i2", sprintId: "s2", type: "TASK", storyPoints: 3, status: { category: "IN_PROGRESS" } },
      { id: "i3", sprintId: "s2", type: "BUG", storyPoints: 8, status: { category: "DONE" } },
    ] as never);

    const res = await call();
    const json = await res.json();
    const row = json.data.sprints[0];
    // Committed comes from the frozen snapshot (20). Completed is recomputed
    // live against the committed set: only i1 is DONE and in-scope (i3 is a BUG,
    // excluded). i2 is not done.
    expect(row.committedPoints).toBe(20);
    expect(row.completedPoints).toBe(5);
    expect(row.completedCount).toBe(1);
    expect(row.fromSnapshot).toBe(false);
  });

  it("sets hasEstimates=false when sprints exist but carry no story points", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([
      { id: "s0", name: "No points", status: "ACTIVE" },
    ] as never);
    mockDb.qtSprintSnapshot.findMany.mockResolvedValue([] as never);
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "n1", sprintId: "s0", type: "TASK", storyPoints: null, status: { category: "DONE" } },
      { id: "n2", sprintId: "s0", type: "TASK", storyPoints: null, status: { category: "TODO" } },
    ] as never);

    const res = await call();
    const json = await res.json();
    expect(json.data.hasEstimates).toBe(false);
    expect(json.data.sprints[0].committedPoints).toBe(0);
  });

  it("degrades gracefully (200, live calc) when the snapshot table is missing (P2021)", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([
      { id: "s9", name: "Sprint 9", status: "ACTIVE" },
    ] as never);
    // Simulate an un-migrated DB: the snapshot query throws P2021.
    mockDb.qtSprintSnapshot.findMany.mockRejectedValue(
      Object.assign(new Error("table does not exist"), { code: "P2021" }),
    );
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "a", sprintId: "s9", type: "TASK", storyPoints: 5, status: { category: "DONE" } },
    ] as never);

    const res = await call();
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.sprints[0]).toMatchObject({
      committedPoints: 5,
      completedPoints: 5,
      fromSnapshot: false,
    });
    expect(json.data.hasEstimates).toBe(true);
  });

  it("live-recomputes both figures for a legacy sprint with no snapshot", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([
      { id: "s3", name: "Legacy", status: "COMPLETED" },
    ] as never);
    mockDb.qtSprintSnapshot.findMany.mockResolvedValue([] as never);
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "x1", sprintId: "s3", type: "STORY", storyPoints: 5, status: { category: "DONE" } },
      { id: "x2", sprintId: "s3", type: "SUBTASK", storyPoints: 2, status: { category: "DONE" } },
    ] as never);

    const res = await call();
    const json = await res.json();
    const row = json.data.sprints[0];
    // SUBTASK excluded → committed = 5 (only the STORY), completed = 5.
    expect(row.committedPoints).toBe(5);
    expect(row.completedPoints).toBe(5);
    expect(row.fromSnapshot).toBe(false);
  });
});
