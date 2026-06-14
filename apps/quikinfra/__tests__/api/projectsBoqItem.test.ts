import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT } from "../setup";
import { NextRequest, NextResponse } from "next/server";

// ── withOrgAuthForResource passthrough (see projectsBoq.test.ts) ────────
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
      importOrEdit: wrapWith(
        (ctx) =>
          has(ctx, `${resource}.import`) ||
          has(ctx, `${resource}.edit`) ||
          has(ctx, `${resource}.create`),
      ),
      export: action(resource, "export"),
      lock: action(resource, "lock"),
      manage: action(resource, "manage"),
    }),
    forbidden: () =>
      NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

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
    updateManualItem: vi.fn(),
    deleteManualItem: vi.fn(),
  };
  return { boqService, BOQError };
});

import { boqService as _svc, BOQError } from "@/lib/boq";
const boqService = _svc as any;

const { PUT, DELETE } = await import("@/app/api/projects/[projectId]/boq/[itemId]/route");

const db = mockDb as any;
const PROJECT = "proj-1";
const ITEM = "item-1";
const params = { params: { projectId: PROJECT, itemId: ITEM } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/boq/${ITEM}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// PUT /api/projects/[projectId]/boq/[itemId]  (gate construction.boq.edit)
// ═══════════════════════════════════════════════

describe("PUT /api/projects/[projectId]/boq/[itemId]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", { displayName: "X" }), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.boq.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PUT(req("PUT", { displayName: "X" }), params)).status).toBe(403);
  });

  it("returns 400 on a negative tender quantity", async () => {
    setContext(makeAdminCtx());
    const res = await PUT(req("PUT", { quantity: "-1" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/negative/i);
  });

  it("updates the item scoped to project + item id and returns it", async () => {
    setContext(makeUserCtx(["construction.boq.edit"]));
    boqService.updateManualItem.mockResolvedValue({ id: ITEM, display_name: "Updated" });
    const res = await PUT(
      req("PUT", { displayName: "Updated", uomCode: "Cum", quantity: "5", contractRate: "10" }),
      params,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ITEM);

    const call = boqService.updateManualItem.mock.calls[0];
    expect(call[0].orgId).toBe(TEST_TENANT);
    expect(call[1]).toBe(PROJECT);
    expect(call[2]).toBe(ITEM);
    expect(call[3].display_name).toBe("Updated");
  });

  it("maps a BOQError (e.g. locked) to its httpStatus", async () => {
    setContext(makeAdminCtx());
    boqService.updateManualItem.mockRejectedValue(
      new BOQError("BOQ_LOCKED", "Project BOQ is locked", 403),
    );
    const res = await PUT(req("PUT", { displayName: "X" }), params);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("BOQ_LOCKED");
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/projects/[projectId]/boq/[itemId]  (gate construction.boq.delete)
// ═══════════════════════════════════════════════

describe("DELETE /api/projects/[projectId]/boq/[itemId]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DELETE(req("DELETE"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.boq.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("hard-deletes the item scoped to project + item id and returns success", async () => {
    setContext(makeUserCtx(["construction.boq.delete"]));
    boqService.deleteManualItem.mockResolvedValue(undefined);
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);

    const call = boqService.deleteManualItem.mock.calls[0];
    expect(call[0].orgId).toBe(TEST_TENANT);
    expect(call[1]).toBe(PROJECT);
    expect(call[2]).toBe(ITEM);
  });

  it("maps a BOQError to its httpStatus", async () => {
    setContext(makeAdminCtx());
    boqService.deleteManualItem.mockRejectedValue(
      new BOQError("BOQ_LOCKED", "locked", 403),
    );
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });
});
