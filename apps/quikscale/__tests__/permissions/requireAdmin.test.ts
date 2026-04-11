import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { createRequireAdmin } from "@quikit/auth/require-admin";
import type { NextAuthOptions } from "next-auth";

const stubAuthOptions = {} as NextAuthOptions;
const requireAdmin = createRequireAdmin(stubAuthOptions);

const USER = "user-1";
const TENANT = "tenant-1";

beforeEach(resetMockDb);

describe("requireAdmin factory", () => {
  it("returns 401 when unauthenticated", async () => {
    setSession(null);
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    const status = (result as any).error.status;
    expect(status).toBe(401);
  });

  it("returns 400 when session has no tenantId", async () => {
    setSession({ id: USER, tenantId: "", role: "admin" });
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(400);
  });

  it("returns 403 when user has no active membership", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(403);
  });

  it("returns 403 when role is below admin threshold (employee)", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "member" });
    mockDb.membership.findFirst.mockResolvedValue({
      role: "employee",
      userId: USER,
      tenantId: TENANT,
      status: "active",
    } as any);
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(403);
  });

  it("returns 403 when role is manager (below admin)", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "member" });
    mockDb.membership.findFirst.mockResolvedValue({
      role: "manager",
    } as any);
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
  });

  it("returns success for admin role", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      role: "admin",
      userId: USER,
      tenantId: TENANT,
      status: "active",
    } as any);
    const result = await requireAdmin();
    expect("error" in result).toBe(false);
    expect((result as any).userId).toBe(USER);
    expect((result as any).tenantId).toBe(TENANT);
  });

  it("returns success for super_admin role", async () => {
    setSession({ id: USER, tenantId: TENANT, role: "owner" });
    mockDb.membership.findFirst.mockResolvedValue({
      role: "super_admin",
    } as any);
    const result = await requireAdmin();
    expect("error" in result).toBe(false);
  });
});
