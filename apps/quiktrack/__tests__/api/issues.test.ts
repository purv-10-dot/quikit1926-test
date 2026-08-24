import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/issues/route";

const USER = "user_1";
const TENANT = "tenant_1";
const PROJECT = "proj_1";

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

function listReq(query: string) {
  return new NextRequest(`http://localhost/api/issues?${query}`);
}

function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/issues", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const ROUTE_CTX = { params: {} } as never;

/**
 * Filter clauses live in `where.AND` (see lib/services/issueFilters.ts): both
 * this route and /api/issues/section-counts compose the SAME fragments there,
 * which is what stops the backlog's section header count from disagreeing with
 * the rows it expands to show. Prisma treats a top-level key and a
 * single-element AND identically, so this is a shape change, not a behaviour
 * one — these helpers just look in the right place.
 */
type Where = { AND?: Record<string, unknown>[] } & Record<string, unknown>;
function andFragment(where: Where | undefined, key: string) {
  return (where?.AND ?? []).find((f) => key in f)?.[key];
}

describe("GET /api/issues", () => {
  it("401 when unauthenticated", async () => {
    const res = await GET(listReq(`projectId=${PROJECT}`), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("400 when projectId is missing", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await GET(listReq(""), ROUTE_CTX);
    expect(res.status).toBe(400);
  });

  it("404 when the project is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await GET(listReq(`projectId=${PROJECT}`), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  it("translates excludeType=EPIC,SUBTASK into a Prisma notIn filter", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtIssue.count.mockResolvedValue(0 as never);

    const res = await GET(listReq(`projectId=${PROJECT}&excludeType=EPIC,SUBTASK`), ROUTE_CTX);
    expect(res.status).toBe(200);

    const args = mockDb.qtIssue.findMany.mock.calls[0]?.[0];
    expect(andFragment(args?.where as Where, "type")).toEqual({
      notIn: ["EPIC", "SUBTASK"],
    });
  });

  it("translates excludeType=EPIC (single) into a Prisma not filter", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtIssue.count.mockResolvedValue(0 as never);

    const res = await GET(listReq(`projectId=${PROJECT}&excludeType=EPIC`), ROUTE_CTX);
    expect(res.status).toBe(200);

    const args = mockDb.qtIssue.findMany.mock.calls[0]?.[0];
    expect(andFragment(args?.where as Where, "type")).toEqual({ not: "EPIC" });
  });

  // Regression: a specific `type` filter must WIN over `excludeType` (the backlog
  // sends both). Previously the two `type` keys were spread separately and the
  // excludeType clause clobbered the type filter, so picking "Bug" returned every
  // non-epic/non-subtask type.
  it("type filter wins over excludeType when both are present", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtIssue.count.mockResolvedValue(0 as never);

    const res = await GET(
      listReq(`projectId=${PROJECT}&type=BUG&excludeType=EPIC,SUBTASK`),
      ROUTE_CTX,
    );
    expect(res.status).toBe(200);

    const args = mockDb.qtIssue.findMany.mock.calls[0]?.[0];
    expect(andFragment(args?.where as Where, "type")).toBe("BUG");
  });

  it("filters by parentId for subtask listings", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtIssue.count.mockResolvedValue(0 as never);

    const res = await GET(
      listReq(`projectId=${PROJECT}&parentId=parent_1&type=SUBTASK&limit=20`),
      ROUTE_CTX,
    );
    expect(res.status).toBe(200);

    const args = mockDb.qtIssue.findMany.mock.calls[0]?.[0];
    expect(args?.where?.parentId).toBe("parent_1");
    expect(andFragment(args?.where as Where, "type")).toBe("SUBTASK");
  });

  // assigneeId accepts a comma list so the multi-select people filter (board,
  // backlog, list, grouped kanban) can scope to several assignees at once.
  async function whereForAssignee(assigneeId: string) {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtIssue.count.mockResolvedValue(0 as never);

    const res = await GET(
      listReq(`projectId=${PROJECT}&assigneeId=${encodeURIComponent(assigneeId)}`),
      ROUTE_CTX,
    );
    expect(res.status).toBe(200);
    return mockDb.qtIssue.findMany.mock.calls[0]?.[0]?.where;
  }

  it("translates a single assigneeId into an equality match", async () => {
    const where = await whereForAssignee("u1");
    expect(where?.AND).toEqual([{ assigneeId: "u1" }]);
  });

  it("translates a comma-separated assigneeId list into an IN filter", async () => {
    const where = await whereForAssignee("u1,u2,u3");
    expect(where?.AND).toEqual([{ assigneeId: { in: ["u1", "u2", "u3"] } }]);
  });

  it("translates assigneeId=null into an unassigned match", async () => {
    const where = await whereForAssignee("null");
    expect(where?.AND).toEqual([{ assigneeId: null }]);
  });

  it("translates a mixed null + ids list into an OR (unassigned or listed)", async () => {
    const where = await whereForAssignee("null,u1,u2");
    expect(where?.AND).toEqual([
      { OR: [{ assigneeId: null }, { assigneeId: { in: ["u1", "u2"] } }] },
    ]);
  });

  // Due-date filter (backlog Filter panel). The caller sends absolute bounds —
  // only the browser knows the viewer's local "today" — so this route is a
  // plain range filter. The clause is nested in AND so it can never collide
  // with the search OR or the assignee clause.
  async function whereForQuery(query: string) {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: PROJECT } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    mockDb.qtIssue.count.mockResolvedValue(0 as never);

    const res = await GET(listReq(`projectId=${PROJECT}&${query}`), ROUTE_CTX);
    expect(res.status).toBe(200);
    return mockDb.qtIssue.findMany.mock.calls[0]?.[0]?.where;
  }

  it("applies no due-date clause when no due params are sent", async () => {
    const where = await whereForQuery("limit=50");
    expect(where?.AND).toBeUndefined();
  });

  it("translates dueDate=none into an is-null match", async () => {
    const where = await whereForQuery("dueDate=none");
    expect(where?.AND).toEqual([{ dueDate: null }]);
  });

  it("translates dueTo alone into an upper bound (the Overdue preset)", async () => {
    const where = await whereForQuery("dueTo=2026-08-11T23%3A59%3A59.999Z");
    expect(where?.AND).toEqual([
      { dueDate: { lte: new Date("2026-08-11T23:59:59.999Z") } },
    ]);
  });

  it("translates dueFrom + dueTo into an inclusive range", async () => {
    const where = await whereForQuery(
      "dueFrom=2026-08-12T00%3A00%3A00.000Z&dueTo=2026-08-19T23%3A59%3A59.999Z",
    );
    expect(where?.AND).toEqual([
      {
        dueDate: {
          gte: new Date("2026-08-12T00:00:00.000Z"),
          lte: new Date("2026-08-19T23:59:59.999Z"),
        },
      },
    ]);
  });

  it("ignores an unparseable bound rather than 500ing on a stale URL", async () => {
    const where = await whereForQuery("dueFrom=not-a-date");
    expect(where?.AND).toBeUndefined();
  });

  it("keeps the due-date and assignee clauses side by side in AND", async () => {
    const where = await whereForQuery("assigneeId=u1&dueDate=none");
    expect(where?.AND).toEqual([{ assigneeId: "u1" }, { dueDate: null }]);
  });
});

