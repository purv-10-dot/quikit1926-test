import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setContext, makeAdminCtx, makeUserCtx, TEST_TENANT, TEST_USER } from "../setup";
import { NextRequest } from "next/server";
import { GET, PUT, DELETE } from "@/app/api/masters/financial-years/[id]/route";

const db = mockDb as any;
const ID = "f1";
const params = { params: { id: ID } };

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/masters/financial-years/${ID}`, {
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

describe("GET /api/masters/financial-years/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await GET(req("GET"), params)).status).toBe(401);
  });

  it("returns 404 when the row is not found in this org", async () => {
    setContext(makeAdminCtx());
    db.cnFinancialYear.findFirst.mockResolvedValue(null);
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
  });

  it("returns the row scoped to the org", async () => {
    setContext(makeAdminCtx());
    db.cnFinancialYear.findFirst.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      label: "FY 2024-25",
      status: "active",
    });
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(ID);
    expect(db.cnFinancialYear.findFirst.mock.calls[0][0].where).toMatchObject({
      id: ID,
      orgId: TEST_TENANT,
    });
  });
});

describe("PUT /api/masters/financial-years/[id]", () => {
  it("returns 401 when unauthenticated", async () => {
    expect((await PUT(req("PUT", { label: "X" }), params)).status).toBe(401);
  });

  it("returns 404 when updating a missing row", async () => {
    setContext(makeAdminCtx());
    db.cnFinancialYear.findFirst.mockResolvedValue(null);
    const res = await PUT(req("PUT", { label: "X" }), params);
    expect(res.status).toBe(404);
  });

  it("updates and stamps updatedBy", async () => {
    setContext(makeAdminCtx());
    db.cnFinancialYear.findFirst.mockResolvedValue({ id: ID });
    db.cnFinancialYear.update.mockResolvedValue({
      id: ID,
      orgId: TEST_TENANT,
      label: "Renamed",
      status: "active",
    });
    const res = await PUT(req("PUT", { label: "Renamed" }), params);
    expect(res.status).toBe(200);
    expect(db.cnFinancialYear.update.mock.calls[0][0].data.updatedBy).toBe(TEST_USER);
  });
});

describe("DELETE /api/masters/financial-years/[id]", () => {
  it("returns 403 when the user lacks construction.masters.delete", async () => {
    setContext(makeUserCtx([]));
    expect((await DELETE(req("DELETE"), params)).status).toBe(403);
  });

  it("soft-deletes (status=deleted) within the org and returns success", async () => {
    setContext(makeAdminCtx());
    db.cnFinancialYear.updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE(req("DELETE"), params);
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
    const call = db.cnFinancialYear.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: ID, orgId: TEST_TENANT });
    expect(call.data.status).toBe("deleted");
  });

  it("returns 404 when nothing was deleted", async () => {
    setContext(makeAdminCtx());
    db.cnFinancialYear.updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE(req("DELETE"), params)).status).toBe(404);
  });
});
