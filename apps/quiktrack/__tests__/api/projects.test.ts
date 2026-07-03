import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { GET, POST } from "@/app/api/projects/route";

const USER = "user_1";
const TENANT = "tenant_1";

function getReq(qs = "") {
  return new NextRequest(`http://localhost/api/projects${qs}`, { method: "GET" });
}
function postReq(body: unknown) {
  return new NextRequest("http://localhost/api/projects", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("GET /api/projects — auth", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await GET(getReq(), { params: {} } as never);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/projects — scoping", () => {
  beforeEach(() => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
  });

  it("filters by orgId on count and findMany", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);
    mockDb.qtProject.count.mockResolvedValue(0);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    await GET(getReq(), { params: {} } as never);

    const findCall = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      where: { orgId: string; members?: unknown };
    };
    const countCall = mockDb.qtProject.count.mock.calls[0]?.[0] as {
      where: { orgId: string };
    };
    expect(findCall.where.orgId).toBe(TENANT);
    expect(countCall.where.orgId).toBe(TENANT);
    // Non-admin gets project membership filter applied
    expect(findCall.where.members).toBeTruthy();
  });

  it("admin gets all tenant projects (no membership filter)", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.count.mockResolvedValue(0);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    await GET(getReq(), { params: {} } as never);

    const findCall = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(findCall.where.members).toBeUndefined();
  });

  it("applies search filter to name/projectKey", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.count.mockResolvedValue(0);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    await GET(getReq("?search=foo"), { params: {} } as never);
    const call = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      where: { OR: Array<Record<string, unknown>> };
    };
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR.length).toBe(2);
  });

  it("applies projectType filter when ?filter= is set", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.count.mockResolvedValue(0);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    await GET(getReq("?filter=software,service"), { params: {} } as never);
    const call = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      where: { projectType: { in: string[] } };
    };
    expect(call.where.projectType.in).toEqual(["software", "service"]);
  });

  it("paginates with skip + take when pageSize is set", async () => {
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.count.mockResolvedValue(42);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    const res = await GET(getReq("?page=3&pageSize=5"), { params: {} } as never);
    const body = await res.json();
    expect(body.totalPages).toBe(Math.ceil(42 / 5));

    const call = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      skip: number;
      take: number;
    };
    expect(call.skip).toBe(10);
    expect(call.take).toBe(5);
  });
});

describe("GET /api/projects — views (archive/trash)", () => {
  it("defaults to the active view (status=active, not deleted)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.count.mockResolvedValue(0);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    await GET(getReq(), { params: {} } as never);
    const call = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.isDeleted).toBe(false);
    expect(call.where.status).toBe("active");
  });

  it("view=archived filters to status=archived, not deleted", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.count.mockResolvedValue(0);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    await GET(getReq("?view=archived"), { params: {} } as never);
    const call = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.status).toBe("archived");
    expect(call.where.isDeleted).toBe(false);
  });

  it("view=trash is forbidden (403) for non-admins", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "member" } as never);

    const res = await GET(getReq("?view=trash"), { params: {} } as never);
    expect(res.status).toBe(403);
  });

  it("view=trash returns soft-deleted projects for admins (no status/member filter)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.count.mockResolvedValue(0);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    await GET(getReq("?view=trash"), { params: {} } as never);
    const call = mockDb.qtProject.findMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
    };
    expect(call.where.isDeleted).toBe(true);
    expect(call.where.status).toBeUndefined();
    expect(call.where.members).toBeUndefined();
  });

  it("exposes isAdmin in the response payload", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({ role: "admin" } as never);
    mockDb.qtProject.count.mockResolvedValue(0);
    mockDb.qtProject.findMany.mockResolvedValue([]);

    const res = await GET(getReq(), { params: {} } as never);
    const body = await res.json();
    expect(body.isAdmin).toBe(true);
  });
});

describe("POST /api/projects", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await POST(
      postReq({ name: "X", projectKey: "X1" }),
      { params: {} } as never,
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 on invalid input", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    const res = await POST(postReq({ name: "" }), { params: {} } as never);
    expect(res.status).toBe(400);
  });

  it("returns 409 on duplicate projectKey within tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.qtProject.findFirst.mockResolvedValue({ id: "dup" } as never);

    const res = await POST(
      postReq({ name: "Dup", projectKey: "DUP" }),
      { params: {} } as never,
    );
    expect(res.status).toBe(409);
  });
});