describe("POST /api/issues", () => {
  it("401 when unauthenticated", async () => {
    const res = await POST(postReq({ projectId: PROJECT, title: "x" }), ROUTE_CTX);
    expect(res.status).toBe(401);
  });

  it("400 on invalid input (missing title)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(postReq({ projectId: PROJECT }), ROUTE_CTX);
    expect(res.status).toBe(400);
  });

  it("404 when the project is in another tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue(null);
    const res = await POST(postReq({ projectId: PROJECT, title: "x" }), ROUTE_CTX);
    expect(res.status).toBe(404);
  });

  it("accepts SUBTASK + parentId and persists the relation", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({
      id: PROJECT,
      projectKey: "QT",
    } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "m" } as never);
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.$transaction.mockImplementation(async (cb: unknown) => {
      const tx = {
        // getInitialStatusId checks for an active workflow first; null → falls
        // back to getDefaultStatusId (qtIssueStatus.findFirst below).
        qtWorkflow: { findFirst: () => Promise.resolve(null) },
        qtIssueStatus: {
          findFirst: () => Promise.resolve({ id: "status_1" }),
        },
        qtIssue: {
          count: () => Promise.resolve(0),
          create: ({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ id: "issue_1", ...data }),
        },
      };
      return (cb as (t: unknown) => Promise<unknown>)(tx);
    });

    const res = await POST(
      postReq({
        projectId: PROJECT,
        title: "Subtask",
        type: "SUBTASK",
        parentId: "parent_1",
      }),
      ROUTE_CTX,
    );
    expect(res.status).toBe(201);
  });
});
