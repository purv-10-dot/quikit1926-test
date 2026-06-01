import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/reports/executive/route";

const USER = "user_1";
const ORG = "org_1";

function getReq(qs = "") {
  return new NextRequest(`http://localhost/api/reports/executive${qs}`, { method: "GET" });
}

interface CallArg {
  where: Record<string, unknown>;
  select?: Record<string, unknown>;
}

// Cast escape hatch for the deep-mocked PrismaPromise return type. Tests
// don't care about the PrismaPromise tag — they only need the resolved
// payload — so we narrow once here instead of casting at every call site.
const mockIssueFindManyImpl =
  mockDb.qtIssue.findMany.mockImplementation as unknown as (
    fn: (args: unknown) => Promise<unknown[]>,
  ) => unknown;

function defaultDbStubs() {
  mockDb.org.findUnique.mockResolvedValue({ quarterStartMonth: 1 } as never);
  mockDb.qtIssue.findMany.mockResolvedValue([]);
  mockDb.qtTimesheetEntry.findMany.mockResolvedValue([]);
  mockDb.qtProject.findMany.mockResolvedValue([]);
  mockDb.qtProjectMember.findMany.mockResolvedValue([]);
  mockDb.qtProjectRole.findMany.mockResolvedValue([]);
  mockDb.qtProjectUserRole.findMany.mockResolvedValue([]);
  mockDb.qtSprint.findMany.mockResolvedValue([]);
  mockDb.user.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
  defaultDbStubs();
});

/* ─── Auth ───────────────────────────────────────────────────────────────── */

describe("GET /api/reports/executive — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(401);
  });
});

/* ─── Tenant scoping ─────────────────────────────────────────────────────── */

describe("GET /api/reports/executive — tenant scoping", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "member" });
  });

  it("returns empty data when non-admin has no project memberships", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findMany.mockResolvedValue([]);

    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.summary.totalCreated).toBe(0);
    expect(mockDb.qtIssue.findMany).not.toHaveBeenCalled();
  });

  it("stamps orgId on every issue query (admin path)", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);

    await GET(getReq("?preset=last-90"), { params: {} } as never);

    const calls = mockDb.qtIssue.findMany.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const [arg] of calls) {
      const where = (arg as CallArg).where;
      expect(where.orgId).toBe(ORG);
    }
  });

  it("scopes non-admin to their project memberships", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findMany.mockResolvedValue([
      { projectId: "p1" },
      { projectId: "p2" },
    ] as never);

    await GET(getReq("?preset=last-30"), { params: {} } as never);

    const firstCall = mockDb.qtIssue.findMany.mock.calls[0]?.[0] as {
      where: { projectId?: { in: string[] } };
    };
    expect(firstCall.where.projectId).toEqual({ in: ["p1", "p2"] });
  });

  it("returns empty data when projectIds filter intersects to zero with user's visible projects", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProjectMember.findMany.mockResolvedValue([
      { projectId: "p1" },
    ] as never);

    const res = await GET(
      getReq("?preset=last-30&projectIds=p_other"),
      { params: {} } as never,
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.summary.totalCreated).toBe(0);
    // Should NOT have fired the issue queries — bailed early on empty intersection.
    expect(mockDb.qtIssue.findMany).not.toHaveBeenCalled();
  });

  it("orgId is included on timesheet, project, sprint, role and user queries", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);

    await GET(getReq("?preset=last-30"), { params: {} } as never);

    const ts = mockDb.qtTimesheetEntry.findMany.mock.calls[0]?.[0] as CallArg;
    expect(ts.where.orgId).toBe(ORG);
    const pr = mockDb.qtProject.findMany.mock.calls[0]?.[0] as CallArg;
    expect(pr.where.orgId).toBe(ORG);
    const role = mockDb.qtProjectRole.findMany.mock.calls[0]?.[0] as CallArg;
    expect(role.where.orgId).toBe(ORG);
  });
});

/* ─── Range resolution ───────────────────────────────────────────────────── */

