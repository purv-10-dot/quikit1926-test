import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/sprints/[id]/summary/route";

const USER = "user_1";
const ORG = "org_1";
const PROJECT = "proj_1";
const SPRINT = "sprint_1";

function req() {
  return new NextRequest(`http://localhost/api/sprints/${SPRINT}/summary`);
}

const ACTIVE_SPRINT_ROW = {
  id: SPRINT,
  projectId: PROJECT,
  name: "Sprint 4",
  goal: "Ship the AI manifest endpoint",
  status: "ACTIVE",
  startDate: new Date("2026-08-01T00:00:00Z"),
  endDate: new Date("2026-08-14T00:00:00Z"),
  startedAt: new Date("2026-08-01T00:00:00Z"),
  completedAt: null,
  snapshot: null,
};

beforeEach(() => {
  resetMockDb();
  setSession(null);
  mockDb.qtIssue.findMany.mockResolvedValue([]);
  mockDb.user.findMany.mockResolvedValue([]);
});

describe("GET /api/sprints/[id]/summary", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(req(), { params: { id: SPRINT } });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a sprint in another org (org-isolation)", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue(null); // orgId-scoped lookup finds nothing
    const res = await GET(req(), { params: { id: SPRINT } });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the caller is not a project member and not admin", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue(ACTIVE_SPRINT_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: SPRINT } });
    expect(res.status).toBe(404);
  });

  it("computes committed/completed points live for an ACTIVE sprint with no snapshot yet", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue(ACTIVE_SPRINT_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "member_1" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "i1", key: "PROJ-1", title: "A", type: "TASK", priority: "HIGH", storyPoints: 5, eta: null, assigneeId: "user_2", status: { category: "DONE" } },
      { id: "i2", key: "PROJ-2", title: "B", type: "TASK", priority: "URGENT", storyPoints: 3, eta: null, assigneeId: null, status: { category: "IN_PROGRESS" } },
      { id: "i3", key: "PROJ-3", title: "C", type: "EPIC", storyPoints: 100, eta: null, priority: "LOW", assigneeId: null, status: { category: "TODO" } },
    ] as never);

    const res = await GET(req(), { params: { id: SPRINT } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    // EPIC excluded from velocity scope — committed = 5 + 3 = 8, completed = 5.
    expect(body.data.burndown).toEqual({ committedPoints: 8, completedPoints: 5, remainingPoints: 3 });
    expect(body.data.issueCounts).toEqual({ total: 3, done: 1, inProgress: 1, todo: 1 });
    expect(body.data.goalExcerpt).toBe("Ship the AI manifest endpoint");
  });

  it("reads the frozen snapshot verbatim for a COMPLETED sprint, never recomputing", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue({
      ...ACTIVE_SPRINT_ROW,
      status: "COMPLETED",
      completedAt: new Date("2026-08-14T00:00:00Z"),
      snapshot: { committedPoints: 20, completedPoints: 15 },
    } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "member_1" } as never);
    // Issues remaining in the sprint post-completion (incomplete ones already
    // moved out) — irrelevant to burndown once a snapshot exists.
    mockDb.qtIssue.findMany.mockResolvedValue([
      { id: "i1", key: "PROJ-1", title: "A", type: "TASK", priority: "HIGH", storyPoints: 999, eta: null, assigneeId: null, status: { category: "DONE" } },
    ] as never);

    const res = await GET(req(), { params: { id: SPRINT } });
    const body = await res.json();
    expect(body.data.burndown).toEqual({ committedPoints: 20, completedPoints: 15, remainingPoints: 5 });
  });

  it("caps topOpenIssues at 10 and excludes DONE issues", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtSprint.findFirst.mockResolvedValue(ACTIVE_SPRINT_ROW as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "member_1" } as never);
    const open = Array.from({ length: 12 }, (_, i) => ({
      id: `i${i}`,
      key: `PROJ-${i}`,
      title: `Issue ${i}`,
      type: "TASK",
      priority: "MEDIUM",
      storyPoints: 1,
      eta: null,
      assigneeId: null,
      status: { category: "IN_PROGRESS" },
    }));
    const done = [
      { id: "d1", key: "PROJ-done", title: "Done one", type: "TASK", priority: "HIGH", storyPoints: 1, eta: null, assigneeId: null, status: { category: "DONE" } },
    ];
    mockDb.qtIssue.findMany.mockResolvedValue([...open, ...done] as never);

    const res = await GET(req(), { params: { id: SPRINT } });
    const body = await res.json();
    expect(body.data.topOpenIssues).toHaveLength(10);
    expect(body.data.topOpenIssues.every((i: { key: string }) => i.key !== "PROJ-done")).toBe(true);
  });
});
