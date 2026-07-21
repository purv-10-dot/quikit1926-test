import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { makeReq } from "../helpers/req";
import { setSession } from "../setup";

import { DELETE as DELETE_BASE } from "@/app/api/base-categories/[id]/route";
import { DELETE as DELETE_CAT } from "@/app/api/categories/[id]/route";

/** Configure the RBAC gate to allow only the actions for which `allow` is true. */
function grant(allow: (action: string) => boolean) {
  mockDb.app.findUnique.mockResolvedValue({ id: "app" } as never);
  mockDb.astRolePermission.findFirst.mockImplementation((args) => {
    const action = (args as { where?: { action?: string } })?.where?.action;
    return Promise.resolve(action && allow(action) ? { id: "perm" } : null) as never;
  });
  mockDb.astUserPermissionExtra.findFirst.mockResolvedValue(null as never);
}
const grantAll = () => grant(() => true);

const ADMIN = { id: "admin", orgId: "org1", role: "admin" as const };

describe("DELETE /api/base-categories/[id] — referenced-guard", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await DELETE_BASE(makeReq("/api/base-categories/b1", { method: "DELETE" }), { params: { id: "b1" } });
    expect(res.status).toBe(401);
  });

  it("409s (not 500) when assets still reference the base category", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astBaseCategory.findFirst.mockResolvedValue({ id: "b1", name: "IT Equipment" } as never);
    mockDb.astAsset.count.mockResolvedValue(9 as never);

    const res = await DELETE_BASE(makeReq("/api/base-categories/b1", { method: "DELETE" }), { params: { id: "b1" } });
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("9 assets");
    expect(mockDb.astBaseCategory.delete).not.toHaveBeenCalled();
  });

  it("deletes an empty base category (no assets)", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astBaseCategory.findFirst.mockResolvedValue({ id: "b1", name: "Subscriptions" } as never);
    mockDb.astAsset.count.mockResolvedValue(0 as never);
    mockDb.astBaseCategory.delete.mockResolvedValue({ id: "b1" } as never);

    const res = await DELETE_BASE(makeReq("/api/base-categories/b1", { method: "DELETE" }), { params: { id: "b1" } });
    expect(res.status).toBe(200);
    expect(mockDb.astBaseCategory.delete).toHaveBeenCalledWith({ where: { id: "b1" } });
  });

  it("404s + scopes the lookup to the caller's org (tenant isolation)", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astBaseCategory.findFirst.mockResolvedValue(null as never);
    const res = await DELETE_BASE(makeReq("/api/base-categories/b1", { method: "DELETE" }), { params: { id: "b1" } });
    expect(res.status).toBe(404);
    const call = mockDb.astBaseCategory.findFirst.mock.calls[0]?.[0] as { where: { orgId: string } };
    expect(call.where.orgId).toBe("org1");
    expect(mockDb.astAsset.count).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/categories/[id] — referenced-guard", () => {
  beforeEach(() => resetMockDb());

  it("401s when unauthenticated", async () => {
    setSession(null);
    const res = await DELETE_CAT(makeReq("/api/categories/c1", { method: "DELETE" }), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("409s (not 500) when assets still reference the category", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astCategory.findFirst.mockResolvedValue({ id: "c1", name: "Laptops" } as never);
    mockDb.astAsset.count.mockResolvedValue(4 as never);

    const res = await DELETE_CAT(makeReq("/api/categories/c1", { method: "DELETE" }), { params: { id: "c1" } });
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("4 assets");
    expect(mockDb.astCategory.delete).not.toHaveBeenCalled();
  });

  it("deletes an empty category (no assets)", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astCategory.findFirst.mockResolvedValue({ id: "c1", name: "SaaS" } as never);
    mockDb.astAsset.count.mockResolvedValue(0 as never);
    mockDb.astCategory.delete.mockResolvedValue({ id: "c1" } as never);

    const res = await DELETE_CAT(makeReq("/api/categories/c1", { method: "DELETE" }), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(mockDb.astCategory.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });

  it("uses a singular message for exactly one asset", async () => {
    setSession(ADMIN);
    grantAll();
    mockDb.astCategory.findFirst.mockResolvedValue({ id: "c1", name: "Laptop" } as never);
    mockDb.astAsset.count.mockResolvedValue(1 as never);

    const res = await DELETE_CAT(makeReq("/api/categories/c1", { method: "DELETE" }), { params: { id: "c1" } });
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("1 asset ");
  });
});