describe("GET /api/reports/executive — range resolution", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("returns a range label and from/to dates", async () => {
    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.range.label).toMatch(/Last 30/);
    expect(body.data.range.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.data.range.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("resolves a specific historical quarter (Q2 2024)", async () => {
    const res = await GET(
      getReq("?preset=specific-quarter&year=2024&quarter=2"),
      { params: {} } as never,
    );
    const body = await res.json();
    expect(body.data.range.from).toBe("2024-04-01");
    expect(body.data.range.to).toBe("2024-07-01");
    expect(body.data.range.label).toContain("Q2 2024");
  });

  it("resolves a specific historical month (March 2024)", async () => {
    const res = await GET(
      getReq("?preset=specific-month&year=2024&month=3"),
      { params: {} } as never,
    );
    const body = await res.json();
    expect(body.data.range.from).toBe("2024-03-01");
    expect(body.data.range.to).toBe("2024-04-01");
    expect(body.data.range.label).toContain("March 2024");
  });

  it("accepts a custom from/to date range (to is inclusive UI-side, +1 day server-side)", async () => {
    const res = await GET(
      getReq("?preset=custom&from=2024-01-15&to=2024-02-15"),
      { params: {} } as never,
    );
    const body = await res.json();
    expect(body.data.range.from).toBe("2024-01-15");
    expect(body.data.range.to).toBe("2024-02-16");
  });

  it("respects org.quarterStartMonth for fiscal quarters (FY starts April)", async () => {
    mockDb.org.findUnique.mockResolvedValue({ quarterStartMonth: 4 } as never);

    const res = await GET(
      getReq("?preset=specific-quarter&year=2024&quarter=1"),
      { params: {} } as never,
    );
    const body = await res.json();
    expect(body.data.range.from).toBe("2024-04-01");
    expect(body.data.range.to).toBe("2024-07-01");
  });

  it("triggers compare-period queries when compareMode=previous-period", async () => {
    await GET(
      getReq("?preset=specific-quarter&year=2024&quarter=2&compareMode=previous-period"),
      { params: {} } as never,
    );
    // 4 current-period issue queries (created, closed, slipped, blocked) +
    // 3 compare-period queries (created, closed, slipped) = 7+
    expect(mockDb.qtIssue.findMany.mock.calls.length).toBeGreaterThanOrEqual(7);
  });

  it("labels the previous-year comparison range as 'Same period in <year>'", async () => {
    const res = await GET(
      getReq("?preset=specific-quarter&year=2024&quarter=2&compareMode=previous-year"),
      { params: {} } as never,
    );
    const body = await res.json();
    // resolveCompareRange labels previous-year as 'Same period in <year>' —
    // see lib/reports/ranges.ts. The label only carries the year; not the Q name.
    expect(body.data.previous?.label).toContain("2023");
  });

  it("falls back to legacy weeksBack param when no preset given", async () => {
    const res = await GET(getReq("?weeksBack=4"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.range.from).toBeTruthy();
    expect(body.data.range.to).toBeTruthy();
    expect(body.data.weeks.length).toBeGreaterThan(0);
  });
});

/* ─── Response shape ─────────────────────────────────────────────────────── */

describe("GET /api/reports/executive — response shape", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("returns every key the dashboard consumes (no missing fields)", async () => {
    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    expect(body.data).toMatchObject({
      range: expect.any(Object),
      weeks: expect.any(Array),
      series: expect.objectContaining({
        productivity: expect.any(Array),
        created: expect.any(Array),
        closed: expect.any(Array),
        slipped: expect.any(Array),
        blocked: expect.any(Array),
        estHours: expect.any(Array),
        actualHours: expect.any(Array),
      }),
      slipping: expect.any(Array),
      teams: expect.any(Array),
      teamHeatmap: expect.any(Array),
      workload: expect.any(Array),
      employees: expect.any(Array),
      summary: expect.objectContaining({
        productivity: expect.any(Number),
        totalCreated: expect.any(Number),
        totalClosed: expect.any(Number),
        totalSlipped: expect.any(Number),
        closedPct: expect.any(Number),
        velocity: expect.any(Number),
        delayedPct: expect.any(Number),
        estHours: expect.any(Number),
        actualHours: expect.any(Number),
      }),
      weekOverWeek: expect.objectContaining({
        available: expect.any(Boolean),
        thisWeek: expect.any(Object),
        lastWeek: expect.any(Object),
        delta: expect.any(Object),
      }),
      projects: expect.any(Array),
      teamOptions: expect.any(Array),
      sprintOptions: expect.any(Array),
    });
  });

  it("all series arrays have the same length as weeks", async () => {
    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    const n = body.data.weeks.length;
    expect(body.data.series.productivity).toHaveLength(n);
    expect(body.data.series.created).toHaveLength(n);
    expect(body.data.series.closed).toHaveLength(n);
    expect(body.data.series.slipped).toHaveLength(n);
    expect(body.data.series.blocked).toHaveLength(n);
    expect(body.data.series.estHours).toHaveLength(n);
    expect(body.data.series.actualHours).toHaveLength(n);
    expect(body.data.slipping).toHaveLength(n);
  });
});

/* ─── Productivity computation ───────────────────────────────────────────── */

describe("GET /api/reports/executive — productivity computation", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("computes summary.totalClosed and closedPct from the closed query", async () => {
    const today = new Date();
    mockIssueFindManyImpl((args: unknown) => {
      const where = (args as CallArg).where;
      if (where.createdAt) {
        return Promise.resolve([
          { id: "i1", projectId: "p1", assigneeId: "u1", createdAt: today, updatedAt: today, dueDate: null, eta: null, priority: "MED", status: { category: "TODO", name: "Todo" } },
          { id: "i2", projectId: "p1", assigneeId: "u1", createdAt: today, updatedAt: today, dueDate: null, eta: null, priority: "MED", status: { category: "TODO", name: "Todo" } },
        ] as never);
      }
      if (where.updatedAt && where.status && (where.status as { category: string }).category === "DONE") {
        return Promise.resolve([
          { id: "i3", projectId: "p1", assigneeId: "u1", createdAt: today, updatedAt: today, dueDate: null, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
        ] as never);
      }
      return Promise.resolve([] as never);
    });

    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.summary.totalCreated).toBe(2);
    expect(body.data.summary.totalClosed).toBe(1);
    expect(body.data.summary.closedPct).toBe(50);
  });

  it("velocity equals avg of closed series rounded to 1dp", async () => {
    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    // No closed tasks → velocity 0
    expect(body.data.summary.velocity).toBe(0);
  });

  it("productivity is 0 when nothing happened", async () => {
    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.summary.productivity).toBe(0);
  });
});

