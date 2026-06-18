import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/masters/tds/[id]/route";

const db = mockDb as any;
const ID = "t1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/masters/tds/${ID}`, {
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

describe("GET /api/masters/tds/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the row is not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnTDSCode.findFirst.mockResolvedValue(null);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
  });

  it("returns the row scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnTDSCode.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      section: "194C",
      description: "X",
      rate: "2",
      status: "active",
    });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnTDSCode.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

describe("PUT /api/masters/tds/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", { description: "X" }), params)).status).toBe(401);
  });

  it("returns 403 when the permission matrix denies edit", async () => {
    setContext(
      makeUserCtx([], { permissionMatrix: { "org.tds": { edit: false } } }),
    );
    expect((await PUT(req("PUT", { description: "X" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnTDSCode.findFirst.mockResolvedValue(null);
    const res = await PUT(req("PUT", { description: "X" }), params);
    expect(res.status).toBe(404);
  });

  it("updates and stamps updatedBy", async () => {
    setContext(makeAdminCtx());
    db.cnTDSCode.findFirst.mockResolvedValue({ id: ID });
    db.cnTDSCode.update.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      section: "194C",
      description: "Renamed",
      rate: "2",
      status: "active",
    });
    const res = await PUT(req("PUT", { description: "Renamed" }), params);
    expect(res.status).toBe(200);
    expect(db.cnTDSCode.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});

describe("DELETE /api/masters/tds/[id]", () => {
  it("returns 403 when the user lacks construction.masters.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("soft-deletes (status=inactive) within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnTDSCode.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const call = db.cnTDSCode.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: ID, orgId: TEST_TENANT });
    expect(call.data.status).toBe("inactive");
  });

  it("returns 404 when nothing was deleted", async () => {
    setContext(makeAdminCtx());
    db.cnTDSCode.updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });
});
