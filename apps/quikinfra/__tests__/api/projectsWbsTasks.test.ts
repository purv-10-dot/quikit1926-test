import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// The WBS routes gate through `withOrgAuthForResource` (lib/api/withOrgAuth),
// which pulls in next-auth / getTenantId / userCan / seedDefaultRoles — none
// of which the shared harness mocks. Replace the wrapper with a thin
// passthrough that resolves auth through the SAME `@/lib/auth/context` stub
// the rest of the suite controls via setContext(). This keeps the RBAC tree
// out of the test graph while preserving the 401/403 contract.
vi.mock("@/lib/api/withOrgAuth", async () => {
  const { getTenantContext, hasPermission } = await import("@/lib/auth/context");
  const wrap = (resource: string, action: string) =>
    (handler: any) =>
      async (req: any, routeCtx: any) => {
        const ctx = await (getTenantContext as any)();
        if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        if (!(hasPermission as any)(ctx, `${resource}.${action}`)) {
          return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
        return handler(
          { session: {}, userId: ctx.userId, orgId: ctx.orgId },
          req,
          routeCtx ?? { params: {} },
        );
      };
  return {
    withOrgAuthForResource: (resource: string) => ({
      view: wrap(resource, "view"),
      create: wrap(resource, "create"),
      edit: wrap(resource, "edit"),
      delete: wrap(resource, "delete"),
      approve: wrap(resource, "approve"),
      import: wrap(resource, "import"),
      export: wrap(resource, "export"),
      lock: wrap(resource, "lock"),
      manage: wrap(resource, "manage"),
      importOrEdit: wrap(resource, "edit"),
    }),
    withOrgAuthForModule: () => (handler: any) => handler,
    withOrgAuth: (handler: any) => handler,
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

const { GET, POST } = await import("@/app/api/projects/[projectId]/wbs/tasks/route");

const db = mockDb as any;
const PROJECT = "proj-1";
const params = { params: { projectId: PROJECT } };

function buildGET(): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/wbs/tasks`, { method: "GET" });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/wbs/tasks`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnWBSTask.findMany.mockResolvedValue([]);
  db.cnWBSDependency.findMany.mockResolvedValue([]);
  db.cnProject.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/projects/[projectId]/wbs/tasks
// ═══════════════════════════════════════════════

describe("GET /api/projects/[projectId]/wbs/tasks", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET(), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wbs.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET(), params)).status).toBe(403);
  });

  it("returns 404 when the project is not in this org", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(404);
  });

  it("returns tasks scoped to the org + project", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT });
    db.cnWBSTask.findMany.mockResolvedValue([
      {
        id: "t1",
        parentId: null,
        wbsCode: "1",
        name: "Foundation",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-10"),
        status: "not_started",
        progress: 0,
      },
    ]);
    db.cnWBSDependency.findMany.mockResolvedValue([]);
    const res = await GET(buildGET(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].wbsCode).toBe("1");
    const where = db.cnWBSTask.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ orgId: TEST_TENANT, projectId: PROJECT });
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/[projectId]/wbs/tasks
// ═══════════════════════════════════════════════

describe("POST /api/projects/[projectId]/wbs/tasks", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST({}), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wbs.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST({}), params)).status).toBe(403);
  });

  it("returns 400 when a required field is missing", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT });
    const res = await POST(buildPOST({ name: "Task" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 404 when the project is not found", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(
      buildPOST({ wbsCode: "1", name: "Task", startDate: "2026-01-01", endDate: "2026-01-10" }),
      params,
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when the end date precedes the start date", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT });
    const res = await POST(
      buildPOST({ wbsCode: "1", name: "Task", startDate: "2026-01-10", endDate: "2026-01-01" }),
      params,
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/earlier than start date/i);
    // Rejected before any write.
    expect(db.cnWBSTask.create).not.toHaveBeenCalled();
  });

  it("accepts an end date equal to the start date (zero-duration task)", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnWBSTask.create.mockResolvedValue({
      id: "t1", parentId: null, wbsCode: "1", name: "Task",
      startDate: new Date("2026-01-01"), endDate: new Date("2026-01-01"),
      status: "not_started", progress: 0,
    });
    const res = await POST(
      buildPOST({ wbsCode: "1", name: "Task", startDate: "2026-01-01", endDate: "2026-01-01" }),
      params,
    );
    expect(res.status).toBe(201);
  });

  it("creates a task scoped to the org + project and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnWBSTask.create.mockResolvedValue({
      id: "t1",
      parentId: null,
      wbsCode: "1",
      name: "Task",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-10"),
      status: "not_started",
      progress: 0,
    });
    const res = await POST(
      buildPOST({ wbsCode: "1", name: "Task", startDate: "2026-01-01", endDate: "2026-01-10" }),
      params,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("t1");
    const data = db.cnWBSTask.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.projectId).toBe(PROJECT);
    expect(data.createdBy).toBe(TEST_USER);
  });
});