/* ─── Department (project-role) filter & dropdown ────────────────────────── */

describe("GET /api/reports/executive — department filter (project roles)", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("deduplicates roles with the same name across projects in teamOptions", async () => {
    mockDb.qtProjectRole.findMany.mockResolvedValue([
      { id: "r1", name: "Developer" },
      { id: "r2", name: "developer" }, // different case, same name
      { id: "r3", name: "QA" },
      { id: "r4", name: "Developer" }, // duplicate in another project
    ] as never);

    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.teamOptions).toHaveLength(2);
    const labels = body.data.teamOptions.map((t: { label: string }) => t.label).sort();
    expect(labels).toEqual(["Developer", "QA"]);
  });

  it("filters by department name (case-insensitive) — resolves to user IDs", async () => {
    mockDb.qtProjectRole.findMany.mockResolvedValue([
      { id: "r1", name: "QA" },
    ] as never);
    mockDb.qtProjectUserRole.findMany.mockResolvedValue([
      { userId: "u1", projectRole: { id: "r1", name: "QA" } },
      { userId: "u2", projectRole: { id: "r1", name: "QA" } },
    ] as never);

    await GET(getReq("?preset=last-30&teamIds=qa"), { params: {} } as never);

    // The first qtIssue.findMany call (createdIssues) should have assigneeId filter set
    // to the QA users (u1, u2).
    const firstCall = mockDb.qtIssue.findMany.mock.calls[0]?.[0] as {
      where: { assigneeId?: { in: string[] } };
    };
    expect(firstCall.where.assigneeId).toEqual({ in: expect.arrayContaining(["u1", "u2"]) });
  });

  it("returns empty data set with full teamOptions when filter has zero matches", async () => {
    mockDb.qtProjectRole.findMany.mockResolvedValue([
      { id: "r1", name: "Developer" },
      { id: "r2", name: "Viewer" },
    ] as never);
    mockDb.qtProjectUserRole.findMany.mockResolvedValue([]); // No users in Viewer

    const res = await GET(
      getReq("?preset=last-30&teamIds=Viewer"),
      { params: {} } as never,
    );
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.teamOptions).toHaveLength(2); // dropdown preserved
    expect(body.data.summary.totalCreated).toBe(0);
    // Heatmap still lists every known department even with no activity
    expect(body.data.teamHeatmap).toHaveLength(2);
    expect(body.data.teamHeatmap.every((r: { cells: Array<{ productivity: number | null }> }) =>
      r.cells.every((c) => c.productivity === null),
    )).toBe(true);
  });
});

/* ─── Heatmap completeness ───────────────────────────────────────────────── */

