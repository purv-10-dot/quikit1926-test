import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// The /api/store/material-issue + /stock-transfer routes use a DIFFERENT auth
// stack than the requireStoreAction routes: `withOrgAuthForModule("store")`
// from @/lib/api/withOrgAuth, which itself pulls in getServerSession, getTenantId,
// userCan, seedDefaultRoles, gateModuleApi (external pkg) and logApiCall.
// The global harness only mocks @/lib/auth/context, so we replace the wrapper
// with a self-contained stub that reads the SAME shared test context the rest
// of the suite drives via setContext().  Auth contract reproduced:
//   - no ctx                       → 401 {success:false}
//   - ctx but missing perm/"*"     → 403 {success:false}
//   - otherwise call the handler with { session, userId, orgId }
// ---------------------------------------------------------------------------
vi.mock("@/lib/api/withOrgAuth", async () => {
  const { NextResponse } = await vi.importActual<typeof import("next/server")>("next/server");
  // The global harness mock of @/lib/auth/context exposes getTenantContext(),
  // which setContext() drives. Reuse it as the single source of test auth.
  const { getTenantContext } = await import("@/lib/auth/context");
  function makeWrapper(permission?: { resource: string; action: string }) {
    return (handler: any) =>
      async (req: any, routeCtx: any) => {
        const ctx = await getTenantContext();
        if (!ctx) {
          return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }
        if (permission) {
          const key = `${permission.resource}.${permission.action}`;
          if (!ctx.permissions.has("*") && !ctx.permissions.has(key)) {
            return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
          }
        }
        try {
          return await handler(
            { session: { user: { id: ctx.userId, orgId: ctx.orgId } }, userId: ctx.userId, orgId: ctx.orgId },
            req,
            routeCtx ?? { params: {} },
          );
        } catch (error: unknown) {
          // Mirror the real withOrgAuth: any thrown error (e.g. ZodError) →
          // friendly 500 envelope.
          const message = error instanceof Error ? error.message : "Operation failed";
          return NextResponse.json({ success: false, error: message }, { status: 500 });
        }
      };
  }
  return {
    withOrgAuth: (handler: any, options: any = {}) => makeWrapper(options.permission)(handler),
    withOrgAuthForModule: () => (handler: any, options: any = {}) =>
      makeWrapper(options?.permission)(handler),
    withOrgAuthForResource: () => ({}),
    forbidden: () => NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }),
  };
});

vi.mock("@/lib/audit", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

import { GET, POST } from "@/app/api/store/material-issue/route";
import { GET as GET_ID, DELETE } from "@/app/api/store/material-issue/[id]/route";
import { POST as POST_POST } from "@/app/api/store/material-issue/[id]/post/route";

const db = mockDb as any;

function buildReq(method: string, body?: unknown, qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/store/material-issue${qs ? "?" + qs : ""}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

const VALID_MI = {
  issueNumber: "MI-001",
  projectId: "p1",
  locationId: "l1",
  issuedToId: "u2",
  issuedById: "u1",
  issueDate: "2026-01-01",
  lines: [{ itemId: "i1", issuedQty: 5, uomId: "uom1", unitRate: 10 }],
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/store/material-issue  (gate: construction.issue.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/material-issue", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildReq("GET"), { params: {} } as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildReq("GET"), { params: {} } as any)).status).toBe(403);
  });

  it("lists issues scoped to the org, excluding cancelled by default", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findMany.mockResolvedValue([
      { id: "mi1", orgId: TEST_TENANT, issueNumber: "MI-001", status: "draft" },
    ]);
    const res = await GET(buildReq("GET"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    const where = db.cnMaterialIssue.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.status).toEqual({ not: "cancelled" });
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/material-issue  (gate: construction.issue.create)
// ═══════════════════════════════════════════════

describe("POST /api/store/material-issue", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildReq("POST", VALID_MI), { params: {} } as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildReq("POST", VALID_MI), { params: {} } as any)).status).toBe(403);
  });

  it("returns 500 (Zod parse throw) when required fields are missing", async () => {
    setContext(makeAdminCtx());
    // miCreateSchema.parse throws ZodError → withOrgAuth catch → 500 envelope.
    const res = await POST(buildReq("POST", { issueNumber: "MI-001" }), { params: {} } as any);
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 400 when the project is not in the org", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    db.cnLocation.findFirst.mockResolvedValue({ id: "l1" });
    const res = await POST(buildReq("POST", VALID_MI), { params: {} } as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/project not found/i);
  });

  it("returns 409 when the issue number already exists", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "p1" });
    db.cnLocation.findFirst.mockResolvedValue({ id: "l1" });
    db.cnMaterialIssue.findFirst.mockResolvedValue({ id: "dup" });
    const res = await POST(buildReq("POST", VALID_MI), { params: {} } as any);
    expect(res.status).toBe(409);
  });

  it("creates a draft issue scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "p1" });
    db.cnLocation.findFirst.mockResolvedValue({ id: "l1" });
    db.cnMaterialIssue.findFirst.mockResolvedValue(null); // no dup
    db.cnMaterialIssue.create.mockResolvedValue({
      id: "mi1",
      orgId: TEST_TENANT,
      issueNumber: "MI-001",
      status: "draft",
      lines: [],
    });
    const res = await POST(buildReq("POST", VALID_MI), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("mi1");
    const data = db.cnMaterialIssue.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.status).toBe("draft");
  });
});

