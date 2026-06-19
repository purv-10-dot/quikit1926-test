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
    lockBOQ: vi.fn(),
    unlockBOQ: vi.fn(),
  };
  return { boqService, BOQError };
});

// template-download writes a workbook with SheetJS — stub it (we only assert
// 401 + an authorized 200 with a spreadsheet content-type, no byte checks).
vi.mock("xlsx", () => ({
  utils: {
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
  },
  write: vi.fn(() => Buffer.from("fake-xlsx-bytes")),
}));

import { boqService as _svc, BOQError } from "@/lib/boq";
const boqService = _svc as any;

const { POST: LOCK } = await import("@/app/api/projects/[projectId]/boq/lock/route");
const { POST: UNLOCK } = await import("@/app/api/projects/[projectId]/boq/unlock/route");
const { GET: TEMPLATE } = await import(
  "@/app/api/projects/[projectId]/boq/template-download/route"
);

const db = mockDb as any;
const PROJECT = "proj-1";
const params = { params: { projectId: PROJECT } };

function req(path: string, method: string): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/boq/${path}`, {
    method,
  });
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// POST /lock  (gate construction.boq.lock)
// ═══════════════════════════════════════════════

describe("POST /api/projects/[projectId]/boq/lock", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await LOCK(req("lock", "POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.boq.lock", async () => {
    setContext(makeUserCtx([]));
    expect((await LOCK(req("lock", "POST"), params)).status).toBe(403);
  });

  it("locks the project BOQ and returns the locked state", async () => {
    setContext(makeUserCtx(["construction.boq.lock"]));
    boqService.lockBOQ.mockResolvedValue({
      is_locked: true,
      locked_at: "2026-06-13T00:00:00Z",
      locked_by: "user-test-1",
      version: 2,
    });
    const res = await LOCK(req("lock", "POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lockState.is_locked).toBe(true);

    const call = boqService.lockBOQ.mock.calls[0];
    expect(call[0].orgId).toBe(TEST_TENANT);
    expect(call[1]).toBe(PROJECT);
  });

  it("returns 400 when the BOQ is empty (BOQError)", async () => {
    setContext(makeAdminCtx());
    boqService.lockBOQ.mockRejectedValue(
      new BOQError("EMPTY_BOQ", "Cannot lock an empty BOQ. Import items first.", 400),
    );
    const res = await LOCK(req("lock", "POST"), params);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("EMPTY_BOQ");
  });
});

// ═══════════════════════════════════════════════
// POST /unlock  (gate construction.boq.lock — same authority)
// ═══════════════════════════════════════════════

describe("POST /api/projects/[projectId]/boq/unlock", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await UNLOCK(req("unlock", "POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.boq.lock", async () => {
    setContext(makeUserCtx([]));
    expect((await UNLOCK(req("unlock", "POST"), params)).status).toBe(403);
  });

  it("unlocks the project BOQ and returns the unlocked state", async () => {
    setContext(makeUserCtx(["construction.boq.lock"]));
    boqService.unlockBOQ.mockResolvedValue({
      is_locked: false,
      locked_at: null,
      locked_by: null,
      version: 3,
    });
    const res = await UNLOCK(req("unlock", "POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.lockState.is_locked).toBe(false);

    const call = boqService.unlockBOQ.mock.calls[0];
    expect(call[0].orgId).toBe(TEST_TENANT);
    expect(call[1]).toBe(PROJECT);
  });
});

// ═══════════════════════════════════════════════
// GET /template-download  (gate construction.boq import|edit|create)
// ═══════════════════════════════════════════════

describe("GET /api/projects/[projectId]/boq/template-download", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await TEMPLATE(req("template-download", "GET"), params)).status).toBe(401);
  });

  it("returns 403 when the user holds none of import/edit/create", async () => {
    setContext(makeUserCtx(["construction.boq.view"]));
    expect((await TEMPLATE(req("template-download", "GET"), params)).status).toBe(403);
  });

  it("returns a spreadsheet attachment for an authorized request", async () => {
    setContext(makeUserCtx(["construction.boq.import"]));
    const res = await TEMPLATE(req("template-download", "GET"), params);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/spreadsheetml/i);
    expect(res.headers.get("content-disposition")).toMatch(/attachment/i);
  });
});
