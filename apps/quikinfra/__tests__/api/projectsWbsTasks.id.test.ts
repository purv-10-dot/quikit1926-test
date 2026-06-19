import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// See projectsWbsTasks.test.ts for why the auth wrapper is stubbed.
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

const { PATCH, DELETE } = await import("@/app/api/projects/[projectId]/wbs/tasks/[id]/route");

const db = mockDb as any;
const PROJECT = "proj-1";
const ID = "t1";
const params = { params: { projectId: PROJECT, id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/wbs/tasks/${ID}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnWBSTask.findMany.mockResolvedValue([]);
  db.cnWBSDependency.findMany.mockResolvedValue([]);
  db.cnProject.findMany.mockResolvedValue([]);
});

describe("PATCH /api/projects/[projectId]/wbs/tasks/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PATCH(req("PATCH", { name: "X" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wbs.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PATCH(req("PATCH", { name: "X" }), params)).status).toBe(403);
  });

  it("updates a task scoped to the org + project and stamps updatedBy", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnWBSTask.update.mockResolvedValue({
      id: ID,
      parentId: null,
      wbsCode: "1",
      name: "Renamed",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-01-10"),
      status: "in_progress",
      progress: 50,
      orgId: TEST_TENANT,
      projectId: PROJECT,
    });
    db.cnWBSDependency.findMany.mockResolvedValue([]);
    const res = await PATCH(req("PATCH", { name: "Renamed", progress: 50 }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).name).toBe("Renamed");
    expect(db.cnWBSTask.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});

describe("DELETE /api/projects/[projectId]/wbs/tasks/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.wbs.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("returns 409 when a surviving task still depends on the deleted one", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT });
    db.cnWBSTask.findMany
      .mockResolvedValueOnce([{ id: ID, parentId: null }]) // tree
      .mockResolvedValueOnce([{ wbsCode: "2", name: "Dependent" }]); // dependents lookup
    db.cnWBSDependency.findMany.mockResolvedValue([{ toTaskId: "survivor" }]);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/depend/i);
  });

  it("deletes the task (and descendants) and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: PROJECT });
    db.cnWBSTask.findMany.mockResolvedValue([{ id: ID, parentId: null }]);
    db.cnWBSDependency.findMany.mockResolvedValue([]);
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnWBSDependency.deleteMany.mockResolvedValue({ count: 0 });
    db.cnWBSTask.deleteMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const where = db.cnWBSTask.deleteMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ orgId: TEST_TENANT, projectId: PROJECT });
  });
});
