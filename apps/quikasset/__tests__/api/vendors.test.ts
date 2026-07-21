import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { GET, POST } from "@/app/api/vendors/route";
import { PUT, DELETE } from "@/app/api/vendors/[id]/route";

function grant(allow: (action: string) => boolean) {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action && allow(action) ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
const grantAll = () => grant(() => true);
const grantViewOnly = () => grant((a) => a === "view");

const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };
const MEMBER = { id: "u1", orgId: "org1", role: "member" as const, email: "u1@x.com" };
const dataOf = (call: unknown) => (call as { data: Record<string, unknown> }).data;
const body = (over: Record<string, unknown> = {}) => ({
  name: "Acme IT Services", contactPerson: "Jane Doe", phone: "555-1000",
  email: "ops@acme.example", address: "12 Market St", status: "Active", ...over,
});

describe("GET /api/vendors", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await GET(makeReq("/api/vendors"), { params: {} });
    expect(res.status).toBe(401);
  });

  it("403s a caller without Vendor:view", async () => {
    setSession(MEMBER);
    grant(() => false);
    const res = await GET(makeReq("/api/vendors"), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astVendor.findMany).not.toHaveBeenCalled();
  });

  it("returns the org's vendors, scoped to org", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astVendor.findMany.mockResolvedValue([{ id: "v1", name: "Acme" }] as never);
    const res = await GET(makeReq("/api/vendors"), { params: {} });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data).toHaveLength(1);
    const call = mockDb.astVendor.findMany.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org1");
  });

  it("applies the ?status=Active filter (repair picker)", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astVendor.findMany.mockResolvedValue([] as never);
    await GET(makeReq("/api/vendors?status=Active"), { params: {} });
    const call = mockDb.astVendor.findMany.mock.calls[0]?.[0] as { where: { status?: string } };
    expect(call.where.status).toBe("Active");
  });

  it("400s an invalid status filter", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await GET(makeReq("/api/vendors?status=Bogus"), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astVendor.findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/vendors", () => {
  beforeEach(() => resetMockDb());

  it("403s a caller without Vendor:create", async () => {
    setSession(MEMBER);
    grantViewOnly();
    const res = await POST(makeReq("/api/vendors", { method: "POST", body: body() }), { params: {} });
    expect(res.status).toBe(403);
    expect(mockDb.astVendor.create).not.toHaveBeenCalled();
  });

  it("400s a missing name", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await POST(makeReq("/api/vendors", { method: "POST", body: body({ name: "" }) }), { params: {} });
    expect(res.status).toBe(400);
    expect(mockDb.astVendor.create).not.toHaveBeenCalled();
  });

  it("400s an invalid email", async () => {
    setSession(ADMIN);
    grantAll();
    const res = await POST(makeReq("/api/vendors", { method: "POST", body: body({ email: "not-an-email" }) }), { params: {} });
    expect(res.status).toBe(400);
  });

  it("201s and creates an org-scoped vendor (blank email coerced to null)", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astVendor.create.mockResolvedValue({ id: "v1", name: "Acme IT Services" } as never);
    const res = await POST(makeReq("/api/vendors", { method: "POST", body: body({ email: "" }) }), { params: {} });
    expect(res.status).toBe(201);
    const d = dataOf(mockDb.astVendor.create.mock.calls[0]?.[0]);
    expect(d).toMatchObject({ orgId: "org1", name: "Acme IT Services", status: "Active", email: null });
  });
});

describe("PUT/DELETE /api/vendors/[id]", () => {
  beforeEach(() => resetMockDb());

  it("PUT 404s a vendor in another org (tenant isolation)", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astVendor.findFirst.mockResolvedValue(null as never);
    const res = await PUT(makeReq("/api/vendors/v9", { method: "PUT", body: body() }), { params: { id: "v9" } });
    expect(res.status).toBe(404);
    expect(mockDb.astVendor.update).not.toHaveBeenCalled();
    const call = mockDb.astVendor.findFirst.mock.calls[0]?.[0] as { where: { id: string; orgId: string } };
    expect(call.where).toMatchObject({ id: "v9", orgId: "org1" });
  });

  it("PUT 200s a valid update", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astVendor.findFirst.mockResolvedValue({ id: "v1" } as never);
    mockDb.astVendor.update.mockResolvedValue({ id: "v1", name: "Acme (renamed)" } as never);
    const res = await PUT(makeReq("/api/vendors/v1", { method: "PUT", body: body({ name: "Acme (renamed)" }) }), { params: { id: "v1" } });
    expect(res.status).toBe(200);
    expect(dataOf(mockDb.astVendor.update.mock.calls[0]?.[0]).name).toBe("Acme (renamed)");
  });

  it("DELETE 200s and removes the vendor", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astVendor.findFirst.mockResolvedValue({ id: "v1", name: "Acme" } as never);
    mockDb.astVendor.delete.mockResolvedValue({} as never);
    const res = await DELETE(makeReq("/api/vendors/v1", { method: "DELETE" }), { params: { id: "v1" } });
    expect(res.status).toBe(200);
    expect(mockDb.astVendor.delete).toHaveBeenCalled();
  });

  it("DELETE 404s a missing vendor", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astVendor.findFirst.mockResolvedValue(null as never);
    const res = await DELETE(makeReq("/api/vendors/v9", { method: "DELETE" }), { params: { id: "v9" } });
    expect(res.status).toBe(404);
    expect(mockDb.astVendor.delete).not.toHaveBeenCalled();
  });
});