// ═══════════════════════════════════════════════
// GET /api/store/material-issue/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/material-issue/[id]", () => {
  const params = { params: { id: "mi1" } };

  it("returns 401 when unauthenticated", async () => {
    expect((await GET_ID(buildReq("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the issue is not in this org", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue(null);
    expect((await GET_ID(buildReq("GET"), params)).status).toBe(404);
  });

  it("returns the issue scoped to id + org", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue({ id: "mi1", orgId: TEST_TENANT, lines: [] });
    const res = await GET_ID(buildReq("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("mi1");
    expect(db.cnMaterialIssue.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "mi1",
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/store/material-issue/[id]  (gate: construction.issue.delete)
// ═══════════════════════════════════════════════

describe("DELETE /api/store/material-issue/[id]", () => {
  const params = { params: { id: "mi1" } };

  it("returns 403 when the user lacks construction.issue.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(buildReq("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when deleting a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue(null);
    expect((await DELETE(buildReq("DELETE"), params)).status).toBe(404);
  });

  it("returns 400 when trying to delete a posted issue", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue({ id: "mi1", status: "posted" });
    const res = await DELETE(buildReq("DELETE"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/cannot be deleted/i);
  });

  it("soft-cancels a draft issue and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue({ id: "mi1", status: "draft" });
    db.cnMaterialIssue.update.mockResolvedValue({ id: "mi1", status: "cancelled" });
    const res = await DELETE(buildReq("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnMaterialIssue.update.mock.calls[0][0].data.status).toBe("cancelled");
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/material-issue/[id]/post  (gate: construction.issue.approve)
// DRAFT → POSTED. Routes through the stock ledger service, which appends a
// CnStockLedger row AND keeps the CnStockBalance cache in sync (one txn).
// The negative-balance guard reads the balance cache, not a ledger sum.
// ═══════════════════════════════════════════════

describe("POST /api/store/material-issue/[id]/post", () => {
  const params = { params: { id: "mi1" } };

  const DRAFT_MI = {
    id: "mi1",
    status: "draft",
    projectId: "p1",
    locationId: "l1",
    issueNumber: "MI-001",
    issueDate: new Date(),
    lines: [{ itemId: "i1", issuedQty: 5, uomId: "uom1", unitRate: 10, amount: 50 }],
  };

  it("returns 401 when unauthenticated", async () => {
    expect((await POST_POST(buildReq("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.issue.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await POST_POST(buildReq("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the issue does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue(null);
    expect((await POST_POST(buildReq("POST"), params)).status).toBe(404);
  });

  it("returns 409 when the issue is already posted", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue({ id: "mi1", status: "posted", lines: [] });
    expect((await POST_POST(buildReq("POST"), params)).status).toBe(409);
  });

  it("returns 400 when the balance cache is insufficient — and writes nothing", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue(DRAFT_MI);
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    // Balance cache shows only 2 on hand → deducting 5 must be rejected.
    db.cnStockBalance.findUnique.mockResolvedValue({ quantity: 2, avgRate: 10 });
    const res = await POST_POST(buildReq("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/insufficient stock/i);
    // Guard fires before any write: neither table is touched, status not flipped.
    expect(db.cnStockLedger.create).not.toHaveBeenCalled();
    expect(db.cnStockBalance.upsert).not.toHaveBeenCalled();
    expect(db.cnMaterialIssue.update).not.toHaveBeenCalled();
  });

  it("posts the issue: appends a ledger row AND decrements the balance cache (the drift fix)", async () => {
    setContext(makeAdminCtx());
    db.cnMaterialIssue.findFirst.mockResolvedValue(DRAFT_MI);
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    // 100 on hand at avg rate 10.
    db.cnStockBalance.findUnique.mockResolvedValue({ quantity: 100, avgRate: 10 });
    db.cnStockLedger.create.mockResolvedValue({ id: "led1" });
    db.cnStockBalance.upsert.mockResolvedValue({});
    db.cnMaterialIssue.update.mockResolvedValue({ id: "mi1", status: "posted" });

    const res = await POST_POST(buildReq("POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("posted");

    // (1) Ledger row: outward "issue" qty, org-scoped.
    const ledgerData = db.cnStockLedger.create.mock.calls[0][0].data;
    expect(ledgerData.transactionType).toBe("issue");
    expect(ledgerData.orgId).toBe(TEST_TENANT);
    expect(Number(ledgerData.qtyOut)).toBe(5);

    // (2) THE FIX: balance cache decremented in the SAME txn (100 − 5 = 95).
    // Before this change the route wrote only the ledger and left the cache
    // stale, so the Stock Balance screen over-reported stock.
    expect(db.cnStockBalance.upsert).toHaveBeenCalledTimes(1);
    const upsertArg = db.cnStockBalance.upsert.mock.calls[0][0];
    expect(Number(upsertArg.update.quantity)).toBe(95);
    expect(Number(upsertArg.create.quantity)).toBe(95);
  });
});
