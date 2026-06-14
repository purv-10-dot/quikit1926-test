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

// BOQ service + repo mock.
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
    previewDualImport: vi.fn(),
    persistDualImport: vi.fn(),
    runDualImport: vi.fn(),
    addManualItem: vi.fn(),
  };
  const boqRepository = {
    isLocked: vi.fn().mockResolvedValue(false),
    replaceForProject: vi.fn(),
  };
  return { boqService, BOQError, boqRepository };
});

// XLSX mock — the preview-upload + detect-columns routes parse with SheetJS
// BEFORE calling the service. We don't test real Excel parsing here (covered
// by the unit pipeline tests), so return a stable fake workbook.
vi.mock("xlsx", () => ({
  read: vi.fn(() => ({
    SheetNames: ["Civil"],
    Sheets: { Civil: {} },
  })),
  utils: {
    sheet_to_json: vi.fn(() => [
      ["BOQ No", "Description", "Unit", "Rate", "Qty"],
      ["A.1.1", "Earthwork", "Cum", 50, 100],
    ]),
    book_new: vi.fn(() => ({})),
    aoa_to_sheet: vi.fn(() => ({})),
    book_append_sheet: vi.fn(),
    write: vi.fn(() => Buffer.from("xlsx-bytes")),
  },
}));

// Rate limiter — never block in tests.
vi.mock("@/lib/workflow/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ blocked: false, remaining: 5, resetAt: Date.now() })),
  LIMITS: { IMPORT_BOQ: { bucket: "boq.import", limit: 5, windowMs: 60000 } },
}));

import { boqService as _svc } from "@/lib/boq";
const boqService = _svc as any;

const { POST: PREVIEW } = await import(
  "@/app/api/projects/[projectId]/boq/preview-upload/route"
);
const { POST: IMPORT } = await import("@/app/api/projects/[projectId]/boq/import/route");
const { POST: DETECT } = await import(
  "@/app/api/projects/[projectId]/boq/detect-columns/route"
);

const db = mockDb as any;
const PROJECT = "proj-1";
const params = { params: { projectId: PROJECT } };

function multipart(fields: Record<string, string | File | null>): NextRequest {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null) fd.append(k, v as any);
  }
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/boq/preview-upload`, {
    method: "POST",
    body: fd as any,
  });
}

function xlsxFile(name = "boq.xlsx"): File {
  return new File([new Uint8Array([1, 2, 3, 4])], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function jsonReq(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/projects/${PROJECT}/boq/import`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function pipelineResult(over: Record<string, unknown> = {}) {
  return {
    mode: "GENERIC_SOR",
    detectedMode: "GENERIC_SOR",
    supportedModes: ["GENERIC_SOR", "STRICT_TEMPLATE"],
    detection: [],
    summary: { totalRows: 1, leafCount: 1, groupCount: 0 },
    errors: [],
    warnings: [],
    sampleRows: [{ boqNo: "A.1.1" }],
    rows: [{ boqNo: "A.1.1", description: "Earthwork" }],
    ...over,
  };
}

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// POST /preview-upload  (gate construction.boq import|edit|create)
// ═══════════════════════════════════════════════

