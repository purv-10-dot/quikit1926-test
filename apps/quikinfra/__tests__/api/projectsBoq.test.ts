import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ── Control surface for withOrgAuthForResource("construction.boq") ──────
// The BOQ routes gate via `withOrgAuthForResource` (next-auth + userCan), a
// different path than the harness-mocked getTenantContext. We replace the
// whole module with a passthrough that enforces the same 401/403 contract,
// reading the SAME context the harness drives (via getTenantContext) so a
// single `setContext()` controls both the gate and the inner ctx the route
// fetches. Stays self-contained to this file.
const has = (ctx: any, key: string) =>
  ctx.permissions.has("*") || ctx.permissions.has(key);

vi.mock("@/lib/api/withOrgAuth", () => {
  const wrapWith =
    (predicate: (ctx: any) => boolean) =>
    (handler: any) =>
    async (req: any, routeCtx: any) => {
      const { getTenantContext } = await import("@/lib/auth/context");
      const ctx: any = await getTenantContext();
      if (!ctx) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
      }
      if (!predicate(ctx)) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
      }
      return handler({ session: {}, userId: ctx.userId, orgId: ctx.orgId }, req, routeCtx);
    };

  const action = (resource: string, act: string) =>
    wrapWith((ctx) => has(ctx, `${resource}.${act}`));
  const importOrEdit = (resource: string) =>
    wrapWith(
      (ctx) =>
        has(ctx, `${resource}.import`) ||
        has(ctx, `${resource}.edit`) ||
        has(ctx, `${resource}.create`),
    );

  return {
    withOrgAuth: (h: any) => h,
    withOrgAuthForModule: () => (h: any) => h,
    withOrgAuthForResource: (resource: string) => ({
      view: action(resource, "view"),
      create: action(resource, "create"),
      edit: action(resource, "edit"),
      delete: action(resource, "delete"),
      approve: action(resource, "approve"),
      import: action(resource, "import"),
      importOrEdit: importOrEdit(resource),
      export: action(resource, "export"),
      lock: action(resource, "lock"),
      manage: action(resource, "manage"),
    }),
    forbidden: () =>
      NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

// ── Mock the BOQ service module — control method returns, keep a real
// BOQError class so the route's `instanceof BOQError` mapping works. ─────
vi.mock("@/lib/boq", () => {
  class BOQError extends Error {
    code: string;
    httpStatus: number;
    details?: unknown;
    constructor(code: string, message: string, httpStatus = 400, details?: unknown) {
      super(message);
      this.name = "BOQError";
      this.code = code;
      this.httpStatus = httpStatus;
      this.details = details;
    }
  }
  const boqService = {
    getBOQTree: vi.fn(),
    getLeafItems: vi.fn(),
    addManualItem: vi.fn(),
    updateManualItem: vi.fn(),
    deleteManualItem: vi.fn(),
    lockBOQ: vi.fn(),
    unlockBOQ: vi.fn(),
    previewDualImport: vi.fn(),
    persistDualImport: vi.fn(),
    runDualImport: vi.fn(),
  };
  const boqRepository = {
    isLocked: vi.fn().mockResolvedValue(false),
    replaceForProject: vi.fn(),
  };
  return { boqService, BOQError, boqRepository };
});

import { boqService as _svc, BOQError } from "@/lib/boq";
const boqService = _svc as any;

const { GET, POST } = await import("@/app/api/projects/[projectId]/boq/route");

const db = mockDb as any;
const PROJECT = "proj-1";
const params = { params: { projectId: PROJECT } };

function req(method: string, qs = "", body?: unknown): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/${PROJECT}/boq${qs ? "?" + qs : ""}`,
    {
      method,
      ...(body !== undefined
        ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
        : {}),
    },
  );
}

function leafRow(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    orgId: TEST_TENANT,
    project_id: PROJECT,
    boq_no: "A.1.1",
    parent_boq_no: "A",
    category: "Civil Building",
    display_name: "Earthwork",
    description: "Earthwork in excavation",
    unit: "Cum",
    tender_qty: 100,
    rate: 50,
    is_group: false,
    depth: 1,
    estimate_amt: 5000,
    done_qty: 0,
    sub_done_qty: 0,
    self_done_qty: 0,
    billed_qty: 0,
    completion_pct: 0,
    start_date: null,
    end_date: null,
    ...over,
  };
}

function lockState(over: Record<string, unknown> = {}) {
  return {
    is_locked: false,
    locked_at: null,
    locked_by: null,
    version: 1,
    ...over,
  };
}

function summary(over: Record<string, unknown> = {}) {
  return {
    contractValue: 5000,
    executedValue: 0,
    billedValue: 0,
    balanceValue: 5000,
    progressPercent: 0,
    leafCount: 1,
    groupCount: 0,
    totalCount: 1,
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/projects/[projectId]/boq  (gate construction.boq.view)
// ═══════════════════════════════════════════════

describe("GET /api/projects/[projectId]/boq", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.boq.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(req("GET"), params)).status).toBe(403);
  });

  it("returns the BOQ tree with summary + lockState for an authorized user", async () => {
    setContext(makeUserCtx(["construction.boq.view"]));
    const tree = { items: [leafRow()], summary: summary(), lockState: lockState() };
    boqService.getBOQTree.mockResolvedValue(tree);

    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(1);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].boqNo).toBe("A.1.1");
    expect(body.summary.contractValue).toBe(5000);
    expect(body.lockState.isLocked).toBe(false);
  });

  it("passes the caller ctx + projectId down to the service (project scoping)", async () => {
    setContext(makeAdminCtx());
    boqService.getBOQTree.mockResolvedValue({
      items: [],
      summary: summary({ totalCount: 0, leafCount: 0 }),
      lockState: lockState(),
    });
    await GET(req("GET"), params);
    const call = boqService.getBOQTree.mock.calls[0];
    expect(call[0].orgId).toBe(TEST_TENANT);
    expect(call[1]).toBe(PROJECT);
  });

  it("returns leaves only when ?leavesOnly=true", async () => {
    setContext(makeAdminCtx());
    boqService.getLeafItems.mockResolvedValue([leafRow()]);
    const res = await GET(req("GET", "leavesOnly=true"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(boqService.getLeafItems).toHaveBeenCalled();
  });

  it("maps a BOQError to its httpStatus", async () => {
    setContext(makeAdminCtx());
    boqService.getBOQTree.mockRejectedValue(new BOQError("BOQ_LOCKED", "locked", 403));
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("BOQ_LOCKED");
  });
});

// ═══════════════════════════════════════════════
// POST /api/projects/[projectId]/boq  (gate construction.boq.create)
// ═══════════════════════════════════════════════

describe("POST /api/projects/[projectId]/boq", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(req("POST", "", { description: "X" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.boq.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(req("POST", "", { description: "X" }), params)).status).toBe(403);
  });

  it("returns 400 when description / name is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(req("POST", "", {}), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/required/i);
  });

  it("returns 400 on a negative tender quantity", async () => {
    setContext(makeAdminCtx());
    const res = await POST(req("POST", "", { description: "X", quantity: "-5" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/negative/i);
  });

  it("creates a manual item scoped to the project and returns 201", async () => {
    setContext(makeAdminCtx());
    boqService.addManualItem.mockResolvedValue({ id: "b9", display_name: "Earthwork" });
    const res = await POST(
      req("POST", "", { description: "Earthwork", uomCode: "Cum", quantity: "10", contractRate: "5" }),
      params,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("b9");

    const call = boqService.addManualItem.mock.calls[0];
    expect(call[0].orgId).toBe(TEST_TENANT);
    expect(call[1]).toBe(PROJECT);
    expect(call[2].display_name).toBe("Earthwork");
  });
});