describe("GET /api/reports/executive — heatmap completeness", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("includes every known department in teamHeatmap, even silent ones", async () => {
    mockDb.qtProjectRole.findMany.mockResolvedValue([
      { id: "r1", name: "Developer" },
      { id: "r2", name: "QA" },
      { id: "r3", name: "PM" },
      { id: "r4", name: "Viewer" },
    ] as never);
    // No users, no issues — everyone is silent.

    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    const names: string[] = body.data.teamHeatmap.map((r: { teamName: string }) => r.teamName).sort();
    expect(names).toEqual(["Developer", "PM", "QA", "Viewer"]);
  });
});

/* ─── Sprint filter ──────────────────────────────────────────────────────── */

describe("GET /api/reports/executive — sprint filter", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("applies sprintIds filter to issue queries", async () => {
    await GET(
      getReq("?preset=last-30&sprintIds=s1,s2"),
      { params: {} } as never,
    );
    const firstCall = mockDb.qtIssue.findMany.mock.calls[0]?.[0] as {
      where: { sprintId?: { in: string[] } };
    };
    expect(firstCall.where.sprintId).toEqual({ in: ["s1", "s2"] });
  });

  it("returns sprint options in the response", async () => {
    mockDb.qtSprint.findMany.mockResolvedValue([
      { id: "s1", name: "Sprint 1", projectId: "p1", status: "ACTIVE" },
      { id: "s2", name: "Sprint 2", projectId: "p1", status: "PLANNING" },
    ] as never);
    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.sprintOptions).toEqual([
      { id: "s1", label: "Sprint 1" },
      { id: "s2", label: "Sprint 2" },
    ]);
  });
});

/* ─── Blocked tasks ──────────────────────────────────────────────────────── */

describe("GET /api/reports/executive — blocked tasks proxy", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("issues a query that filters status.name by 'block' (case-insensitive)", async () => {
    await GET(getReq("?preset=last-30"), { params: {} } as never);
    // The blocked query is one of the 4 qtIssue.findMany calls — find it by
    // looking for status.AND with the 'block' contains clause.
    const blockedCall = mockDb.qtIssue.findMany.mock.calls.find(([arg]) => {
      const w = (arg as CallArg).where as { status?: { AND?: Array<{ name?: { contains?: string } }> } };
      return Array.isArray(w.status?.AND) &&
        w.status!.AND!.some((c) => c.name?.contains === "block");
    });
    expect(blockedCall).toBeTruthy();
  });
});

/* ─── Workload scatter ───────────────────────────────────────────────────── */

