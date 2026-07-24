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

/** Tenant admin → withProjectAccess grants full access. */
function asAdmin() {
  setSession({ id: USER, orgId: ORG, role: "admin" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
}

/** A completed-sprint row with an attached snapshot, matching the route's select. */
function completedSprint(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    name: "Sprint 1",
    completedAt: new Date("2026-06-15T00:00:00Z"),
    snapshot: {
      committedPoints: 40,
      completedPoints: 35,
      committedHours: 80,
      completedHours: 70,
      committedCount: 10,
      completedCount: 9,
      completionPct: 88,
      completedAt: new Date("2026-06-15T00:00:00Z"),
    },
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
  mockDb.qtSprint.findMany.mockResolvedValue([] as never);
});

describe("GET /api/projects/:id/reports/velocity", () => {
  it("401 when unauthenticated", async () => {
    expect((await call()).status).toBe(401);
  });

  it("404 when the project is not in the tenant", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("only queries COMPLETED sprints", async () => {
    asAdmin();
    await call();
    const arg = mockDb.qtSprint.findMany.mock.calls[0]![0] as {
      where: { status: string };
    };
    expect(arg.where.status).toBe("COMPLETED");
  });

  it("returns an empty series when there are no completed sprints", async () => {
    asAdmin();
    const json = await (await call()).json();
    expect(json.success).toBe(true);
    expect(json.data.sprints).toEqual([]);
    expect(json.data.averagePoints).toBe(0);
    expect(json.data.averageHours).toBe(0);
  });

  it("reads the stored snapshot verbatim (no recompute) for points and hours", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([completedSprint()] as never);
    const json = await (await call()).json();
    expect(json.data.sprints).toHaveLength(1);
    expect(json.data.sprints[0]).toMatchObject({
      sprintName: "Sprint 1",
      committedPoints: 40,
      completedPoints: 35,
      committedHours: 80,
      completedHours: 70,
      completionPct: 88,
    });
    expect(json.data.sprints[0].completedAt).toBe("2026-06-15T00:00:00.000Z");
    expect(json.data.averagePoints).toBe(35);
    expect(json.data.averageHours).toBe(70);
  });

  it("skips completed sprints that have no snapshot (legacy, pre-feature)", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([
      completedSprint(),
      { id: "s2", name: "Legacy", completedAt: new Date(), snapshot: null },
    ] as never);
    const json = await (await call()).json();
    expect(json.data.sprints).toHaveLength(1);
    expect(json.data.sprints[0].sprintName).toBe("Sprint 1");
  });

  it("averages over completed sprints only", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([
      completedSprint({ id: "a", name: "A", snapshot: snap({ completedPoints: 30, completedHours: 40 }) }),
      completedSprint({ id: "b", name: "B", snapshot: snap({ completedPoints: 50, completedHours: 60 }) }),
    ] as never);
    const json = await (await call()).json();
    expect(json.data.averagePoints).toBe(40); // (30+50)/2
    expect(json.data.averageHours).toBe(50); // (40+60)/2
  });

  it("flags hasEstimates/hasHours false when everything is zero", async () => {
    asAdmin();
    mockDb.qtSprint.findMany.mockResolvedValue([
      completedSprint({
        snapshot: snap({
          committedPoints: 0, completedPoints: 0, committedHours: 0, completedHours: 0, completionPct: 0,
        }),
      }),
    ] as never);
    const json = await (await call()).json();
    expect(json.data.hasEstimates).toBe(false);
    expect(json.data.hasHours).toBe(false);
  });
});

/** Snapshot factory with sane defaults for the fields the route selects. */
function snap(over: Record<string, unknown> = {}) {
  return {
    committedPoints: 10,
    completedPoints: 10,
    committedHours: 10,
    completedHours: 10,
    committedCount: 2,
    completedCount: 2,
    completionPct: 100,
    completedAt: new Date("2026-06-15T00:00:00Z"),
    ...over,
  };
}
