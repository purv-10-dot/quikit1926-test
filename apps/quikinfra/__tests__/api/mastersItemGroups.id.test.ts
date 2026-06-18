import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/masters/item-groups/[id]/route";

const db = mockDb as any;
const ID = "g1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/masters/item-groups/${ID}`, {
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

describe("GET /api/masters/item-groups/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the row is not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnItemGroup.findFirst.mockResolvedValue(null);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
  });

  it("returns the row scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnItemGroup.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      name: "Cement",
      parentId: null,
      depth: 0,
      sortOrder: 0,
      status: "active",
    });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnItemGroup.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

describe("PUT /api/masters/item-groups/[id]", () => {
  it("returns 403 when the user lacks construction.masters.edit", async () => {
    setContext(makeUserCtx([]));
    expect((await PUT(req("PUT", { name: "X" }), params)).status).toBe(403);
  });

  it("returns 403 when the permission matrix denies edit", async () => {
    setContext(
      makeUserCtx(["construction.masters.edit"], {
        permissionMatrix: { "master.item_group": { edit: false } },
      }),
    );
    expect((await PUT(req("PUT", { name: "X" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnItemGroup.findFirst.mockResolvedValue(null);
    const res = await PUT(req("PUT", { name: "X" }), params);
    expect(res.status).toBe(404);
  });

  it("updates and stamps updatedBy", async () => {
    setContext(makeAdminCtx());
    db.cnItemGroup.findFirst.mockResolvedValue({ id: ID, parentId: null });
    db.cnItemGroup.update.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      name: "Renamed",
      parentId: null,
      depth: 0,
      sortOrder: 0,
      status: "active",
    });
    const res = await PUT(req("PUT", { name: "Renamed" }), params);
    expect(res.status).toBe(200);
    expect(db.cnItemGroup.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});

describe("DELETE /api/masters/item-groups/[id]", () => {
  it("returns 403 when the user lacks construction.masters.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("soft-deletes (status=inactive) within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnItemGroup.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const call = db.cnItemGroup.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: ID, orgId: TEST_TENANT });
    expect(call.data.status).toBe("inactive");
  });

  it("returns 404 when nothing was deleted", async () => {
    setContext(makeAdminCtx());
    db.cnItemGroup.updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });
});
