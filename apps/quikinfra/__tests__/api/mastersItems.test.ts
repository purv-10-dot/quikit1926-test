import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/masters/items/route";

const db = mockDb as any;

function buildGET(qs = ""): NextRequest {
  return new NextRequest(`http://localhost/api/masters/items${qs ? "?" + qs : ""}`, {
    method: "GET",
  });
}
function buildPOST(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/masters/items", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const VALID_ITEM = {
  name: "Cement Bag",
  category: "Building Materials",
  uomCode: "BAG",
};

beforeEach(() => {
  resetMockDb();
  setContext(null);
  // createItem runs inside a Prisma $transaction — run the callback against
  // the same mock so the inner model calls are configurable per-test.
  db.$transaction.mockImplementation((cb: any) => cb(db));
});

describe("GET /api/masters/items — withListRoute", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(buildGET())).status).toBe(401);
  });

  it("lists items scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnItem.findMany.mockResolvedValue([
      {
        id: "i1",
        orgId: TEST_TENANT,
        code: "CB-001",
        name: "Cement Bag",
        groupId: "g1",
        group: { id: "g1", name: "Building Materials" },
        uomId: "u1",
        uom: { id: "u1", code: "BAG", name: "BAG" },
        uomIds: ["u1"],
        status: "active",
        createdBy: TEST_USER,
        updatedBy: TEST_USER,
      },
    ]);
    db.cnItem.count.mockResolvedValue(1);
    db.cnUOM.findMany.mockResolvedValue([{ id: "u1", code: "BAG" }]);
    const res = await GET(buildGET());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data[0].name).toBe("Cement Bag");
    expect(db.cnItem.findMany.mock.calls[0][0].where.orgId).toBe(TEST_TENANT);
  });

  it("excludes soft-deleted (inactive) items by default", async () => {
    setContext(makeAdminCtx());
    db.cnItem.findMany.mockResolvedValue([]);
    db.cnItem.count.mockResolvedValue(0);
    db.cnUOM.findMany.mockResolvedValue([]);
    await GET(buildGET());
    // Default list must hide both inactive (soft-delete) and deleted rows so
    // deleted items never leak into pickers across PR / BOQ / GRN / estimation.
    expect(db.cnItem.findMany.mock.calls[0][0].where.status).toEqual({
      notIn: ["inactive", "deleted"],
    });
  });

  it("includes inactive items when status=all (master list toggle)", async () => {
    setContext(makeAdminCtx());
    db.cnItem.findMany.mockResolvedValue([]);
    db.cnItem.count.mockResolvedValue(0);
    db.cnUOM.findMany.mockResolvedValue([]);
    await GET(buildGET("status=all"));
    // status=all opts into soft-deleted rows — no status filter at all.
    expect(db.cnItem.findMany.mock.calls[0][0].where.status).toBeUndefined();
  });
});

describe("POST /api/masters/items — withMutationRoute", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await POST(buildPOST(VALID_ITEM))).status).toBe(401);
  });

  it("returns 403 when the user lacks construction.masters.create", async () => {
    setContext(makeUserCtx([]));
    expect((await POST(buildPOST(VALID_ITEM))).status).toBe(403);
  });

  it("returns 400 when name is missing", async () => {
    setContext(makeAdminCtx());
    const res = await POST(buildPOST({ uomCode: "BAG" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("creates an item scoped to the org and returns 201", async () => {
    setContext(makeAdminCtx());
    // ensureDefaultItemGroup → findFirst (miss) → create
    db.cnItemGroup.findFirst.mockResolvedValue(null);
    db.cnItemGroup.create.mockResolvedValue({ id: "g1" });
    // ensureUOM (uomCode path) → findFirst (miss) → create
    db.cnUOM.findFirst.mockResolvedValue(null);
    db.cnUOM.create.mockResolvedValue({ id: "u1" });
    // nextItemCodeSeq scans existing codes
    db.cnItem.findMany.mockResolvedValue([]);
    db.cnItem.create.mockResolvedValue({
      id: "i1",
      orgId: TEST_TENANT,
      code: "CB-001",
      name: "Cement Bag",
      groupId: "g1",
      group: { id: "g1", name: "Building Materials" },
      uomId: "u1",
      uom: { id: "u1", code: "BAG", name: "BAG" },
      uomIds: ["u1"],
      status: "active",
      createdBy: TEST_USER,
      updatedBy: TEST_USER,
    });
    db.cnUOM.findMany.mockResolvedValue([{ id: "u1", code: "BAG" }]);

    const res = await POST(buildPOST(VALID_ITEM));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("i1");
    const data = db.cnItem.create.mock.calls[0][0].data;
    expect(data.orgId).toBe(TEST_TENANT);
    expect(data.createdBy).toBe(TEST_USER);
  });

  it("maps a Prisma P2002 to a 409 envelope", async () => {
    setContext(makeAdminCtx());
    db.cnItemGroup.findFirst.mockResolvedValue({ id: "g1" });
    db.cnUOM.findFirst.mockResolvedValue({ id: "u1" });
    db.cnItem.findMany.mockResolvedValue([]);
    db.cnItem.create.mockRejectedValue({ code: "P2002", meta: { target: ["code"] } });
    const res = await POST(buildPOST(VALID_ITEM));
    expect(res.status).toBe(409);
  });
});
