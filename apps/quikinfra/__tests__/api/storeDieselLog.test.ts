import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────
// store/diesel-log + diesel-log/[id] are wrapped by `withOrgAuthForModule`
// (getServerSession → getTenantId → userCan), which the shared harness does
// NOT drive. Re-implement the wrapper against the harness's getTenantContext
// mock so setContext/makeAdminCtx/makeUserCtx control these routes exactly
// like the requireStoreAction routes. Gate key == `${resource}.${action}`.
// ─────────────────────────────────────────────────────────────────────
vi.mock("@/lib/api/withOrgAuth", async () => {
  const { NextResponse } = await import("next/server");
  const { getTenantContext } = await import("@/lib/auth/context");

  const withOrgAuth = (handler: any, options: any = {}) => {
    return async (req: any, routeCtx: any) => {
      const ctx: any = await (getTenantContext as any)();
      if (!ctx) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      if (options.permission) {
        const key = `${options.permission.resource}.${options.permission.action}`;
        if (!ctx.permissions.has("*") && !ctx.permissions.has(key)) {
          return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
      }
      try {
        return await handler({ session: {}, userId: ctx.userId, orgId: ctx.orgId }, req, routeCtx ?? { params: {} });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Operation failed";
        return NextResponse.json({ success: false, error: message }, { status: 500 });
      }
    };
  };
  return {
    withOrgAuth,
    withOrgAuthForModule: () => withOrgAuth,
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

import { GET as DLOGS_GET, POST as DLOGS_POST } from "@/app/api/store/diesel-logs/route";
import { GET as DLOG_GET, POST as DLOG_POST } from "@/app/api/store/diesel-log/route";
import { GET as DLOG_ID_GET, DELETE as DLOG_ID_DELETE } from "@/app/api/store/diesel-log/[id]/route";

const db = mockDb as any;

function buildGET(path: string, qs = ""): NextRequest {
  return new NextRequest(`http://localhost${path}${qs ? "?" + qs : ""}`, { method: "GET" });
}
function buildBody(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.cnProject.findMany.mockResolvedValue([]);
  db.cnLocation.findMany.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
  db.cnDieselLog.findMany.mockResolvedValue([]);
  db.cnDieselLog.count.mockResolvedValue(0);
});

// ═══════════════════════════════════════════════
// GET /api/store/diesel-logs  (requireStoreAction construction.diesel.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/diesel-logs", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DLOGS_GET(buildGET("/api/store/diesel-logs"))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.diesel.view", async () => {
    setContext(makeUserCtx([]));
    expect((await DLOGS_GET(buildGET("/api/store/diesel-logs"))).status).toBe(403);
  });

  it("lists logs scoped to the caller's org", async () => {
    setContext(makeAdminCtx());
    db.cnDieselLog.findMany.mockResolvedValue([
      {
        id: "d1",
        orgId: TEST_TENANT,
        projectId: "p1",
        project: { id: "p1", name: "Site A" },
        machineryId: "m1",
        machinery: { id: "m1", name: "JCB", code: "JCB-1" },
        logDate: new Date("2026-01-01"),
        quantityIssued: 10,
        unitRate: 90,
        totalCost: 900,
      },
    ]);
    const res = await DLOGS_GET(buildGET("/api/store/diesel-logs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].projectName).toBe("Site A");
    expect(db.cnDieselLog.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/diesel-logs  (gate diesel.create + matrix store.diesel:add)
// ═══════════════════════════════════════════════

describe("POST /api/store/diesel-logs", () => {
  const VALID = { projectId: "p1", machineryId: "m1", logDate: "2026-01-01", quantityIssued: 10, unitRate: 90 };

  it("returns 401 when unauthenticated", async () => {
    expect((await DLOGS_POST(buildBody("/api/store/diesel-logs", "POST", VALID))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.diesel.create", async () => {
    setContext(makeUserCtx([]));
    expect((await DLOGS_POST(buildBody("/api/store/diesel-logs", "POST", VALID))).status).toBe(403);
  });

  it("returns 403 when the matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.diesel.create"], {
        permissionMatrix: { "store.diesel": { add: false } },
      }),
    );
    expect((await DLOGS_POST(buildBody("/api/store/diesel-logs", "POST", VALID))).status).toBe(403);
  });

  it("returns 400 when quantityIssued is not positive", async () => {
    setContext(makeAdminCtx());
    const res = await DLOGS_POST(buildBody("/api/store/diesel-logs", "POST", { ...VALID, quantityIssued: 0 }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the project is not in the caller's org", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    db.cnMachinery.findFirst.mockResolvedValue({ id: "m1" });
    const res = await DLOGS_POST(buildBody("/api/store/diesel-logs", "POST", VALID));
    expect(res.status).toBe(404);
  });

  it("creates a diesel log scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "p1" });
    db.cnMachinery.findFirst.mockResolvedValue({ id: "m1" });
    db.cnDieselLog.create.mockResolvedValue({
      id: "d1",
      orgId: TEST_TENANT,
      projectId: "p1",
      project: { id: "p1", name: "Site A" },
      machineryId: "m1",
      machinery: { id: "m1", name: "JCB", code: "JCB-1" },
      logDate: new Date("2026-01-01"),
      quantityIssued: "10",
      unitRate: "90",
      totalCost: "900",
    });
    const res = await DLOGS_POST(buildBody("/api/store/diesel-logs", "POST", VALID));
    expect(res.status).toBe(201);
    const data = db.cnDieselLog.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.totalCost).toBe("900"); // derived 10 * 90
  });
});

// ═══════════════════════════════════════════════
// GET/POST /api/store/diesel-log  (withOrgAuth construction.diesel view/create)
// ═══════════════════════════════════════════════

describe("GET /api/store/diesel-log", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DLOG_GET(buildGET("/api/store/diesel-log"), { params: {} } as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.diesel.view", async () => {
    setContext(makeUserCtx([]));
    expect((await DLOG_GET(buildGET("/api/store/diesel-log"), { params: {} } as any)).status).toBe(403);
  });

  it("lists logs scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnDieselLog.findMany.mockResolvedValue([{ id: "d1", orgId: TEST_TENANT, logDate: new Date() }]);
    const res = await DLOG_GET(buildGET("/api/store/diesel-log"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(db.cnDieselLog.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });
});

describe("POST /api/store/diesel-log", () => {
  const VALID = {
    logNumber: "DL-1",
    projectId: "p1",
    locationId: "l1",
    logDate: "2026-01-01",
    machineryId: "m1",
    fuelQty: 10,
    unitRate: 90,
  };

  it("returns 401 when unauthenticated", async () => {
    expect((await DLOG_POST(buildBody("/api/store/diesel-log", "POST", VALID), { params: {} } as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.diesel.create", async () => {
    setContext(makeUserCtx([]));
    expect((await DLOG_POST(buildBody("/api/store/diesel-log", "POST", VALID), { params: {} } as any)).status).toBe(403);
  });

  it("returns 500 (zod throw) when the body is invalid", async () => {
    setContext(makeAdminCtx());
    const res = await DLOG_POST(buildBody("/api/store/diesel-log", "POST", { logNumber: "DL-1" }), { params: {} } as any);
    expect(res.status).toBe(500);
  });

  it("creates a diesel log scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnDieselLog.create.mockResolvedValue({ id: "d1", orgId: TEST_TENANT });
    const res = await DLOG_POST(buildBody("/api/store/diesel-log", "POST", VALID), { params: {} } as any);
    expect(res.status).toBe(201);
    const data = db.cnDieselLog.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.machineryId).toBe("m1");
  });
});

// ═══════════════════════════════════════════════
// GET/DELETE /api/store/diesel-log/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/diesel-log/[id]", () => {
  const params = { params: { id: "d1" } };

  it("returns 401 when unauthenticated", async () => {
    expect((await DLOG_ID_GET(buildGET("/api/store/diesel-log/d1"), params as any)).status).toBe(401);
  });

  it("returns 404 when not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnDieselLog.findFirst.mockResolvedValue(null);
    expect((await DLOG_ID_GET(buildGET("/api/store/diesel-log/d1"), params as any)).status).toBe(404);
  });

  it("returns the diesel log scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnDieselLog.findFirst.mockResolvedValue({ id: "d1", orgId: TEST_TENANT });
    const res = await DLOG_ID_GET(buildGET("/api/store/diesel-log/d1"), params as any);
    expect(res.status).toBe(200);
    expect(db.cnDieselLog.findFirst.mock.calls[0][0].where).toMatchObject({ id: "d1", orgId: TEST_TENANT });
  });
});

describe("DELETE /api/store/diesel-log/[id]", () => {
  const params = { params: { id: "d1" } };

  it("returns 403 when the user lacks construction.diesel.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DLOG_ID_DELETE(buildGET("/api/store/diesel-log/d1"), params as any)).status).toBe(403);
  });

  it("returns 404 when not found", async () => {
    setContext(makeAdminCtx());
    db.cnDieselLog.findFirst.mockResolvedValue(null);
    expect((await DLOG_ID_DELETE(buildGET("/api/store/diesel-log/d1"), params as any)).status).toBe(404);
  });

  it("deletes an existing diesel log", async () => {
    setContext(makeAdminCtx());
    db.cnDieselLog.findFirst.mockResolvedValue({ id: "d1" });
    db.cnDieselLog.delete.mockResolvedValue({ id: "d1" });
    const res = await DLOG_ID_DELETE(buildGET("/api/store/diesel-log/d1"), params as any);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });
});