describe("POST /api/projects/[projectId]/boq/preview-upload", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PREVIEW(multipart({ file: xlsxFile() }), params)).status).toBe(401);
  });

  it("returns 403 when the user holds none of import/edit/create", async () => {
    setContext(makeUserCtx(["construction.boq.view"]));
    expect((await PREVIEW(multipart({ file: xlsxFile() }), params)).status).toBe(403);
  });

  it("returns 400 when no file is provided", async () => {
    setContext(makeAdminCtx());
    const res = await PREVIEW(multipart({ mode: "AUTO" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("FILE_REQUIRED");
  });

  it("returns 400 on an empty file", async () => {
    setContext(makeAdminCtx());
    const empty = new File([], "boq.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const res = await PREVIEW(multipart({ file: empty }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("EMPTY_FILE");
  });

  it("runs the dry-run pipeline and returns the normalized rows (import-perm)", async () => {
    setContext(makeUserCtx(["construction.boq.import"]));
    boqService.previewDualImport.mockResolvedValue(pipelineResult());
    const res = await PREVIEW(multipart({ file: xlsxFile(), mode: "GENERIC_SOR" }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.rows).toHaveLength(1);
    expect(body.data.selectedMode).toBe("GENERIC_SOR");

    const call = boqService.previewDualImport.mock.calls[0];
    expect(call[0].orgId).toBe(TEST_TENANT);
    expect(call[1]).toBe(PROJECT);
  });

  it("returns 400 when UNIVERSAL mode lacks a universalMapping field", async () => {
    setContext(makeAdminCtx());
    const res = await PREVIEW(multipart({ file: xlsxFile(), mode: "UNIVERSAL" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("UNIVERSAL_MAPPING_REQUIRED");
  });
});

// ═══════════════════════════════════════════════
// POST /import  (gate construction.boq import|edit|create)
// ═══════════════════════════════════════════════

describe("POST /api/projects/[projectId]/boq/import", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await IMPORT(jsonReq({ rows: [] }), params)).status).toBe(401);
  });

  it("returns 403 when the user holds none of import/edit/create", async () => {
    setContext(makeUserCtx(["construction.boq.view"]));
    expect((await IMPORT(jsonReq({ rows: [] }), params)).status).toBe(403);
  });

  it("returns 400 when the body has no rows/sheets/items", async () => {
    setContext(makeAdminCtx());
    const res = await IMPORT(jsonReq({ fileName: "x.xlsx" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/rows.*sheets.*items/i);
  });

  it("persists preview rows and returns 201 with the inserted count", async () => {
    setContext(makeUserCtx(["construction.boq.import"]));
    boqService.persistDualImport.mockResolvedValue({
      batchId: "batch-1",
      inserted: [{ id: "b1" }, { id: "b2" }],
      errors: [],
      warnings: [],
    });
    const res = await IMPORT(
      jsonReq({ rows: [{ boqNo: "A.1.1" }], mode: "GENERIC_SOR", fileName: "boq.xlsx" }),
      params,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.imported).toBe(2);
    expect(body.batchId).toBe("batch-1");

    const call = boqService.persistDualImport.mock.calls[0];
    expect(call[0].orgId).toBe(TEST_TENANT);
    expect(call[1]).toBe(PROJECT);
  });

  it("returns 422 when persistence reports validation errors", async () => {
    setContext(makeAdminCtx());
    boqService.persistDualImport.mockResolvedValue({
      batchId: "batch-2",
      inserted: [],
      errors: [{ row: 1, message: "bad" }],
      warnings: [],
    });
    const res = await IMPORT(jsonReq({ rows: [{ boqNo: "X" }] }), params);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errors).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════
// POST /detect-columns  (gate construction.boq import|edit|create)
// ═══════════════════════════════════════════════

describe("POST /api/projects/[projectId]/boq/detect-columns", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await DETECT(multipart({ file: xlsxFile() }), params)).status).toBe(401);
  });

  it("returns 403 when the user holds none of import/edit/create", async () => {
    setContext(makeUserCtx(["construction.boq.view"]));
    expect((await DETECT(multipart({ file: xlsxFile() }), params)).status).toBe(403);
  });

  it("returns 400 when no file is provided", async () => {
    setContext(makeAdminCtx());
    const res = await DETECT(multipart({}), params);
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("FILE_REQUIRED");
  });

  it("returns detected column suggestions for an authorized request", async () => {
    setContext(makeUserCtx(["construction.boq.import"]));
    const res = await DETECT(multipart({ file: xlsxFile() }), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data.sheets)).toBe(true);
    expect(body.data.sheets).toHaveLength(1);
  });
});
