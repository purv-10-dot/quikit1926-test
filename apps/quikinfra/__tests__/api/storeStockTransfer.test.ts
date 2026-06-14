import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";

// The /stock-transfer routes use withOrgAuthForModule("store") — same stack as
// /material-issue. Replace the wrapper with a self-contained stub driven by the
// shared test context (see storeMaterialIssue.test.ts for the rationale).
vi.mock("@/lib/api/withOrgAuth", async () => {
  const { NextResponse } = await vi.importActual<typeof import("next/server")>("next/server");
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

import { GET, POST } from "@/app/api/store/stock-transfer/route";
import { GET as GET_ID, DELETE } from "@/app/api/store/stock-transfer/[id]/route";
import { POST as POST_POST } from "@/app/api/store/stock-transfer/[id]/post/route";

const db = mockDb as any;

function buildReq(method: string, body?: unknown, qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/store/stock-transfer${qs ? "?" + qs : ""}`, {
    method,
    ...(body !== undefined
      ? { body: JSON.stringify(body), headers: { "content-type": "application/json" } }
      : {}),
  });
}

const VALID_TR = {
  transferNumber: "ST-001",
  projectId: "p1",
  fromLocationId: "l1",
  toLocationId: "l2",
  transferDate: "2026-01-01",
  lines: [{ itemId: "i1", quantity: 5, uomId: "uom1", unitRate: 10 }],
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
});

// ═══════════════════════════════════════════════
// GET /api/store/stock-transfer  (gate: construction.transfer.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/stock-transfer", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildReq("GET"), { params: {} } as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildReq("GET"), { params: {} } as any)).status).toBe(403);
  });

  it("lists transfers scoped to the org, excluding cancelled by default", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findMany.mockResolvedValue([
      { id: "st1", orgId: TEST_TENANT, transferNumber: "ST-001", status: "draft" },
    ]);
    const res = await GET(buildReq("GET"), { params: {} } as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    const where = db.cnStockTransfer.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe(TEST_TENANT);
    expect(where.status).toEqual({ not: "cancelled" });
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/stock-transfer  (gate: construction.transfer.create)
// ═══════════════════════════════════════════════

describe("POST /api/store/stock-transfer", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildReq("POST", VALID_TR), { params: {} } as any)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildReq("POST", VALID_TR), { params: {} } as any)).status).toBe(403);
  });

  it("returns 500 (Zod parse throw) when the schema rejects identical locations", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildReq("POST", { ...VALID_TR, toLocationId: "l1" }), { params: {} } as any);
    expect(res.status).toBe(500);
    expect((await res.json()).success).toBe(false);
  });

  it("returns 400 when the source location is not in the org", async () => {
    setContext(makeAdminCtx());
    db.cnLocation.findFirst
      .mockResolvedValueOnce(null) // from
      .mockResolvedValueOnce({ id: "l2" }); // to
    const res = await POST(buildReq("POST", VALID_TR), { params: {} } as any);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/source location not found/i);
  });

  it("returns 409 when the transfer number already exists", async () => {
    setContext(makeAdminCtx());
    db.cnLocation.findFirst.mockResolvedValue({ id: "l1" });
    db.cnStockTransfer.findFirst.mockResolvedValue({ id: "dup" });
    const res = await POST(buildReq("POST", VALID_TR), { params: {} } as any);
    expect(res.status).toBe(409);
  });

  it("creates a draft transfer scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnLocation.findFirst.mockResolvedValue({ id: "l1" });
    db.cnStockTransfer.findFirst.mockResolvedValue(null); // no dup
    db.cnStockTransfer.create.mockResolvedValue({
      id: "st1",
      orgId: TEST_TENANT,
      transferNumber: "ST-001",
      status: "draft",
      lines: [],
    });
    const res = await POST(buildReq("POST", VALID_TR), { params: {} } as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBe("st1");
    const data = db.cnStockTransfer.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
    expect(data.status).toBe("draft");
  });
});

// ═══════════════════════════════════════════════
// GET /api/store/stock-transfer/[id]
// ═══════════════════════════════════════════════

describe("GET /api/store/stock-transfer/[id]", () => {
  const params = { params: { id: "st1" } };

  it("returns 401 when unauthenticated", async () => {
    expect((await GET_ID(buildReq("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the transfer is not in this org", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue(null);
    expect((await GET_ID(buildReq("GET"), params)).status).toBe(404);
  });

  it("returns the transfer scoped to id + org", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue({ id: "st1", orgId: TEST_TENANT, lines: [] });
    const res = await GET_ID(buildReq("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("st1");
    expect(db.cnStockTransfer.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "st1",
      orgId: TEST_TENANT,
    });
  });
});

// ═══════════════════════════════════════════════
// DELETE /api/store/stock-transfer/[id]  (gate: construction.transfer.delete)
// ═══════════════════════════════════════════════

describe("DELETE /api/store/stock-transfer/[id]", () => {
  const params = { params: { id: "st1" } };

  it("returns 403 when the user lacks construction.transfer.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(buildReq("DELETE"), params)).status).toBe(403);
  });

  it("returns 404 when deleting a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue(null);
    expect((await DELETE(buildReq("DELETE"), params)).status).toBe(404);
  });

  it("returns 400 when trying to delete a received (posted) transfer", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue({ id: "st1", status: "received" });
    const res = await DELETE(buildReq("DELETE"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/immutable/i);
  });

  it("soft-cancels a draft transfer and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue({ id: "st1", status: "draft" });
    db.cnStockTransfer.update.mockResolvedValue({ id: "st1", status: "cancelled" });
    const res = await DELETE(buildReq("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    expect(db.cnStockTransfer.update.mock.calls[0][0].data.status).toBe("cancelled");
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/stock-transfer/[id]/post  (gate: construction.transfer.approve)
// Posts both legs (transfer_out + transfer_in) atomically → status received.
// ═══════════════════════════════════════════════

describe("POST /api/store/stock-transfer/[id]/post", () => {
  const params = { params: { id: "st1" } };

  function trFull(over: Record<string, unknown> = {}) {
    return {
      id: "st1",
      orgId: TEST_TENANT,
      transferNumber: "ST-001",
      status: "draft",
      fromProjectId: "p1",
      fromLocationId: "l1",
      toProjectId: "p2",
      toLocationId: "l2",
      transferDate: new Date(),
      lines: [{ itemId: "i1", sentQty: 5, uomId: "uom1" }],
      ...over,
    };
  }

  it("returns 401 when unauthenticated", async () => {
    expect((await POST_POST(buildReq("POST"), params)).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.approve", async () => {
    setContext(makeUserCtx([]));
    expect((await POST_POST(buildReq("POST"), params)).status).toBe(403);
  });

  it("returns 404 when the transfer does not exist", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue(null);
    expect((await POST_POST(buildReq("POST"), params)).status).toBe(404);
  });

  it("returns 409 when the transfer is already received", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue(trFull({ status: "received" }));
    expect((await POST_POST(buildReq("POST"), params)).status).toBe(409);
  });

  it("returns 400 when source stock is insufficient", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue(trFull());
    db.cnStockLedger.aggregate.mockResolvedValue({ _sum: { qtyIn: 1, qtyOut: 0 } });
    const res = await POST_POST(buildReq("POST"), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/insufficient stock at source/i);
  });

  it("posts both legs and flips the transfer to received", async () => {
    setContext(makeAdminCtx());
    db.cnStockTransfer.findFirst.mockResolvedValue(trFull());
    db.cnStockLedger.aggregate.mockResolvedValue({ _sum: { qtyIn: 100, qtyOut: 0 } });
    db.$transaction.mockImplementation(async (cb: any) => cb(db));
    db.cnStockLedger.create.mockResolvedValue({});
    db.cnStockTransfer.update.mockResolvedValue({ id: "st1", status: "received" });
    const res = await POST_POST(buildReq("POST"), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("received");
    // Two ledger rows: transfer_out at source + transfer_in at destination.
    const types = db.cnStockLedger.create.mock.calls.map((c: any) => c[0].data.transactionType);
    expect(types).toContain("transfer_out");
    expect(types).toContain("transfer_in");
  });
});
