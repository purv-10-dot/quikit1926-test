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
    expect(args?.where?.type).toEqual({ notIn: ["EPIC", "SUBTASK"] });
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
    expect(args?.where?.type).toEqual({ not: "EPIC" });
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
    expect(args?.where?.type).toBe("SUBTASK");
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
