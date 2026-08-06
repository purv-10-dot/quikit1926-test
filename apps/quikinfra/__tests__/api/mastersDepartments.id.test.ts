import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/masters/departments/[id]/route";

const db = mockDb as any;
const ID = "d1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/masters/departments/${ID}`, {
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

describe("GET /api/masters/departments/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the row is not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnDepartment.findFirst.mockResolvedValue(null);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
  });

  it("returns the row scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnDepartment.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      code: "DEP-001",
      name: "Civil",
      status: "active",
    });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnDepartment.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

describe("PUT /api/masters/departments/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", { name: "X" }), params)).status).toBe(401);
  });

  // The department update handler gates on the permission matrix
  // (org.department/edit) rather than the construction.org_department.edit key.
  it("returns 403 when the permission matrix denies edit", async () => {
    setContext(
      makeUserCtx([], { permissionMatrix: { "org.department": { edit: false } } }),
    );
    expect((await PUT(req("PUT", { name: "X" }), params)).status).toBe(403);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnDepartment.findFirst.mockResolvedValue(null);
    const res = await PUT(req("PUT", { name: "X" }), params);
    expect(res.status).toBe(404);
  });

  it("updates and stamps updatedBy", async () => {
    setContext(makeAdminCtx());
    db.cnDepartment.findFirst.mockResolvedValue({ id: ID });
    db.cnDepartment.update.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      code: "DEP-001",
      name: "Renamed",
      status: "active",
    });
    const res = await PUT(req("PUT", { name: "Renamed" }), params);
    expect(res.status).toBe(200);
    expect(db.cnDepartment.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});

describe("DELETE /api/masters/departments/[id]", () => {
  it("returns 403 when the user lacks construction.org_department.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("soft-deletes (status=deleted) within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnDepartment.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const call = db.cnDepartment.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: ID, orgId: TEST_TENANT });
    expect(call.data.status).toBe("deleted");
  });

  it("returns 404 when nothing was deleted", async () => {
    setContext(makeAdminCtx());
    db.cnDepartment.updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });
});
