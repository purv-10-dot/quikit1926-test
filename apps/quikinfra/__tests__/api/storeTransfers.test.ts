import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/store/transfers/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/store/transfers${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/store/transfers", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_BODY = {
  sourceProjectId: "p1",
  fromLocationId: "l1",
  toLocationId: "l2",
  transferDate: "2026-01-01",
  lines: [],
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
  db.$queryRaw.mockResolvedValue([]);
  db.$executeRaw.mockResolvedValue(1);
  db.cnApprovalInstance.findMany.mockResolvedValue([]);
});

// ═══════════════════════════════════════════════
// GET /api/store/transfers  (gate: construction.transfer.view)
// ═══════════════════════════════════════════════

describe("GET /api/store/transfers", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.view", async () => {
    setContext(makeUserCtx([]));
    expect((await GET(buildGET())).status).toBe(403);
  });

  it("returns 200 with a decorated list", async () => {
    setContext(makeUserCtx(["construction.transfer.view"]));
    db.$queryRaw.mockResolvedValue([
      { id: "st1", orgId: TEST_TENANT, transferNumber: "ST-1", sourceProjectId: "p1", status: "draft" },
    ]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].canActOnCurrentStep).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// POST /api/store/transfers  (gate: construction.transfer.create + matrix store.transfer:add)
// ═══════════════════════════════════════════════

describe("POST /api/store/transfers", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.transfer.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies add", async () => {
    setContext(
      makeUserCtx(["construction.transfer.create"], {
        permissionMatrix: { "store.transfer": { add: false } },
      }),
    );
    expect((await POST(buildPOST(VALID_BODY))).status).toBe(403);
  });

  it("returns 400 when sourceProjectId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ fromLocationId: "l1", toLocationId: "l2" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/sourceProjectId is required/i);
  });

  it("returns 400 when fromLocationId is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ sourceProjectId: "p1", toLocationId: "l2" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/fromLocationId is required/i);
  });

  it("returns 404 when the source project is not in this org", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue(null);
    const res = await POST(buildPOST(VALID_BODY));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/source project.*not found/i);
  });

  it("creates a draft transfer scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    db.cnProject.findFirst.mockResolvedValue({ id: "p1", name: "Site A" });
    db.cnLocation.findFirst
      .mockResolvedValueOnce({ id: "l1", name: "Store 1", state: "S", city: "C" })
      .mockResolvedValueOnce({ id: "l2", name: "Store 2", state: "S", city: "C" });
    db.$queryRaw
      .mockResolvedValueOnce([{ c: 0n }]) // countStockTransfersForDate
      .mockResolvedValueOnce([
        { id: "st1", orgId: TEST_TENANT, transferNumber: "ST-20260101-0001", sourceProjectId: "p1", status: "draft" },
      ]); // findStockTransferById after insert
    const res = await POST(buildPOST(VALID_BODY));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("st1");
    expect(db.$executeRaw).toHaveBeenCalled();
  });
});
