import { describe, it, expect, beforeEach, vi } from "vitest";
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

  it("returns 400 when session has no orgId", async () => {
    setSession({ id: USER, orgId: "", role: "admin" });
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(400);
  });

  it("returns 403 when user has no active membership", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue(null);
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(403);
  });

  it("returns 403 when role is below admin threshold (employee)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "employee",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(403);
  });

  it("returns 403 when role is manager (below admin)", async () => {
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "manager",
    } as any);
    const result = await requireAdmin();
    expect("error" in result).toBe(true);
  });

  it("returns success for admin role", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "admin",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);
    const result = await requireAdmin();
    expect("error" in result).toBe(false);
    expect((result as any).userId).toBe(USER);
    expect((result as any).orgId).toBe(TENANT);
  });

  it("returns success for super_admin role", async () => {
    setSession({ id: USER, orgId: TENANT, role: "owner" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "super_admin",
    } as any);
    const result = await requireAdmin();
    expect("error" in result).toBe(false);
  });
});

// Regression: dual-role system. A user promoted to admin via dynamic-RBAC v2
// (Org Setup → User Management) keeps OrgMember.role = "member", so the legacy
// tier check 403s them. The injected extraAdminCheck must rescue exactly that
// case without weakening the session / membership / 403-without-grant guards.
describe("requireAdmin — extraAdminCheck (v2 dual-role bridge)", () => {
  it("promotes a legacy non-admin when extraAdminCheck resolves true", async () => {
    const extraAdminCheck = vi.fn().mockResolvedValue(true);
    const guard = createRequireAdmin(stubAuthOptions, { extraAdminCheck });
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "member",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);

    const result = await guard();

    expect("error" in result).toBe(false);
    expect((result as any).userId).toBe(USER);
    expect((result as any).orgId).toBe(TENANT);
    expect(extraAdminCheck).toHaveBeenCalledWith({ userId: USER, orgId: TENANT });
  });

  it("still 403s a legacy non-admin when extraAdminCheck resolves false", async () => {
    const extraAdminCheck = vi.fn().mockResolvedValue(false);
    const guard = createRequireAdmin(stubAuthOptions, { extraAdminCheck });
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "member",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);

    const result = await guard();

    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(403);
  });

  it("fails closed (403) when extraAdminCheck throws", async () => {
    const extraAdminCheck = vi.fn().mockRejectedValue(new Error("db down"));
    const guard = createRequireAdmin(stubAuthOptions, { extraAdminCheck });
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "member",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);

    const result = await guard();

    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(403);
  });

  it("does not consult extraAdminCheck when the legacy tier already passes", async () => {
    const extraAdminCheck = vi.fn().mockResolvedValue(false);
    const guard = createRequireAdmin(stubAuthOptions, { extraAdminCheck });
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      role: "admin",
      userId: USER,
      orgId: TENANT,
      status: "active",
    } as any);

    const result = await guard();

    expect("error" in result).toBe(false);
    expect(extraAdminCheck).not.toHaveBeenCalled();
  });

  it("never reaches extraAdminCheck without an active membership", async () => {
    const extraAdminCheck = vi.fn().mockResolvedValue(true);
    const guard = createRequireAdmin(stubAuthOptions, { extraAdminCheck });
    setSession({ id: USER, orgId: TENANT, role: "member" });
    mockDb.orgMember.findFirst.mockResolvedValue(null);

    const result = await guard();

    expect("error" in result).toBe(true);
    expect((result as any).error.status).toBe(403);
    expect(extraAdminCheck).not.toHaveBeenCalled();
  });
});
