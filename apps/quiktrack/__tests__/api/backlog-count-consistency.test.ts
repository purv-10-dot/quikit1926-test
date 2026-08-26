/**
 * REGRESSION — a backlog section's header count and its expanded rows must
 * describe the same set of work items.
 *
 * They come from two different endpoints:
 *   - collapsed header  -> GET /api/issues/section-counts  (grouped count)
 *   - expanded row list -> GET /api/issues                 (the rows)
 *
 * Each used to build its own copy of the `where`, so any filter added to one
 * and forgotten in the other produced a section that read "2 work items"
 * collapsed and "No items in this sprint" expanded. Two filters had drifted
 * that way: the due-date range (section-counts ignored it entirely) and the
 * board-mapped-status restriction (the backlog hides items whose status isn't
 * mapped to a board column; the count included them).
 *
 * Both routes now compose the same fragments from lib/services/issueFilters.
 * These tests assert that property on what each route hands Prisma — comparing
 * the clauses directly, because the numbers themselves only diverge against
 * real data.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET as listIssues } from "@/app/api/issues/route";
import { GET as sectionCounts } from "@/app/api/issues/section-counts/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";
const SPRINT = "sprint_1";
const MAPPED = ["st_todo", "st_doing"];

const ROUTE_CTX = { params: {} } as never;

type Where = { AND?: unknown[] } & Record<string, unknown>;

/**
 * Prisma's `groupBy` is heavily overloaded, so vitest-mock-extended can't
 * surface the mock API on it through its own types. Cast to just the bits used.
 */
type MockFn = {
  mockResolvedValue: (v: unknown) => void;
  mock: { calls: Array<[{ where?: Where }]> };
};
const groupByMock = () => mockDb.qtIssue.groupBy as unknown as MockFn;

/** The filters the backlog panel can have active, all at once. */
const FILTERS =
  "search=login" +
  "&assigneeId=u1,u2" +
  "&type=BUG" +
  "&priority=HIGH" +
  "&epicId=epic_1" +
  "&dueFrom=2026-08-12T00%3A00%3A00.000Z" +
  "&dueTo=2026-08-19T23%3A59%3A59.999Z";

/**
 * Both routes need the same access + board setup. Re-applied between the two
 * calls in a comparison test, since each route inspects `mock.calls[0]`.
 */
function stubDeps() {
  resetMockDb();
  setSession({ id: USER, orgId: TENANT, role: "member" });
  mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
  mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
  mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
  // The project HAS board columns, so the mapped-status restriction is live.
  mockDb.qtBoardColumn.findFirst.mockResolvedValue({ id: "col_1" } as never);
  mockDb.qtBoardColumnStatus.findMany.mockResolvedValue(
    MAPPED.map((statusId) => ({ statusId })) as never,
  );
  mockDb.qtIssue.findMany.mockResolvedValue([] as never);
  mockDb.qtIssue.count.mockResolvedValue(0 as never);
  mockDb.qtIssueStatus.findMany.mockResolvedValue([] as never);
  groupByMock().mockResolvedValue([]);
}

beforeEach(stubDeps);

/** `where` handed to Prisma by the rows query. */
async function rowsWhere(extra: string): Promise<Where> {
  const res = await listIssues(
    new NextRequest(
      `http://localhost/api/issues?projectId=${PROJECT}&sprintId=${SPRINT}` +
        `&excludeType=EPIC,SUBTASK&boardMappedOnly=1&limit=50&${extra}`,
    ),
    ROUTE_CTX,
  );
  expect(res.status).toBe(200);
  return mockDb.qtIssue.findMany.mock.calls[0]?.[0]?.where as Where;
}

/** `where` handed to Prisma by the header-count query. */
async function countsWhere(extra: string): Promise<Where> {
  const res = await sectionCounts(
    new NextRequest(
      `http://localhost/api/issues/section-counts?projectId=${PROJECT}` +
        `&excludeType=EPIC,SUBTASK&boardMappedOnly=1&${extra}`,
    ),
    ROUTE_CTX,
  );
  expect(res.status).toBe(200);
  return groupByMock().mock.calls[0]?.[0]?.where as Where;
}

describe("backlog section count vs rows", () => {
  it("applies an identical filter clause set on both endpoints", async () => {
    const rows = await rowsWhere(FILTERS);
    stubDeps();
    const counts = await countsWhere(FILTERS);

    // The section-specific parts legitimately differ (the rows query scopes to
    // one sprint; the counts query groups by sprint). The FILTERS must not.
    expect(counts.AND).toEqual(rows.AND);
    expect(rows.AND).toEqual(
      expect.arrayContaining([
        { type: "BUG" },
        { epicId: "epic_1" },
        { priority: "HIGH" },
        { assigneeId: { in: ["u1", "u2"] } },
        {
          dueDate: {
            gte: new Date("2026-08-12T00:00:00.000Z"),
            lte: new Date("2026-08-19T23:59:59.999Z"),
          },
        },
      ]),
    );
  });

  it("carries the due-date filter into the count (the reported bug)", async () => {
    const counts = await countsWhere("assigneeId=u1&dueTo=2026-08-11T23%3A59%3A59.999Z");
    expect(counts.AND).toContainEqual({
      dueDate: { lte: new Date("2026-08-11T23:59:59.999Z") },
    });
  });

  it("hides unmapped-status items from the count, as the rows do", async () => {
    const counts = await countsWhere("assigneeId=u1");
    expect(counts.statusId).toEqual({ in: MAPPED });
  });

  it("lets an explicit status filter override the mapped-status restriction on both", async () => {
    // /api/issues gives an explicit statusId precedence over boardMappedOnly;
    // the counts endpoint has to make the same choice, or the two disagree
    // whenever someone filters by a status that isn't on the board.
    const rows = await rowsWhere("statusId=st_archived");
    expect(rows.statusId).toBe("st_archived");

    stubDeps();
    const counts = await countsWhere("statusId=st_archived");
    expect(counts.statusId).toBeUndefined();
    expect(counts.AND).toContainEqual({ statusId: "st_archived" });
  });

  it("excludes epics and subtasks from the count, as the backlog rows do", async () => {
    const counts = await countsWhere("");
    expect(counts.AND).toContainEqual({ type: { notIn: ["EPIC", "SUBTASK"] } });
  });
});