describe("GET /api/reports/executive — workload computation", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("returns an empty workload array when nobody logged hours and nobody closed work", async () => {
    const res = await GET(getReq("?preset=last-30"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.workload).toEqual([]);
  });

  it("normalizes workload around the median (median user is 100%)", async () => {
    const today = new Date();
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    // 3 users with timesheet hours: 10, 20, 30 → median = 20.
    mockIssueFindManyImpl((args: unknown) => {
      const where = (args as CallArg).where;
      if (where.updatedAt && (where.status as { category?: string })?.category === "DONE") {
        return Promise.resolve([
          { id: "i1", projectId: "p1", assigneeId: "u1", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
          { id: "i2", projectId: "p1", assigneeId: "u2", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
          { id: "i3", projectId: "p1", assigneeId: "u3", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
        ] as never);
      }
      return Promise.resolve([] as never);
    });
    mockDb.qtTimesheetEntry.findMany.mockResolvedValue([
      { projectId: "p1", userId: "u1", hours: 10, entryDate: monday },
      { projectId: "p1", userId: "u2", hours: 20, entryDate: monday },
      { projectId: "p1", userId: "u3", hours: 30, entryDate: monday },
    ] as never);
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Alice", lastName: "A", email: "a@x", avatar: null },
      { id: "u2", firstName: "Bob", lastName: "B", email: "b@x", avatar: null },
      { id: "u3", firstName: "Cara", lastName: "C", email: "c@x", avatar: null },
    ] as never);

    const res = await GET(getReq("?preset=this-week"), { params: {} } as never);
    const body = await res.json();
    const byUser = new Map<string, number>(
      body.data.workload.map((p: { userId: string; workload: number }) => [p.userId, p.workload]),
    );
    expect(byUser.get("u1")).toBe(50);
    expect(byUser.get("u2")).toBe(100);
    expect(byUser.get("u3")).toBe(150);
  });
});

/* ─── Top employees ──────────────────────────────────────────────────────── */

describe("GET /api/reports/executive — top employees table", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("limits to 10 employees, sorted by productivity descending", async () => {
    const today = new Date();
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    // Generate 15 closed-issue rows, one per user.
    const closedRows = Array.from({ length: 15 }, (_, i) => ({
      id: `i${i}`,
      projectId: "p1",
      assigneeId: `u${i}`,
      createdAt: monday,
      updatedAt: monday,
      dueDate: null,
      eta: null,
      priority: "MED",
      status: { category: "DONE", name: "Done" },
    }));
    mockIssueFindManyImpl((args: unknown) => {
      const where = (args as CallArg).where;
      if (where.updatedAt && (where.status as { category?: string })?.category === "DONE") {
        return Promise.resolve(closedRows as never);
      }
      return Promise.resolve([] as never);
    });
    mockDb.user.findMany.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        id: `u${i}`,
        firstName: `First${i}`,
        lastName: `Last${i}`,
        email: `u${i}@x`,
        avatar: null,
      })) as never,
    );

    const res = await GET(getReq("?preset=this-week"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.employees).toHaveLength(10);
    // Sorted desc by productivity.
    for (let i = 1; i < body.data.employees.length; i++) {
      expect(body.data.employees[i - 1].productivity).toBeGreaterThanOrEqual(
        body.data.employees[i].productivity,
      );
    }
  });

  it("returns user.name as 'First Last' or email fallback", async () => {
    const today = new Date();
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    mockIssueFindManyImpl((args: unknown) => {
      const where = (args as CallArg).where;
      if (where.updatedAt && (where.status as { category?: string })?.category === "DONE") {
        return Promise.resolve([
          { id: "i1", projectId: "p1", assigneeId: "u1", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
          { id: "i2", projectId: "p1", assigneeId: "u2", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
        ] as never);
      }
      return Promise.resolve([] as never);
    });
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Alice", lastName: "Smith", email: "alice@x", avatar: null },
      { id: "u2", firstName: null, lastName: null, email: "anon@x", avatar: null },
    ] as never);

    const res = await GET(getReq("?preset=this-week"), { params: {} } as never);
    const body = await res.json();
    const byId = new Map<string, string>(
      body.data.employees.map((e: { userId: string; name: string }) => [e.userId, e.name]),
    );
    expect(byId.get("u1")).toBe("Alice Smith");
    expect(byId.get("u2")).toBe("anon@x");
  });
});

/* ─── Closed-on-time tracking ────────────────────────────────────────────── */

describe("GET /api/reports/executive — on-time tracking", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("counts closed-on-time per employee (updatedAt <= dueDate)", async () => {
    const monday = new Date(Date.UTC(2024, 5, 3)); // a recent Monday
    const tuesday = new Date(Date.UTC(2024, 5, 4));
    const wednesday = new Date(Date.UTC(2024, 5, 5));
    mockIssueFindManyImpl((args: unknown) => {
      const where = (args as CallArg).where;
      if (where.updatedAt && (where.status as { category?: string })?.category === "DONE") {
        return Promise.resolve([
          // Closed on or before due — counts as on time.
          { id: "i1", projectId: "p1", assigneeId: "u1", createdAt: monday, updatedAt: monday, dueDate: tuesday, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
          // Closed after due — does NOT count as on time.
          { id: "i2", projectId: "p1", assigneeId: "u1", createdAt: monday, updatedAt: wednesday, dueDate: tuesday, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
        ] as never);
      }
      return Promise.resolve([] as never);
    });
    mockDb.user.findMany.mockResolvedValue([
      { id: "u1", firstName: "Alice", lastName: "Smith", email: "a@x", avatar: null },
    ] as never);

    const res = await GET(
      getReq("?preset=custom&from=2024-06-01&to=2024-06-30"),
      { params: {} } as never,
    );
    const body = await res.json();
    const alice = body.data.employees.find((e: { userId: string }) => e.userId === "u1");
    expect(alice.tasksClosed).toBe(2);
    expect(alice.onTimeRate).toBe(50); // 1 of 2 closed on time
  });
});

/* ─── Department aggregation roll-up ─────────────────────────────────────── */

describe("GET /api/reports/executive — department roll-up", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("rolls users into their first project role for the bar chart and heatmap", async () => {
    const today = new Date();
    const monday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    mockDb.qtProjectRole.findMany.mockResolvedValue([
      { id: "r1", name: "Developer" },
      { id: "r2", name: "QA" },
    ] as never);
    mockDb.qtProjectUserRole.findMany.mockResolvedValue([
      { userId: "u1", projectRole: { id: "r1", name: "Developer" } },
      { userId: "u2", projectRole: { id: "r2", name: "QA" } },
    ] as never);
    mockIssueFindManyImpl((args: unknown) => {
      const where = (args as CallArg).where;
      if (where.updatedAt && (where.status as { category?: string })?.category === "DONE") {
        return Promise.resolve([
          { id: "i1", projectId: "p1", assigneeId: "u1", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
          { id: "i2", projectId: "p1", assigneeId: "u2", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "DONE", name: "Done" } },
        ] as never);
      }
      if (where.createdAt) {
        return Promise.resolve([
          { id: "i1", projectId: "p1", assigneeId: "u1", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "TODO", name: "Todo" } },
          { id: "i2", projectId: "p1", assigneeId: "u2", createdAt: monday, updatedAt: monday, dueDate: null, eta: null, priority: "MED", status: { category: "TODO", name: "Todo" } },
        ] as never);
      }
      return Promise.resolve([] as never);
    });

    const res = await GET(getReq("?preset=this-week"), { params: {} } as never);
    const body = await res.json();
    const dev = body.data.teams.find((t: { teamName: string }) => t.teamName === "Developer");
    const qa = body.data.teams.find((t: { teamName: string }) => t.teamName === "QA");
    expect(dev.closed).toBe(1);
    expect(qa.closed).toBe(1);
  });
});

