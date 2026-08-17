import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET } from "@/app/api/mcp-audit-log/route";

const USER = "user_1";
const ORG = "org_1";

function getReq(qs = "") {
  return new NextRequest(`http://localhost/api/mcp-audit-log${qs}`, { method: "GET" });
}

const ENTRY = {
  id: "log_1",
  createdAt: new Date("2026-08-17T10:00:00.000Z"),
  userId: USER,
  actorType: "agent",
  projectId: "proj_1",
  tool: "create_issue",
  action: "CREATE",
  entityType: "issue",
  entityId: "issue_1",
  entityKey: "QUIKTR-1",
  payload: { title: "x" },
  before: null,
  after: { id: "issue_1" },
  result: "success",
  errorMessage: null,
};

beforeEach(() => {
  resetMockDb();
  mockDb.qtMcpActionLog.count.mockResolvedValue(1);
  mockDb.qtMcpActionLog.findMany.mockResolvedValue([ENTRY] as never);
  // groupBy's deep-mock type isn't a plain mock fn — cast to set its result
  // (same pattern as board-columns.test.ts / workflow-publish.test.ts).
  (mockDb.qtMcpActionLog.groupBy as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  mockDb.user.findMany.mockResolvedValue([
    { id: USER, firstName: "A", lastName: "B", email: "a@x.io", avatar: null },
  ] as never);
});

describe("GET /api/mcp-audit-log", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(401);
  });

  it("scopes the query to the caller's org", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);

    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(200);
    expect(mockDb.qtMcpActionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ orgId: ORG }) }),
    );
  });

  it("an org admin sees entries across every project (no projectId restriction)", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);

    await GET(getReq(), { params: {} } as never);
    const call = mockDb.qtMcpActionLog.findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(call.where.projectId).toBeUndefined();
  });

  it("a non-admin with no Space Admin projects gets an empty result, not every org's entries", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue(null as never);
    mockDb.qtProjectUserRole.findMany.mockResolvedValue([] as never);

    const res = await GET(getReq(), { params: {} } as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.entries).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(mockDb.qtMcpActionLog.findMany).not.toHaveBeenCalled();
  });

  it("a Space Admin sees only their own projects' entries", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue(null as never);
    mockDb.qtProjectUserRole.findMany.mockResolvedValue([{ projectId: "proj_1" }] as never);

    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(200);
    const call = mockDb.qtMcpActionLog.findMany.mock.calls[0]![0] as {
      where: { projectId?: { in: string[] } };
    };
    expect(call.where.projectId).toEqual({ in: ["proj_1"] });
  });

  it("filters by tool/entityType/action/date-range", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);

    await GET(
      getReq("?tool=create_issue&entityType=issue&action=CREATE&from=2026-08-01&to=2026-08-31"),
      { params: {} } as never,
    );
    const call = mockDb.qtMcpActionLog.findMany.mock.calls[0]![0] as {
      where: { tool?: string; entityType?: string; action?: string; createdAt?: { gte: Date; lt: Date } };
    };
    expect(call.where.tool).toBe("create_issue");
    expect(call.where.entityType).toBe("issue");
    expect(call.where.action).toBe("CREATE");
    expect(call.where.createdAt).toEqual({ gte: new Date("2026-08-01"), lt: new Date("2026-08-31") });
  });

  it("returns the expected pagination shape", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtMcpActionLog.count.mockResolvedValue(45);

    const res = await GET(getReq("?page=2&pageSize=20"), { params: {} } as never);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.page).toBe(2);
    expect(body.data.pageSize).toBe(20);
    expect(body.data.total).toBe(45);
    expect(body.data.totalPages).toBe(3);
    expect(mockDb.qtMcpActionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
  });

  it("a project member (not admin/space-admin) can still see a single issue's own MCP log via entityId", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.app.findUnique.mockResolvedValue(null as never);
    mockDb.qtProject.findFirst.mockResolvedValue({ id: "proj_1" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "member_1", projectRoleId: null } as never);

    const res = await GET(
      getReq("?entityType=issue&entityId=issue_1&projectId=proj_1"),
      { params: {} } as never,
    );
    expect(res.status).toBe(200);
    expect(mockDb.qtMcpActionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ entityId: "issue_1", projectId: "proj_1" }) }),
    );
  });
});