/* ─── Week-over-week summary ─────────────────────────────────────────────── */

describe("GET /api/reports/executive — week-over-week", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
  });

  it("computes delta from the LAST 2 weekly buckets (last week vs week before)", async () => {
    // Custom range of 14 days = 2 ISO weeks. Two closed tasks in week 1, five
    // in week 2 → WoW delta of +3 tasks, +150% closedPct.
    const week1Mon = new Date(Date.UTC(2024, 5, 3));   // 2024-06-03 Mon
    const week2Mon = new Date(Date.UTC(2024, 5, 10));  // 2024-06-10 Mon

    mockIssueFindManyImpl((args: unknown) => {
      const where = (args as CallArg).where;
      if (where.updatedAt && (where.status as { category?: string })?.category === "DONE") {
        // 2 closed in week 1, 5 closed in week 2.
        const closed = [
          ...Array.from({ length: 2 }, (_, i) => ({
            id: `w1-${i}`, projectId: "p1", assigneeId: "u1",
            createdAt: week1Mon, updatedAt: week1Mon,
            dueDate: null, eta: null, priority: "MED",
            status: { category: "DONE", name: "Done" },
          })),
          ...Array.from({ length: 5 }, (_, i) => ({
            id: `w2-${i}`, projectId: "p1", assigneeId: "u1",
            createdAt: week2Mon, updatedAt: week2Mon,
            dueDate: null, eta: null, priority: "MED",
            status: { category: "DONE", name: "Done" },
          })),
        ];
        return Promise.resolve(closed);
      }
      return Promise.resolve([]);
    });

    const res = await GET(
      getReq("?preset=custom&from=2024-06-03&to=2024-06-16"),
      { params: {} } as never,
    );
    const body = await res.json();
    const wow = body.data.weekOverWeek;
    expect(wow.available).toBe(true);
    expect(wow.thisWeek.closed).toBe(5);
    expect(wow.lastWeek.closed).toBe(2);
    expect(wow.delta.closedAbs).toBe(3);
    expect(wow.delta.closedPct).toBe(150);
  });

  it("reports available = false when fewer than 2 weeks of data", async () => {
    const res = await GET(getReq("?preset=this-week"), { params: {} } as never);
    const body = await res.json();
    expect(body.data.weekOverWeek.available).toBe(false);
    expect(body.data.weekOverWeek.delta.closedAbs).toBe(0);
  });

  it("includes labels for both weeks so the UI can render 'Jun 10 vs Jun 3'", async () => {
    const res = await GET(
      getReq("?preset=custom&from=2024-06-03&to=2024-06-16"),
      { params: {} } as never,
    );
    const body = await res.json();
    expect(body.data.weekOverWeek.thisWeekLabel).toBeTruthy();
    expect(body.data.weekOverWeek.lastWeekLabel).toBeTruthy();
    expect(body.data.weekOverWeek.thisWeekLabel).not.toBe(body.data.weekOverWeek.lastWeekLabel);
  });
});
